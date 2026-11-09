import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from '../models/env';
import { deliverNotificationToast } from './levelUpNotificationService';
import { buildGrantMailId, sendSystemGrantMails } from './grantService';
import {
  normalizeNotificationGrants,
  notificationGrantToMailGrant,
  safeParseJson,
  validateNotificationGrants,
  type NotificationGrant,
} from './notificationGrantService';

/**
 * 通知管理 · 剧情节点触发器
 *
 * 数据模型：
 * - story_notifications：剧情通知资产，一套剧本可拥有多条独立通知（可绑定具体节点/进入或完成事件）；
 * - notification_configs.STORY_NODE_TRIGGER：仅作为旧触发器的全局兜底配置；
 * - 节点触发器通过 { type: 'SEND_NOTIFICATION', notificationId } 引用具体通知。
 *
 * 与玩家升级通知保持同一套逻辑：
 * - 通知内容支持已注册变量；
 * - 启用 + 空发放内容：只发即时通知；
 * - 启用 + 有发放内容：即时通知 + 通过系统邮件服务创建奖励邮件；
 * - 关闭：不发通知、不发奖、不建邮件。
 */

export const STORY_NODE_TRIGGER_EVENT_CODE = 'STORY_NODE_TRIGGER' as const;

export interface StoryNotificationConfig {
  enabled: boolean;
  eventCode: typeof STORY_NODE_TRIGGER_EVENT_CODE;
  title: string;
  content: string;
  /** 发放内容：道具 / 角色 / 货币，可为空 */
  grants: NotificationGrant[];
  updatedBy?: string | null;
  updatedAt?: string | null;
}

export interface StoryNotificationVariables {
  playerName: string;
  chapterTitle: string;
  packageName: string;
  nodeId: string;
}

export const DEFAULT_STORY_NOTIFICATION_CONFIG: StoryNotificationConfig = {
  enabled: true,
  eventCode: STORY_NODE_TRIGGER_EVENT_CODE,
  title: '剧情推进',
  content: '少侠在【{chapterTitle}】中的抉择，已引动九州风云。',
  grants: [],
  updatedBy: null,
  updatedAt: null,
};

/**
 * 后台展示的可用变量清单：仅这些变量会参与替换。
 */
export const STORY_NOTIFICATION_VARIABLES = [
  { token: '{playerName}', label: '玩家名称', sample: '暮云清歌' },
  { token: '{chapterTitle}', label: '剧情节点章节', sample: '寒月流光 · 初识' },
  { token: '{packageName}', label: '剧本名称', sample: '寒月流光 · 初识清寒' },
  { token: '{nodeId}', label: '节点 ID', sample: 'node_luoqinghan_01' },
] as const;

/** 固定业务规则，后台只读展示 */
export const STORY_NOTIFICATION_FIXED_RULES = {
  eventName: '剧情通知',
  eventCode: STORY_NODE_TRIGGER_EVENT_CODE,
  triggerCondition: '剧情节点进入 / 完成时',
  action: '即时通知',
  target: '当前触发玩家',
} as const;

interface NotificationConfigRow {
  event_code: string;
  enabled: number;
  title: string;
  content: string;
  reward_items_json?: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
}

const STORY_REWARD_MAIL_SENDER = '天道宗师 (GM)';

export async function getStoryNotificationConfig(
  db: D1Database
): Promise<StoryNotificationConfig> {
  const row = await db
    .prepare(
      `SELECT event_code, enabled, title, content, reward_items_json, updated_by, updated_at
       FROM notification_configs
       WHERE event_code = ?`
    )
    .bind(STORY_NODE_TRIGGER_EVENT_CODE)
    .first<NotificationConfigRow>();

  if (!row) {
    return { ...DEFAULT_STORY_NOTIFICATION_CONFIG, grants: [] };
  }

  return {
    enabled: Number(row.enabled) === 1,
    eventCode: STORY_NODE_TRIGGER_EVENT_CODE,
    title: String(row.title || DEFAULT_STORY_NOTIFICATION_CONFIG.title),
    content: String(row.content || DEFAULT_STORY_NOTIFICATION_CONFIG.content),
    grants: normalizeNotificationGrants(safeParseJson(row.reward_items_json)),
    updatedBy: row.updated_by || null,
    updatedAt: row.updated_at || null,
  };
}

export async function saveStoryNotificationConfig(
  db: D1Database,
  input: { enabled?: unknown; title?: unknown; content?: unknown; grants?: unknown },
  updatedBy?: string
): Promise<StoryNotificationConfig> {
  const enabled =
    input.enabled === true ||
    input.enabled === 1 ||
    input.enabled === '1' ||
    input.enabled === 'true';

  const title = String(input.title ?? '').trim();
  if (!title) throw new Error('通知标题不能为空');
  if (title.length > 64) throw new Error('通知标题不能超过 64 个字符');

  const content = String(input.content ?? '').trim();
  if (!content) throw new Error('通知内容不能为空');
  if (content.length > 1000) throw new Error('通知内容不能超过 1000 个字符');

  const grants = await validateNotificationGrants(db, input.grants ?? []);

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
      STORY_NODE_TRIGGER_EVENT_CODE,
      enabled ? 1 : 0,
      title,
      content,
      JSON.stringify(grants),
      updatedBy || 'SYSTEM'
    )
    .run();

  return getStoryNotificationConfig(db);
}

export async function resetStoryNotificationConfig(
  db: D1Database,
  updatedBy?: string
): Promise<StoryNotificationConfig> {
  return saveStoryNotificationConfig(
    db,
    {
      enabled: DEFAULT_STORY_NOTIFICATION_CONFIG.enabled,
      title: DEFAULT_STORY_NOTIFICATION_CONFIG.title,
      content: DEFAULT_STORY_NOTIFICATION_CONFIG.content,
      grants: [],
    },
    updatedBy
  );
}

/**
 * 仅替换已注册变量。未知 {xxx} 保持原样，不执行任意表达式。
 */
export function renderStoryNotification(
  config: Pick<StoryNotificationConfig, 'title' | 'content'>,
  variables: StoryNotificationVariables
): { title: string; content: string } {
  const replacements: Record<string, string> = {
    '{playerName}': String(variables.playerName || ''),
    '{chapterTitle}': String(variables.chapterTitle || ''),
    '{packageName}': String(variables.packageName || ''),
    '{nodeId}': String(variables.nodeId || ''),
  };

  const replace = (text: string) =>
    String(text || '').replace(/\{(playerName|chapterTitle|packageName|nodeId)\}/g, (token) => {
      return replacements[token] ?? token;
    });

  return {
    title: replace(config.title),
    content: replace(config.content),
  };
}

/**
 * 发放剧情通知奖励：通过现有系统邮件服务创建带附件的奖励邮件。
 * 使用确定性邮件 ID 作为幂等键，同一玩家 / 同一通知重复触发不会重复发奖。
 */
async function deliverStoryRewardMail(
  db: D1Database,
  playerId: string,
  grants: NotificationGrant[],
  options: { idempotencyKey?: string; title: string; content: string }
): Promise<string | null> {
  if (grants.length === 0) return null;

  const idempotencyKey = String(options.idempotencyKey || '').slice(0, 96);
  if (!idempotencyKey) return null;

  // 幂等兜底：若上一次已创建邮件但流程中断，直接用确定性邮件 ID 复用。
  const expectedMailId = buildGrantMailId(idempotencyKey, playerId);
  const existingMail = await db
    .prepare('SELECT id FROM mails WHERE id = ?')
    .bind(expectedMailId)
    .first<{ id: string }>();
  if (existingMail?.id) return existingMail.id;

  const mailResult = await sendSystemGrantMails(db, {
    receiverIds: [playerId],
    senderName: STORY_REWARD_MAIL_SENDER,
    title: options.title,
    content: options.content,
    expireDays: 30,
    createdBy: STORY_NODE_TRIGGER_EVENT_CODE,
    idempotencyKey,
    grants: grants.map(notificationGrantToMailGrant),
  });

  return mailResult.mailIds[0] || null;
}

/**
 * 发送剧情节点通知（全局兜底配置 / 节点内联文案）。
 * 节点触发器可覆盖 title/content/grants；未覆盖时使用后台通知管理配置。
 */
export async function sendStoryNodeNotification(
  env: Env | null,
  db: D1Database,
  playerId: string,
  input: {
    title?: string;
    content?: string;
    /** 内联发放内容；未提供时沿用全局兜底配置的发放内容 */
    grants?: unknown;
    rewardKey?: string;
  },
  variables: StoryNotificationVariables
): Promise<boolean> {
  if (!playerId) return false;

  const config = await getStoryNotificationConfig(db);
  if (!config.enabled) return false;

  const title = String(input.title || '').trim() || config.title;
  const content = String(input.content || '').trim() || config.content;
  const rendered = renderStoryNotification({ title, content }, variables);

  // 触发器显式配置 grants（包括空数组）时以内联配置为准；
  // 旧触发器没有 grants 字段，继续沿用全局兜底配置。
  const grants =
    input.grants === undefined
      ? config.grants
      : normalizeNotificationGrants(input.grants);

  const delivered = await deliverNotificationToast(env, playerId, rendered.title, rendered.content, {
    duration: 5200,
  });

  await deliverStoryRewardMail(db, playerId, grants, {
    idempotencyKey: input.rewardKey || `storycfg_${variables.nodeId || 'global'}`,
    title: rendered.title,
    content: rendered.content,
  });

  return delivered;
}

// ==============================================================================
// 剧情通知资产（story_notifications）
// 一套剧本 / 一个节点可以配置多条独立通知，节点触发器通过 notificationId 引用。
// ==============================================================================

export type StoryTriggerEvent = 'ENTER' | 'COMPLETE' | 'ANY';

export interface StoryNotificationRecord {
  id: string;
  package_id: string;
  node_id: string | null;
  trigger_event: StoryTriggerEvent;
  name: string;
  title: string;
  content: string;
  /** 发放内容：与玩家升级通知使用同一套道具 / 角色 / 货币配置 */
  grants: NotificationGrant[];
  enabled: number;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  package_name?: string | null;
  node_chapter?: string | null;
}

export interface StoryNotificationInput {
  package_id: string;
  node_id?: string | null;
  trigger_event?: string;
  name: string;
  title: string;
  content: string;
  grants?: unknown;
  enabled?: unknown;
}

interface StoryNotificationRow {
  id: string;
  package_id: string;
  node_id: string | null;
  trigger_event: string;
  name: string;
  title: string;
  content: string;
  reward_items_json?: string | null;
  enabled: number;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  package_name?: string | null;
  node_chapter?: string | null;
}

const MAX_NOTIFICATION_NAME = 64;
const MAX_NOTIFICATION_TITLE = 64;
const MAX_NOTIFICATION_CONTENT = 1000;

function normalizeTriggerEvent(raw: unknown): StoryTriggerEvent {
  const value = String(raw || 'ANY').toUpperCase();
  if (value === 'ENTER' || value === 'COMPLETE') return value;
  return 'ANY';
}

function normalizeEnabled(raw: unknown, fallback = true): number {
  if (raw === undefined || raw === null) return fallback ? 1 : 0;
  return raw === true || raw === 1 || raw === '1' || raw === 'true' ? 1 : 0;
}

function mapStoryNotificationRow(row: StoryNotificationRow): StoryNotificationRecord {
  return {
    id: row.id,
    package_id: row.package_id,
    node_id: row.node_id ?? null,
    trigger_event: normalizeTriggerEvent(row.trigger_event),
    name: row.name,
    title: row.title,
    content: row.content,
    grants: normalizeNotificationGrants(safeParseJson(row.reward_items_json)),
    enabled: Number(row.enabled) === 1 ? 1 : 0,
    created_by: row.created_by ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    package_name: row.package_name ?? null,
    node_chapter: row.node_chapter ?? null,
  };
}

async function validateStoryNotificationInput(
  db: D1Database,
  input: StoryNotificationInput
): Promise<{
  packageId: string;
  nodeId: string | null;
  triggerEvent: StoryTriggerEvent;
  name: string;
  title: string;
  content: string;
  grants: NotificationGrant[];
  enabled: number;
}> {
  const packageId = String(input.package_id || '').trim();
  if (!packageId) throw new Error('所属剧本不能为空');

  const pkg = await db
    .prepare('SELECT id FROM dialogue_packages WHERE id = ?')
    .bind(packageId)
    .first<{ id: string }>();
  if (!pkg) throw new Error(`剧本 [${packageId}] 不存在`);

  const nodeId = String(input.node_id || '').trim() || null;
  if (nodeId) {
    const node = await db
      .prepare('SELECT id, package_id FROM dialogue_nodes WHERE id = ?')
      .bind(nodeId)
      .first<{ id: string; package_id: string | null }>();
    if (!node) throw new Error(`剧情节点 [${nodeId}] 不存在`);
    if (node.package_id && node.package_id !== packageId) {
      throw new Error(`节点 [${nodeId}] 不属于剧本 [${packageId}]`);
    }
  }

  const name = String(input.name || '').trim();
  if (!name) throw new Error('通知名称不能为空');
  if (name.length > MAX_NOTIFICATION_NAME) {
    throw new Error(`通知名称不能超过 ${MAX_NOTIFICATION_NAME} 个字符`);
  }

  const title = String(input.title || '').trim();
  if (!title) throw new Error('通知标题不能为空');
  if (title.length > MAX_NOTIFICATION_TITLE) {
    throw new Error(`通知标题不能超过 ${MAX_NOTIFICATION_TITLE} 个字符`);
  }

  const content = String(input.content || '').trim();
  if (!content) throw new Error('通知正文不能为空');
  if (content.length > MAX_NOTIFICATION_CONTENT) {
    throw new Error(`通知正文不能超过 ${MAX_NOTIFICATION_CONTENT} 个字符`);
  }

  const grants = await validateNotificationGrants(db, input.grants ?? []);

  return {
    packageId,
    nodeId,
    triggerEvent: normalizeTriggerEvent(input.trigger_event),
    name,
    title,
    content,
    grants,
    enabled: normalizeEnabled(input.enabled, true),
  };
}

/**
 * 查询剧情通知列表；可按剧本过滤。
 */
export async function listStoryNotifications(
  db: D1Database,
  packageId?: string | null
): Promise<StoryNotificationRecord[]> {
  const where = packageId ? 'WHERE sn.package_id = ?' : '';
  const statement = db.prepare(
    `SELECT sn.*, p.name AS package_name, dn.chapter_title AS node_chapter
     FROM story_notifications sn
     LEFT JOIN dialogue_packages p ON p.id = sn.package_id
     LEFT JOIN dialogue_nodes dn ON dn.id = sn.node_id
     ${where}
     ORDER BY p.name ASC, sn.created_at DESC`
  );

  const { results } = packageId
    ? await statement.bind(packageId).all<StoryNotificationRow>()
    : await statement.all<StoryNotificationRow>();

  return (results || []).map(mapStoryNotificationRow);
}

export async function createStoryNotification(
  db: D1Database,
  input: StoryNotificationInput,
  createdBy?: string
): Promise<StoryNotificationRecord> {
  const normalized = await validateStoryNotificationInput(db, input);
  const id = `snotif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  await db
    .prepare(
      `INSERT INTO story_notifications
         (id, package_id, node_id, trigger_event, name, title, content, reward_items_json, enabled, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    )
    .bind(
      id,
      normalized.packageId,
      normalized.nodeId,
      normalized.triggerEvent,
      normalized.name,
      normalized.title,
      normalized.content,
      JSON.stringify(normalized.grants),
      normalized.enabled,
      createdBy || 'SYSTEM'
    )
    .run();

  const row = await db
    .prepare(
      `SELECT sn.*, p.name AS package_name, dn.chapter_title AS node_chapter
       FROM story_notifications sn
       LEFT JOIN dialogue_packages p ON p.id = sn.package_id
       LEFT JOIN dialogue_nodes dn ON dn.id = sn.node_id
       WHERE sn.id = ?`
    )
    .bind(id)
    .first<StoryNotificationRow>();

  if (!row) throw new Error('剧情通知创建失败');
  return mapStoryNotificationRow(row);
}

export async function updateStoryNotification(
  db: D1Database,
  id: string,
  input: StoryNotificationInput,
  updatedBy?: string
): Promise<StoryNotificationRecord> {
  const existing = await db
    .prepare('SELECT * FROM story_notifications WHERE id = ?')
    .bind(id)
    .first<StoryNotificationRow>();
  if (!existing) throw new Error('剧情通知不存在');

  const normalized = await validateStoryNotificationInput(db, {
    ...input,
    package_id: input.package_id || existing.package_id,
    name: input.name ?? existing.name,
    title: input.title ?? existing.title,
    content: input.content ?? existing.content,
    grants:
      input.grants ??
      normalizeNotificationGrants(safeParseJson(existing.reward_items_json)),
    enabled: input.enabled ?? existing.enabled,
  });

  await db
    .prepare(
      `UPDATE story_notifications
       SET package_id = ?, node_id = ?, trigger_event = ?, name = ?, title = ?, content = ?,
           reward_items_json = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .bind(
      normalized.packageId,
      normalized.nodeId,
      normalized.triggerEvent,
      normalized.name,
      normalized.title,
      normalized.content,
      JSON.stringify(normalized.grants),
      normalized.enabled,
      id
    )
    .run();

  const row = await db
    .prepare(
      `SELECT sn.*, p.name AS package_name, dn.chapter_title AS node_chapter
       FROM story_notifications sn
       LEFT JOIN dialogue_packages p ON p.id = sn.package_id
       LEFT JOIN dialogue_nodes dn ON dn.id = sn.node_id
       WHERE sn.id = ?`
    )
    .bind(id)
    .first<StoryNotificationRow>();

  if (!row) throw new Error('剧情通知更新失败');
  return mapStoryNotificationRow(row);
}

export async function deleteStoryNotification(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM story_notifications WHERE id = ?').bind(id).run();
}

/**
 * 按通知 ID 投递剧情通知。
 * 节点触发器绑定具体通知后使用本函数；未绑定通知的旧触发器仍走全局兜底配置。
 */
export async function sendStoryNotificationById(
  env: Env | null,
  db: D1Database,
  playerId: string,
  notificationId: string,
  variables: StoryNotificationVariables
): Promise<boolean> {
  if (!playerId || !notificationId) return false;

  const row = await db
    .prepare('SELECT * FROM story_notifications WHERE id = ? AND enabled = 1')
    .bind(notificationId)
    .first<StoryNotificationRow>();
  if (!row) return false;

  const notification = mapStoryNotificationRow(row);
  const rendered = renderStoryNotification(
    { title: notification.title, content: notification.content },
    variables
  );

  const delivered = await deliverNotificationToast(env, playerId, rendered.title, rendered.content, {
    duration: 5200,
  });

  // 发放内容与即时通知相互独立：玩家不在线时仍可通过邮件领取奖励。
  await deliverStoryRewardMail(db, playerId, notification.grants, {
    idempotencyKey: `story_${notification.id}`,
    title: rendered.title,
    content: rendered.content,
  });

  return delivered;
}
