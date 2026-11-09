import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from '../models/env';
import { buildGrantMailId, sendSystemGrantMails } from './grantService';
import { createWsMessage, MessageType, NoticeAction } from '../models/ws';
import { getRuntimeEnv } from '../utils/runtimeEnv';
import {
  normalizeNotificationGrants,
  notificationGrantToMailGrant,
  safeParseJson,
  validateNotificationGrants,
  type NotificationGrant,
} from './notificationGrantService';

/**
 * 通知管理 · 玩家升级通知
 *
 * 职责：
 * 1. 读写 PLAYER_LEVEL_UP 通知配置（启用状态 / 标题 / 内容 / 发放内容）。
 * 2. 在角色升级成功后写入 level_up_events Outbox（与升级 UPDATE 同批提交）。
 * 3. 读取 Outbox 后按配置发送即时通知，并通过现有系统邮件服务创建带附件的奖励邮件。
 * 4. 以 event_id 作为奖励邮件幂等键，保证同一级升级不会重复发奖。
 *
 * 重要边界：
 * - 不直接修改玩家背包。发放内容只写入 mail_attachments，玩家在邮箱点击领取后
 *   才由 grantService 写入 inventory / party_members / players 资产。
 * - 发放内容支持道具 / 角色 / 货币三类，复用 grantService 的完整链路。
 * - 道具名称、类型、品质全部由 item_templates 提供，角色由 npc_templates 提供，
 *   绝不信任前端提交的名称。
 * - 动态变量仅替换已注册的 {playerName} / {oldLevel} / {newLevel}，不执行任意表达式。
 * - 历史数据中的 [{ itemId, quantity }] 会按道具发放自动兼容。
 */

export const PLAYER_LEVEL_UP_EVENT_CODE = 'PLAYER_LEVEL_UP' as const;

/** 升级奖励的发放内容：与系统发放（grantService）保持同一套类型 */
export type LevelUpGrant = NotificationGrant;

export interface LevelUpNotificationConfig {
  enabled: boolean;
  eventCode: typeof PLAYER_LEVEL_UP_EVENT_CODE;
  title: string;
  content: string;
  /** 发放内容：道具 / 角色 / 货币，可为空 */
  grants: LevelUpGrant[];
  updatedBy?: string | null;
  updatedAt?: string | null;
}

export interface LevelUpNotificationVariables {
  playerName: string;
  oldLevel: number;
  newLevel: number;
}

export interface LevelUpEventRecord {
  event_id: string;
  player_id: string;
  player_name: string;
  old_level: number;
  new_level: number;
  status: string;
  attempts: number;
  notification_sent: number;
  mail_id?: string | null;
  last_error?: string | null;
}

export interface ProcessedLevelUpNotification {
  eventId: string;
  playerId: string;
  playerName: string;
  oldLevel: number;
  newLevel: number;
  title: string;
  content: string;
  delivered: boolean;
  mailId?: string | null;
}

export interface ProcessLevelUpEventsResult {
  processed: number;
  failed: number;
  skipped: number;
  notifications: ProcessedLevelUpNotification[];
  errors: Array<{ eventId: string; message: string }>;
}

export const DEFAULT_LEVEL_UP_NOTIFICATION_CONFIG: LevelUpNotificationConfig = {
  enabled: true,
  eventCode: PLAYER_LEVEL_UP_EVENT_CODE,
  title: '恭喜升级！',
  content: '恭喜少侠 {playerName}，成功提升至 Lv.{newLevel}！',
  grants: [],
};

/** 后台展示的可用变量清单：仅这些变量会被替换 */
export const LEVEL_UP_NOTIFICATION_VARIABLES = [
  { token: '{playerName}', label: '玩家名称', sample: '暮云清歌' },
  { token: '{oldLevel}', label: '升级前等级', sample: '4' },
  { token: '{newLevel}', label: '升级后等级', sample: '5' },
] as const;

/** 固定业务规则，后台只读展示，不参与配置存储 */
export const PLAYER_LEVEL_UP_FIXED_RULES = {
  eventName: '玩家升级通知',
  eventCode: PLAYER_LEVEL_UP_EVENT_CODE,
  triggerCondition: '每次升级',
  action: '即时通知',
  target: '当前升级玩家',
} as const;

interface NotificationConfigRow {
  event_code: string;
  enabled: number;
  title: string;
  content: string;
  reward_items_json: string;
  updated_by?: string | null;
  updated_at?: string | null;
}

interface LevelUpEventRow extends LevelUpEventRecord {}

const REWARD_MAIL_SENDER = '天道宗师 (GM)';
const REWARD_MAIL_TITLE = '【升级奖励】仙途嘉奖';

/**
 * 读取配置。若迁移尚未执行或记录缺失，回落到内置默认配置，
 * 保证升级事件不会因为配置行缺失而完全静默。
 */
export async function getLevelUpNotificationConfig(
  db: D1Database
): Promise<LevelUpNotificationConfig> {
  const row = await db
    .prepare(
      `SELECT event_code, enabled, title, content, reward_items_json, updated_by, updated_at
       FROM notification_configs
       WHERE event_code = ?`
    )
    .bind(PLAYER_LEVEL_UP_EVENT_CODE)
    .first<NotificationConfigRow>();

  if (!row) {
    return { ...DEFAULT_LEVEL_UP_NOTIFICATION_CONFIG, grants: [] };
  }

  return {
    eventCode: PLAYER_LEVEL_UP_EVENT_CODE,
    enabled: Number(row.enabled) === 1,
    title: String(row.title || ''),
    content: String(row.content || ''),
    grants: normalizeNotificationGrants(safeParseJson(row.reward_items_json)),
    updatedBy: row.updated_by || null,
    updatedAt: row.updated_at || null,
  };
}

/**
 * 保存配置（后台管理员入口）。
 * 所有校验均在服务端重新执行，前端表单校验只作为交互提示。
 *
 * 发放内容支持三类：
 * - ITEM：道具必须存在于 item_templates，数量 1–99999，同一道具不允许重复；
 * - COMPANION：角色必须存在于 npc_templates（id 或 key），等级 1–9999；
 * - CURRENCY：纹银 / 元宝 / 铜钱均为非负整数，且至少填写一种。
 */
export async function saveLevelUpNotificationConfig(
  db: D1Database,
  input: {
    enabled?: unknown;
    title?: unknown;
    content?: unknown;
    /** 发放内容：[{ type: 'ITEM' | 'COMPANION' | 'CURRENCY', ... }] */
    grants?: unknown;
    /** 兼容旧调用方的字段名，等价于 grants */
    rewardItems?: unknown;
  },
  updatedBy?: string
): Promise<LevelUpNotificationConfig> {
  const enabled =
    input.enabled === true ||
    input.enabled === 1 ||
    input.enabled === '1' ||
    input.enabled === 'true';

  const title = String(input.title ?? '').trim();
  if (!title) {
    throw new Error('通知标题不能为空');
  }
  if (title.length > 64) {
    throw new Error('通知标题不能超过 64 个字符');
  }

  const content = String(input.content ?? '').trim();
  if (!content) {
    throw new Error('通知内容不能为空');
  }
  if (content.length > 1000) {
    throw new Error('通知内容不能超过 1000 个字符');
  }

  const rawGrants = input.grants ?? input.rewardItems;
  const grants = await validateNotificationGrants(db, rawGrants);

  await db
    .prepare(
      `INSERT INTO notification_configs
         (event_code, enabled, title, content, reward_items_json, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(event_code) DO UPDATE SET
         enabled = excluded.enabled,
         title = excluded.title,
         content = excluded.content,
         reward_items_json = excluded.reward_items_json,
         updated_by = excluded.updated_by,
         updated_at = CURRENT_TIMESTAMP`
    )
    .bind(
      PLAYER_LEVEL_UP_EVENT_CODE,
      enabled ? 1 : 0,
      title,
      content,
      JSON.stringify(grants),
      updatedBy || 'SYSTEM'
    )
    .run();

  return getLevelUpNotificationConfig(db);
}

/** 恢复默认配置：启用、默认文案、空发放内容 */
export async function resetLevelUpNotificationConfig(
  db: D1Database,
  updatedBy?: string
): Promise<LevelUpNotificationConfig> {
  return saveLevelUpNotificationConfig(
    db,
    {
      enabled: DEFAULT_LEVEL_UP_NOTIFICATION_CONFIG.enabled,
      title: DEFAULT_LEVEL_UP_NOTIFICATION_CONFIG.title,
      content: DEFAULT_LEVEL_UP_NOTIFICATION_CONFIG.content,
      grants: [],
    },
    updatedBy
  );
}

/**
 * 仅替换已注册变量。未知 {xxx} 保持原样，绝不执行表达式或二次解析。
 */
export function renderLevelUpNotification(
  config: Pick<LevelUpNotificationConfig, 'title' | 'content'>,
  variables: LevelUpNotificationVariables
): { title: string; content: string } {
  const replacements: Record<string, string> = {
    '{playerName}': String(variables.playerName || ''),
    '{oldLevel}': String(variables.oldLevel),
    '{newLevel}': String(variables.newLevel),
  };

  const replace = (text: string) =>
    String(text || '').replace(/\{(playerName|oldLevel|newLevel)\}/g, (token) => {
      return replacements[token] ?? token;
    });

  return {
    title: replace(config.title),
    content: replace(config.content),
  };
}

function levelUpEventId(playerId: string, level: number): string {
  return `lvlup_${playerId}_${level}`;
}

/**
 * 构建升级事件插入语句。
 *
 * 关键点：使用 INSERT ... SELECT ... WHERE EXISTS(players.level = postLevel AND players.exp = remainingExp)
 * 让事件插入与升级 UPDATE 在同一 D1 batch 中原子执行，同时避免乐观锁失败时写入假事件。
 */
export function buildLevelUpEventStatements(
  db: D1Database,
  params: {
    playerId: string;
    playerName: string;
    oldLevel: number;
    newLevel: number;
    remainingExp: number;
  }
): { statements: D1PreparedStatement[]; eventIds: string[] } {
  const fromLevel = Math.max(0, Math.trunc(params.oldLevel));
  const toLevel = Math.max(fromLevel, Math.trunc(params.newLevel));
  const eventIds: string[] = [];

  for (let level = fromLevel + 1; level <= toLevel; level++) {
    eventIds.push(levelUpEventId(params.playerId, level));
  }

  if (eventIds.length === 0) {
    return { statements: [], eventIds: [] };
  }

  // 一条递归 CTE 语句批量写入本次升级涉及的所有等级事件，
  // 避免一次连升过多等级时构造上百条 SQL；同时仍与升级 UPDATE 同批提交。
  const statement = db
    .prepare(
      `WITH RECURSIVE levels(level) AS (
         SELECT CAST(? AS INTEGER)
         UNION ALL
         SELECT level + 1 FROM levels WHERE level < CAST(? AS INTEGER)
       )
       INSERT OR IGNORE INTO level_up_events
         (event_id, player_id, player_name, old_level, new_level, status, created_at)
       SELECT
         'lvlup_' || ? || '_' || CAST(level AS INTEGER),
         ?, ?,
         CAST(level AS INTEGER) - 1,
         CAST(level AS INTEGER),
         'PENDING',
         CURRENT_TIMESTAMP
       FROM levels
       WHERE EXISTS (
         SELECT 1 FROM players
         WHERE id = ? AND level = CAST(? AS INTEGER) AND exp = CAST(? AS INTEGER)
       )`
    )
    .bind(
      fromLevel + 1,
      toLevel,
      params.playerId,
      params.playerId,
      params.playerName,
      params.playerId,
      toLevel,
      params.remainingExp
    );

  return { statements: [statement], eventIds };
}

/** 查询某玩家当前待处理的事件 ID（用于同步失败后的队列重试） */
export async function getPendingLevelUpEventIds(
  db: D1Database,
  playerId: string,
  limit = 50
): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT event_id FROM level_up_events
       WHERE player_id = ?
         AND (
           status = 'PENDING'
           OR (
             status = 'PROCESSING'
             AND (locked_at IS NULL OR locked_at < datetime('now', '-5 minutes'))
           )
         )
       ORDER BY new_level ASC
       LIMIT ?`
    )
    .bind(playerId, Math.max(1, Math.min(200, limit)))
    .all<{ event_id: string }>();

  return (results || []).map((row) => row.event_id);
}

/** 把待处理事件投递到 Cloudflare Queues；队列消费者会做幂等重试 */
export async function enqueueLevelUpEvents(
  env: Env | null,
  eventIds: string[]
): Promise<boolean> {
  if (!env || eventIds.length === 0) return false;

  const queue = (env as Env & { GAME_EVENT_QUEUE?: Queue }).GAME_EVENT_QUEUE;
  if (!queue || typeof queue.send !== 'function') return false;

  try {
    await queue.send({
      type: 'PLAYER_LEVEL_UP',
      eventIds: Array.from(new Set(eventIds)),
    });
    return true;
  } catch (err) {
    console.warn('[LevelUpNotification] 事件入队失败，保留 Outbox 等待下次重试:', err);
    return false;
  }
}

/**
 * 通用 WebSocket 即时通知投递。
 * 供升级通知、剧情节点触发器等所有「通知管理」事件复用。
 */
export async function deliverNotificationToast(
  env: Env | null,
  playerId: string,
  title: string,
  content: string,
  options: { duration?: number; level?: string } = {}
): Promise<boolean> {
  const namespace = env?.ZONE_DO || env?.MAP_DO;
  if (!namespace) return false;

  const push = async (): Promise<boolean> => {
    try {
      const stub = namespace.get(namespace.idFromName('global_game_world'));
      const res = await stub.fetch('http://do/sendTo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId,
          message: createWsMessage(MessageType.NOTICE, NoticeAction.TOAST, {
            title,
            content,
            level: options.level || 'info',
            duration: options.duration ?? 4200,
          }),
        }),
      });

      if (!res.ok) return false;
      const data = (await res.json().catch(() => ({}))) as { delivered?: boolean };
      return Boolean(data.delivered);
    } catch (err) {
      console.warn('[Notification] WebSocket 即时通知投递失败:', err);
      return false;
    }
  };

  // 经验服务可能运行在 ZoneDO 内部；加超时避免极端情况下阻塞响应。
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), 1500);
  });

  try {
    return await Promise.race([push(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function deliverLevelUpToast(
  env: Env | null,
  playerId: string,
  title: string,
  content: string
): Promise<boolean> {
  return deliverNotificationToast(env, playerId, title, content);
}

function rewardMailContent(playerName: string, newLevel: number): string {
  return `恭喜道友 ${playerName} 成功提升至 Lv.${newLevel}，特奉上升级贺礼，请查收附件。`;
}

/**
 * 处理指定升级事件。
 *
 * 幂等保证：
 * 1. 先用条件 UPDATE 抢占事件（PENDING -> PROCESSING），同一事件只会被一个处理者拿到；
 * 2. 奖励邮件使用 event_id 作为幂等键，邮件与附件 ID 均确定性生成；
 * 3. 邮件已存在时 INSERT OR IGNORE，不会重复写附件；
 * 4. 邮件失败时事件回退为 PENDING，角色升级本身早已提交，不会回滚。
 */
export async function processLevelUpEvents(
  db: D1Database,
  eventIds: string[],
  options: { env?: Env | null; throwOnError?: boolean; deliverToast?: boolean } = {}
): Promise<ProcessLevelUpEventsResult> {
  const ids = Array.from(new Set(eventIds.filter(Boolean)));
  const result: ProcessLevelUpEventsResult = {
    processed: 0,
    failed: 0,
    skipped: 0,
    notifications: [],
    errors: [],
  };

  if (ids.length === 0) return result;

  const env = options.env ?? getRuntimeEnv();
  const placeholders = ids.map(() => '?').join(',');
  const { results: eventRows } = await db
    .prepare(
      `SELECT event_id, player_id, player_name, old_level, new_level, status,
              attempts, notification_sent, mail_id, last_error
       FROM level_up_events
       WHERE event_id IN (${placeholders})
       ORDER BY new_level ASC`
    )
    .bind(...ids)
    .all<LevelUpEventRow>();

  if (!eventRows || eventRows.length === 0) return result;

  const config = await getLevelUpNotificationConfig(db);

  for (const event of eventRows) {
    if (event.status === 'PROCESSED') {
      result.skipped += 1;
      continue;
    }

    // 抢占事件：超时锁可被重新领取，崩溃后的 PROCESSING 不会永久卡死
    const claim = await db
      .prepare(
        `UPDATE level_up_events
         SET status = 'PROCESSING',
             locked_at = CURRENT_TIMESTAMP,
             attempts = attempts + 1,
             last_error = NULL
         WHERE event_id = ?
           AND (
             status = 'PENDING'
             OR (
               status = 'PROCESSING'
               AND (locked_at IS NULL OR locked_at < datetime('now', '-5 minutes'))
             )
           )`
      )
      .bind(event.event_id)
      .run();

    const claimedChanges = claim?.meta?.changes ?? (claim as any)?.changes;
    if (claimedChanges === 0) {
      result.skipped += 1;
      continue;
    }

    const playerName = String(event.player_name || '修仙者');
    const oldLevel = Number(event.old_level) || 1;
    const newLevel = Number(event.new_level) || oldLevel;

    // 通知未启用：不发送即时通知、不创建奖励邮件、不写附件
    if (!config.enabled) {
      await db
        .prepare(
          `UPDATE level_up_events
           SET status = 'PROCESSED', notification_sent = 0, mail_id = NULL,
               processed_at = CURRENT_TIMESTAMP, locked_at = NULL, last_error = NULL
           WHERE event_id = ?`
        )
        .bind(event.event_id)
        .run();
      result.processed += 1;
      continue;
    }

    const rendered = renderLevelUpNotification(config, {
      playerName,
      oldLevel,
      newLevel,
    });

    // 即时通知与奖励邮件相互独立：
    // - 先发送即时通知，邮件失败也不影响通知送达；
    // - notification_sent 记录已成功投递，重试时不会重复弹 Toast。
    // - deliverToast=false 用于战斗内结算等场景：由现有战斗/对话 Toast 展示，
    //   避免 Durable Object 内部再向自身推送 WebSocket 消息。
    const deliverToast = options.deliverToast !== false;
    let delivered = Number(event.notification_sent) === 1;
    if (!delivered && deliverToast) {
      delivered = await deliverLevelUpToast(
        env,
        event.player_id,
        rendered.title,
        rendered.content
      );

      // 立即落库"通知已送达"，即使后续邮件失败或进程中断，
      // 重试时也不会再次弹出同一条升级通知。
      if (delivered) {
        try {
          await db
            .prepare(
              `UPDATE level_up_events
               SET notification_sent = 1
               WHERE event_id = ?`
            )
            .bind(event.event_id)
            .run();
        } catch (err) {
          // 仅影响重试时的去重精度，不影响本次通知与后续邮件
          console.warn('[LevelUpNotification] 即时通知送达状态写回失败:', err);
        }
      }
    }

    let mailId: string | null = event.mail_id || null;

    // 发放内容为空：只发送即时通知，不创建奖励邮件
    if (config.grants.length > 0 && !mailId) {
      try {
        // 幂等兜底：若上一次已创建邮件但事件最终状态未写回，
        // 直接用确定性邮件 ID 复用，不重复解析附件或追加新附件。
        const expectedMailId = buildGrantMailId(event.event_id, event.player_id);
        const existingMail = await db
          .prepare('SELECT id FROM mails WHERE id = ?')
          .bind(expectedMailId)
          .first<{ id: string }>();

        if (existingMail?.id) {
          mailId = existingMail.id;
        } else {
          const mailResult = await sendSystemGrantMails(db, {
            receiverIds: [event.player_id],
            senderName: REWARD_MAIL_SENDER,
            title: REWARD_MAIL_TITLE,
            content: rewardMailContent(playerName, newLevel),
            expireDays: 30,
            createdBy: PLAYER_LEVEL_UP_EVENT_CODE,
            idempotencyKey: event.event_id,
            grants: config.grants.map(notificationGrantToMailGrant),
          });

          mailId = mailResult.mailIds[0] || null;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // 邮件失败不影响角色升级；事件回退 PENDING 等待队列/下次重试。
        // 已送达的即时通知会保留 notification_sent=1，重试时不再重复弹窗。
        await db
          .prepare(
            `UPDATE level_up_events
             SET status = 'PENDING', notification_sent = ?, locked_at = NULL, last_error = ?
             WHERE event_id = ?`
          )
          .bind(delivered ? 1 : 0, message.slice(0, 500), event.event_id)
          .run();

        result.failed += 1;
        result.errors.push({ eventId: event.event_id, message });
        // 邮件失败时仍把已生成的即时通知文案返回给调用方，
        // 战斗/对话等自带 Toast 的场景可以继续展示，不因邮件异常而静默。
        result.notifications.push({
          eventId: event.event_id,
          playerId: event.player_id,
          playerName,
          oldLevel,
          newLevel,
          title: rendered.title,
          content: rendered.content,
          delivered,
          mailId: null,
        });
        continue;
      }
    }

    await db
      .prepare(
        `UPDATE level_up_events
         SET status = 'PROCESSED',
             notification_sent = ?,
             mail_id = ?,
             processed_at = CURRENT_TIMESTAMP,
             locked_at = NULL,
             last_error = NULL
         WHERE event_id = ?`
      )
      .bind(delivered ? 1 : 0, mailId, event.event_id)
      .run();

    result.processed += 1;
    result.notifications.push({
      eventId: event.event_id,
      playerId: event.player_id,
      playerName,
      oldLevel,
      newLevel,
      title: rendered.title,
      content: rendered.content,
      delivered,
      mailId,
    });
  }

  if (options.throwOnError && result.failed > 0) {
    const first = result.errors[0];
    throw new Error(first?.message || '玩家升级通知处理失败');
  }

  return result;
}

/**
 * 重试某玩家所有待处理事件（同步处理失败后的兜底入口）。
 */
export async function retryPendingLevelUpEvents(
  db: D1Database,
  playerId: string,
  options: { env?: Env | null; throwOnError?: boolean; deliverToast?: boolean } = {}
): Promise<ProcessLevelUpEventsResult> {
  const ids = await getPendingLevelUpEventIds(db, playerId);
  return processLevelUpEvents(db, ids, options);
}
