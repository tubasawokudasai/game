import { MailAttachmentRecord, MailRecord } from '../models/types';

/**
 * 系统发放业务服务 (grantService.ts)
 *
 * 设计目标：
 * 1. 邮件附件不再只承载"装备/货币"两种硬编码形态，而是以 grant_type 声明发放类型，
 *    grant_payload 保存该类型的完整参数，由本文件统一解析与领取。
 * 2. 新增发放类型（如 EQUIPMENT 装备、TITLE 称号、PET 灵宠）时，只需：
 *    - 在 GrantInput / GrantType 中增加联合类型；
 *    - 在 resolveGrant 中增加"发送前校验 + 快照"逻辑；
 *    - 在 claimMailAttachmentsTx / buildCompanionClaim 中增加"领取时落库"逻辑；
 *    - 在 admin src/types 与 Admin 页面增加对应表单。
 *    邮件主表、收发件人、领取入口与前端邮箱无需改动。
 * 3. 所有落库操作仍通过 D1 batch 原子提交，避免"附件已标记领取但道具未到账"。
 */

export type GrantType = 'ITEM' | 'COMPANION' | 'CURRENCY' | 'FRIEND_REQUEST';


export interface ItemGrantInput {
  type: 'ITEM';
  itemId: string;
  count?: number;
}

export interface CompanionGrantInput {
  type: 'COMPANION';
  memberKey: string;
  level?: number;
  realm?: string;
}

export interface CurrencyGrantInput {
  type: 'CURRENCY';
  silver?: number;
  ingot?: number;
  copper?: number;
}

export type GrantInput = ItemGrantInput | CompanionGrantInput | CurrencyGrantInput;

/** 管理员发送后回执中的可读摘要 */
export interface GrantSummary {
  type: GrantType;
  name: string;
  count?: number;
  detail?: string;
}

/** 玩家邮箱/领取回执中的单条附件视图 */
export interface AttachmentView {
  id: string;
  grantType: string;
  name: string;
  count: number;
  silver: number;
  ingot: number;
  copper: number;
  itemId?: string;
  itemType?: string;
  quality?: string;
  level?: number;
  realm?: string;
  role?: string;
  avatar?: string;
  description?: string;
}

export interface ClaimedGrant {
  type: string;
  name: string;
  count?: number;
  level?: number;
  message: string;
}

export interface ClaimResult {
  claimedSilver: number;
  claimedIngot: number;
  claimedCopper: number;
  claimedItemName?: string;
  grants: ClaimedGrant[];
  message: string;
}

interface ResolvedGrant {
  type: GrantType;
  itemId: string | null;
  itemSnapshot: string | null;
  count: number;
  silver: number;
  ingot: number;
  grantPayload: Record<string, any>;
  summary: GrantSummary;
}

interface ItemTemplateRow {
  id: string;
  name: string;
  type: string;
  quality: string;
  description?: string | null;
}

interface CompanionTemplateRow {
  id: string;
  key: string;
  name: string;
  title?: string | null;
  badge?: string | null;
  avatar?: string | null;
  role: string;
  sort_order: number;
}

function toInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function safeParseJson(raw?: string | null): Record<string, any> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function currencyDetail(silver: number, ingot: number, copper: number): string {
  const parts: string[] = [];
  if (silver > 0) parts.push(`纹银 +${silver}`);
  if (ingot > 0) parts.push(`元宝 +${ingot}`);
  if (copper > 0) parts.push(`铜钱 +${copper}`);
  return parts.join('、');
}

/**
 * 发送前校验 + 生成发放快照。
 * 所有模版必须在数据库中存在，绝不把前端伪造的名称/属性写进附件。
 */
async function resolveGrant(db: D1Database, input: GrantInput): Promise<ResolvedGrant> {
  if (input.type === 'ITEM') {
    const itemId = String(input.itemId || '').trim();
    if (!itemId) {
      throw new Error('发放道具时必须指定道具模版');
    }

    const count = clamp(toInt(input.count, 1), 1, 99999);
    const template = await db
      .prepare('SELECT id, name, type, quality, description FROM item_templates WHERE id = ?')
      .bind(itemId)
      .first<ItemTemplateRow>();

    if (!template) {
      throw new Error(`道具模版 [${itemId}] 未备案，请先在道具库补录`);
    }

    const payload = {
      itemId: template.id,
      name: template.name,
      itemType: template.type,
      quality: template.quality,
      description: template.description || '',
      count,
    };

    return {
      type: 'ITEM',
      itemId: template.id,
      itemSnapshot: JSON.stringify({
        item_id: template.id,
        item_name: template.name,
        item_type: template.type,
        quality: template.quality,
        count,
      }),
      count,
      silver: 0,
      ingot: 0,
      grantPayload: payload,
      summary: {
        type: 'ITEM',
        name: template.name,
        count,
        detail: `道具 · ${template.type} · ${template.quality}`,
      },
    };
  }

  if (input.type === 'COMPANION') {
    const memberKey = String(input.memberKey || '').trim();
    if (!memberKey) {
      throw new Error('发放角色时必须指定角色模版');
    }

    const template = await db
      .prepare(
        `SELECT id, key, name, title, badge, avatar, role, sort_order, skills_json
         FROM npc_templates WHERE id = ? OR key = ? LIMIT 1`
      )
      .bind(memberKey, memberKey)
      .first<CompanionTemplateRow & { skills_json?: string | null }>();

    if (!template) {
      throw new Error(`NPC 模板 [${memberKey}] 未备案，无法发放`);
    }

    const level = clamp(toInt(input.level, 1), 1, 9999);
    const realm = String(input.realm || '').trim();

    const payload = {
      templateId: template.id,
      memberKey: template.id,
      templateKey: template.key,
      name: template.name,
      title: template.title || '',
      avatar: template.avatar || '',
      role: template.role || 'DPS',
      realm,
      level,
      skills_json: template.skills_json || null,
      // 快照用于模版后续被删除后仍可正确补录角色
      snapshot: {
        templateId: template.id,
        name: template.name,
        title: template.title || '',
        avatar: template.avatar || '',
        role: template.role || 'DPS',
        realm,
        level,
        skills_json: template.skills_json || null,
        sort_order: template.sort_order || 0,
      },
    };

    return {
      type: 'COMPANION',
      itemId: null,
      itemSnapshot: null,
      count: 1,
      silver: 0,
      ingot: 0,
      grantPayload: payload,
      summary: {
        type: 'COMPANION',
        name: template.name,
        count: 1,
        detail: `角色 · Lv.${level}`,
      },
    };
  }

  if (input.type === 'CURRENCY') {
    const silver = Math.max(0, toInt(input.silver));
    const ingot = Math.max(0, toInt(input.ingot));
    const copper = Math.max(0, toInt(input.copper));

    if (silver === 0 && ingot === 0 && copper === 0) {
      throw new Error('发放货币时至少需要填写一种货币数量');
    }

    const payload = { name: '货币补给', silver, ingot, copper };

    return {
      type: 'CURRENCY',
      itemId: null,
      itemSnapshot: null,
      count: 1,
      silver,
      ingot,
      grantPayload: payload,
      summary: {
        type: 'CURRENCY',
        name: '货币补给',
        count: 1,
        detail: currencyDetail(silver, ingot, copper),
      },
    };
  }

  // 理论上被 TypeScript 穷尽检查拦截，此处兜底防止脏数据绕过编译
  throw new Error(`暂不支持的系统发放类型: ${(input as { type?: string }).type || 'UNKNOWN'}`);
}

/**
 * 幂等邮件 ID：与 sendSystemGrantMails 内部的确定性 ID 规则保持一致。
 * 外部重试逻辑可先用它查询邮件是否已创建，避免重复解析/发放附件。
 */
export function buildGrantMailId(idempotencyKey: string, receiverId: string): string {
  const key = String(idempotencyKey || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 96);
  const receiver = String(receiverId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `mail_${key}_${receiver}`;
}

/**
 * 系统发放：向一名或多名玩家写入系统邮件及类型化附件。
 * 玩家必须进入邮箱点击"领取"后，附件才会真正落入背包 / 队伍。
 */
export async function sendSystemGrantMails(
  db: D1Database,
  params: {
    receiverIds: string[];
    senderName: string;
    title: string;
    content: string;
    expireDays: number;
    createdBy?: string;
    /**
     * 幂等键（可选）。
     * 传入后邮件 ID / 附件 ID / 角色实例 ID 会确定性生成，并使用 INSERT OR IGNORE，
     * 同一业务事件重复处理时不会重复创建邮件或重复发放附件。
     */
    idempotencyKey?: string;
    grants: GrantInput[];
  }
): Promise<{ mailIds: string[]; recipientCount: number; grants: GrantSummary[] }> {
  const receiverIds = Array.from(new Set(params.receiverIds.map((id) => String(id || '').trim()))).filter(
    Boolean
  );

  if (receiverIds.length === 0) {
    throw new Error('至少需要指定一位收件修仙者');
  }

  if (!Array.isArray(params.grants) || params.grants.length === 0) {
    throw new Error('至少需要添加一项发放内容');
  }

  if (!params.title.trim()) {
    throw new Error('系统邮件标题不能为空');
  }

  if (!params.content.trim()) {
    throw new Error('系统邮件正文不能为空');
  }

  const grants: ResolvedGrant[] = [];
  for (const grant of params.grants) {
    grants.push(await resolveGrant(db, grant));
  }

  const now = Date.now();
  const expireDays = clamp(toInt(params.expireDays, 30), 1, 365);
  const expireAt = Math.floor(now / 1000) + expireDays * 86400;
  const mailIds: string[] = [];
  const idempotent = Boolean(params.idempotencyKey);
  const idempotencyKey = String(params.idempotencyKey || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 96);
  // 以"一封邮件 + 其全部附件"为最小分组，分批时绝不拆散单封邮件
  const mailGroups: D1PreparedStatement[][] = [];
  let sequence = 0;

  for (const receiverId of receiverIds) {
    const receiverKey = receiverId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const mailId = idempotent
      ? buildGrantMailId(idempotencyKey, receiverId)
      : `mail_grant_${now}_${sequence}_${Math.random().toString(36).slice(2, 7)}`;
    mailIds.push(mailId);

    const group: D1PreparedStatement[] = [
      db
        .prepare(
          `INSERT${idempotent ? ' OR IGNORE' : ''} INTO mails
             (id, sender_id, sender_name, receiver_id, title, content, mail_type, has_attachment, is_read, is_claimed, expire_at)
           VALUES (?, NULL, ?, ?, ?, ?, 'SYSTEM', 1, 0, 0, ?)`
        )
        .bind(
          mailId,
          params.senderName || '天道宗师 (GM)',
          receiverId,
          params.title.trim(),
          params.content.trim(),
          expireAt
        ),
    ];

    grants.forEach((grant, index) => {
      const attachmentId = idempotent
        ? `att_${idempotencyKey}_${receiverKey}_${index}`
        : `att_grant_${now}_${sequence}_${index}_${Math.random()
            .toString(36)
            .slice(2, 7)}`;

      let attachmentPayload: Record<string, any> = grant.grantPayload;

      // 角色发放：先创建一条 PENDING 的 PLAYER 实例，记录归属玩家与发放者；
      // 玩家领取时再把它置为 ACTIVE，并写入 party_members。
      if (grant.type === 'COMPANION') {
        const npcInstanceId = idempotent
          ? `npcinst_${idempotencyKey}_${receiverKey}_${index}`
          : `npcinst_mail_${now}_${sequence}_${index}_${Math.random()
              .toString(36)
              .slice(2, 7)}`;
        attachmentPayload = {
          ...grant.grantPayload,
          npcInstanceId,
          grantedBy: params.createdBy || params.senderName || 'SYSTEM',
        };

        group.push(
          db
            .prepare(
              `INSERT${idempotent ? ' OR IGNORE' : ''} INTO npc_instances
                 (npc_id, template_id, instance_type, status, scene_id, key, name, badge, title, avatar,
                  type, quote, gossip, owner_player_id, created_by, source, source_ref,
                  battle_group_id, battle_level, battle_reward_json, respawn_seconds, once_flag, level, realm, skills_json)
               VALUES (?, ?, 'MAIL', 'PENDING', NULL, NULL, ?, ?, ?, ?,
                       'companion', '', '', ?, ?, 'MAIL_GRANT', ?,
                       NULL, 1, '{}', 0, NULL, ?, ?, ?)`
            )
            .bind(
              npcInstanceId,
              grant.grantPayload.templateId,
              grant.grantPayload.name,
              '',
              grant.grantPayload.title || '',
              grant.grantPayload.avatar || '',
              receiverId,
              params.createdBy || 'SYSTEM',
              mailId,
              grant.grantPayload.level,
              grant.grantPayload.realm || null,
              grant.grantPayload.skills_json || null
            )
        );
      }

      group.push(
        db
          .prepare(
            `INSERT${idempotent ? ' OR IGNORE' : ''} INTO mail_attachments
               (id, mail_id, item_id, item_snapshot, count, silver, ingot, grant_type, grant_payload)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            attachmentId,
            mailId,
            grant.itemId,
            grant.itemSnapshot,
            grant.count,
            grant.silver,
            grant.ingot,
            grant.type,
            JSON.stringify(attachmentPayload)
          )
      );
    });

    mailGroups.push(group);
    sequence += 1;
  }

  // D1 单次 batch 语句数有限，按整封邮件分组提交
  const BATCH_SIZE = 50;
  let chunk: D1PreparedStatement[] = [];
  const flush = async () => {
    if (chunk.length === 0) return;
    const results = await db.batch(chunk);
    for (const res of results) {
      if (res.error) {
        throw new Error(`系统发放事务失败: ${res.error}`);
      }
    }
    chunk = [];
  };

  for (const group of mailGroups) {
    if (chunk.length > 0 && chunk.length + group.length > BATCH_SIZE) {
      await flush();
    }
    chunk.push(...group);
  }
  await flush();

  return {
    mailIds,
    recipientCount: receiverIds.length,
    grants: grants.map((g) => g.summary),
  };
}

/**
 * 将数据库附件行解析为前端可展示的附件视图。
 * 兼容旧数据：无 grant_type / grant_payload 的附件按 ITEM + 货币处理。
 */
export function describeAttachment(attachment: MailAttachmentRecord): AttachmentView {
  const payload = safeParseJson(attachment.grant_payload);
  const snapshot = safeParseJson(attachment.item_snapshot);
  const rawGrantType = String(attachment.grant_type || 'ITEM').toUpperCase();
  const copper = Math.max(0, toInt(payload?.copper));
  const silver = Math.max(0, toInt(attachment.silver));
  const ingot = Math.max(0, toInt(attachment.ingot));
  const hasItemRef = Boolean(payload?.itemId || snapshot?.item_id || attachment.item_id);
  // 旧数据兼容：纯货币附件在补字段前没有 grant_type，按 CURRENCY 展示
  const grantType =
    rawGrantType === 'ITEM' && !hasItemRef && (silver > 0 || ingot > 0 || copper > 0)
      ? 'CURRENCY'
      : rawGrantType;

  const name =
    String(
      payload?.name ||
        payload?.snapshot?.name ||
        snapshot?.item_name ||
        attachment.item_id ||
        (grantType === 'CURRENCY' ? '货币补给' : '神秘附件')
    ) || '神秘附件';

  const count =
    grantType === 'ITEM'
      ? Math.max(1, toInt(payload?.count ?? snapshot?.count ?? attachment.count, 1))
      : Math.max(1, toInt(attachment.count, 1));

  return {
    id: attachment.id,
    grantType,
    name,
    count,
    silver,
    ingot,
    copper,
    itemId: payload?.itemId || snapshot?.item_id || attachment.item_id || undefined,
    itemType: payload?.itemType || snapshot?.item_type || undefined,
    quality: payload?.quality || snapshot?.quality || undefined,
    level: payload?.level !== undefined ? toInt(payload.level) : undefined,
    realm: payload?.realm || snapshot?.realm || undefined,
    role: payload?.role || snapshot?.role || undefined,
    avatar: payload?.avatar || snapshot?.avatar || undefined,
    description: payload?.description || snapshot?.description || undefined,
  };
}

/**
 * 角色领取落库：
 * - 未拥有：从模版/快照补录到 party_members，默认休息，不自动出战；
 * - 已拥有：等级取较高值（只升不降），同步境界，不改变原有出战/休息状态。
 */
async function buildCompanionClaim(
  db: D1Database,
  playerId: string,
  mailId: string,
  attachment: MailAttachmentRecord,
  payload: Record<string, any> | null
): Promise<{ statements: D1PreparedStatement[]; summary: ClaimedGrant }> {
  const rawKey = String(
    payload?.templateId || payload?.memberKey || attachment.item_id || ''
  ).trim();
  if (!rawKey) {
    throw new Error('角色附件缺少 templateId / memberKey，无法领取');
  }

  // 兼容旧邮件：npc_cangyun_001 -> tpl_cangyun / cangyun
  const candidates = new Set<string>([rawKey]);
  if (rawKey.startsWith('npc_')) {
    const base = rawKey.replace(/^npc_/, '').replace(/_001$/, '');
    candidates.add(`tpl_${base}`);
    candidates.add(base);
  }
  const candidateList = Array.from(candidates);
  const placeholders = candidateList.map(() => '?').join(',');

  const template = await db
    .prepare(
      `SELECT id, key, name, title, badge, avatar, role, sort_order
       FROM npc_templates
       WHERE id IN (${placeholders}) OR key IN (${placeholders})
       LIMIT 1`
    )
    .bind(...candidateList, ...candidateList)
    .first<CompanionTemplateRow>();

  const snapshot = payload?.snapshot && typeof payload.snapshot === 'object' ? payload.snapshot : {};

  const templateId = String(template?.id || payload?.templateId || '').trim();
  if (!templateId) {
    throw new Error(`NPC 模板 [${rawKey}] 已被删除，且附件缺少 templateId，无法领取`);
  }

  const name = String(payload?.name || snapshot.name || template?.name || rawKey);
  const title = String(payload?.title ?? snapshot.title ?? template?.title ?? '');
  const avatar = String(payload?.avatar ?? snapshot.avatar ?? template?.avatar ?? '');
  const role = String(payload?.role ?? snapshot.role ?? template?.role ?? 'DPS');
  const realm = String(payload?.realm ?? snapshot.realm ?? '');
  const level = clamp(toInt(payload?.level ?? snapshot.level, 1), 1, 9999);
  const sortOrder = toInt(snapshot.sort_order ?? template?.sort_order, 0);

  const statements: D1PreparedStatement[] = [];
  const targetInstanceId = String(payload?.npcInstanceId || '').trim();

  let instanceId = targetInstanceId;
  let existingInstance: {
    npc_id: string;
    status: string;
    level: number;
    template_id: string;
  } | null = null;

  if (targetInstanceId) {
    existingInstance = await db
      .prepare(
        `SELECT npc_id, status, level, template_id
         FROM npc_instances
         WHERE npc_id = ? AND owner_player_id = ?`
      )
      .bind(targetInstanceId, playerId)
      .first<{ npc_id: string; status: string; level: number; template_id: string }>();

    if (!existingInstance) {
      const ownedByOther = await db
        .prepare('SELECT npc_id FROM npc_instances WHERE npc_id = ?')
        .bind(targetInstanceId)
        .first<{ npc_id: string }>();
      if (ownedByOther) {
        throw new Error('该角色实例不属于当前玩家，无法领取');
      }
    }
  }

  if (targetInstanceId && !existingInstance) {
    // 实例可能已被后台删除：退回补建流程
    instanceId = '';
  }

  if (!instanceId) {
    // 旧邮件没有预创建实例：补建一条 PLAYER 实例，保证"每个角色都有实例记录"
    instanceId = `npcinst_claim_${playerId}_${templateId}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 7)}`;
    const skillsJson = payload?.skills_json || payload?.snapshot?.skills_json || null;
    statements.push(
      db
        .prepare(
          `INSERT INTO npc_instances
             (npc_id, template_id, instance_type, status, scene_id, key, name, badge, title, avatar,
              type, quote, gossip, owner_player_id, created_by, source, source_ref,
              battle_group_id, battle_level, battle_reward_json, respawn_seconds, once_flag, level, realm, skills_json)
           VALUES (?, ?, 'PLAYER', 'ACTIVE', NULL, NULL, ?, ?, ?, ?,
                   'companion', '', '', ?, ?, 'MAIL_GRANT', ?,
                   NULL, 1, '{}', 0, NULL, ?, ?, ?)`
        )
        .bind(
          instanceId,
          templateId,
          name,
          '',
          title,
          avatar,
          playerId,
          String(payload?.grantedBy || 'SYSTEM'),
          mailId,
          level,
          realm || null,
          skillsJson
        )
    );
  } else {
    // 发送时已创建的 PENDING 实例：领取时激活并同步快照
    statements.push(
      db
        .prepare(
          `UPDATE npc_instances
           SET instance_type = 'PLAYER', status = 'ACTIVE', owner_player_id = ?, template_id = ?,
               name = ?, title = ?, avatar = ?, level = ?, realm = ?, updated_at = CURRENT_TIMESTAMP
           WHERE npc_id = ? AND owner_player_id = ?`
        )
        .bind(playerId, templateId, name, title, avatar, level, realm || null, instanceId, playerId)
    );
  }

  // 同一模板已经有一个 ACTIVE 的 PLAYER 实例：本次实例标记 MERGED，等级并入已有角色
  const duplicate = await db
    .prepare(
      `SELECT i.npc_id, i.level, p.id AS party_id, p.is_active
       FROM npc_instances i
       LEFT JOIN party_members p
         ON p.member_key = i.npc_id AND p.player_id = i.owner_player_id
       WHERE i.owner_player_id = ? AND i.template_id = ?
         AND i.instance_type = 'PLAYER' AND i.status = 'ACTIVE'
         AND i.npc_id <> ?
       ORDER BY i.created_at ASC
       LIMIT 1`
    )
    .bind(playerId, templateId, instanceId)
    .first<{ npc_id: string; level: number; party_id?: string | null; is_active?: number | null }>();

  if (duplicate) {
    const nextLevel = Math.max(Number(duplicate.level) || 1, level);
    const levelUpgraded = nextLevel > (Number(duplicate.level) || 1);

    statements.push(
      db
        .prepare(
          `UPDATE npc_instances
           SET level = ?, realm = COALESCE(NULLIF(?, ''), realm), updated_at = CURRENT_TIMESTAMP
           WHERE npc_id = ?`
        )
        .bind(nextLevel, realm, duplicate.npc_id)
    );

    if (duplicate.party_id) {
      statements.push(
        db
          .prepare(
            `UPDATE party_members
             SET level = ?, realm = COALESCE(NULLIF(?, ''), realm), updated_at = CURRENT_TIMESTAMP
             WHERE player_id = ? AND member_key = ?`
          )
          .bind(nextLevel, realm, playerId, duplicate.npc_id)
      );
    }

    // 本次领取的实例仍保留审计记录，但标记为 MERGED，不再作为独立角色出战
    statements.push(
      db
        .prepare(
          `UPDATE npc_instances
           SET status = 'MERGED', updated_at = CURRENT_TIMESTAMP
           WHERE npc_id = ?`
        )
        .bind(instanceId)
    );

    const parts = [`【${name}】已拥有`];
    if (levelUpgraded) parts.push(`等级提升至 Lv.${nextLevel}`);
    else parts.push(`等级保持 Lv.${Number(duplicate.level) || 1}`);
    parts.push(duplicate.is_active === 1 ? '保持出战' : '保持休息');

    return {
      statements,
      summary: {
        type: 'COMPANION',
        name,
        count: 1,
        level: nextLevel,
        message: parts.join('，'),
      },
    };
  }

  // 新角色：写入 party_members，默认休息，不自动出战
  const existingParty = await db
    .prepare('SELECT id FROM party_members WHERE player_id = ? AND member_key = ?')
    .bind(playerId, instanceId)
    .first<{ id: string }>();

  if (existingParty) {
    statements.push(
      db
        .prepare(
          `UPDATE party_members
           SET member_name = ?, title = ?, avatar = ?, role = ?, realm = ?, level = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE player_id = ? AND member_key = ?`
        )
        .bind(name, title, avatar, role, realm, level, playerId, instanceId)
    );
  } else {
    statements.push(
      db
        .prepare(
          `INSERT INTO party_members
             (id, player_id, member_key, member_name, title, avatar, role, realm, level, sort_order, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
        )
        .bind(
          `${playerId}:${instanceId}`,
          playerId,
          instanceId,
          name,
          title,
          avatar,
          role,
          realm,
          level,
          sortOrder
        )
    );
  }

  return {
    statements,
    summary: {
      type: 'COMPANION',
      name,
      count: 1,
      level,
      message: `【${name}】Lv.${level} 已收入同道名册（休息中），可在队伍整备中上阵`,
    },
  };
}

/**
 * 领取邮件附件（强事务）：
 * 1. 按 grant_type 分派到不同落库行为；
 * 2. 道具写 inventory（一物一行，count 保留堆叠数量）；
 * 3. 角色写 party_members（已拥有则升级，不重复建档）；
 * 4. 货币累加 players 资产；
 * 5. 最后统一标记邮件/附件已领取。
 */
export async function claimMailAttachmentsTx(
  db: D1Database,
  playerId: string,
  mailId: string
): Promise<ClaimResult> {
  const mail = await db
    .prepare('SELECT * FROM mails WHERE id = ? AND receiver_id = ?')
    .bind(mailId, playerId)
    .first<MailRecord>();

  if (!mail) {
    throw new Error('未查得该封飞鸽信函');
  }

  if (mail.is_claimed === 1) {
    throw new Error('该信函附件早已提取');
  }

  const { results: attachments } = await db
    .prepare('SELECT * FROM mail_attachments WHERE mail_id = ?')
    .bind(mailId)
    .all<MailAttachmentRecord>();

  const attachmentRows = attachments || [];
  if (attachmentRows.length === 0) {
    throw new Error('该邮件无任何随信附件');
  }

  const statements: D1PreparedStatement[] = [];
  const grants: ClaimedGrant[] = [];
  let claimedSilver = 0;
  let claimedIngot = 0;
  let claimedCopper = 0;
  let claimedItemName: string | undefined;

  // 先标记已领取，避免玩家重复点击；若后续语句失败，batch 会整体回滚
  statements.push(
    db.prepare('UPDATE mails SET is_claimed = 1, is_read = 1 WHERE id = ? AND receiver_id = ?').bind(
      mailId,
      playerId
    )
  );

  for (const attachment of attachmentRows) {
    const view = describeAttachment(attachment);
    const payload = safeParseJson(attachment.grant_payload);
    const grantType = String(attachment.grant_type || 'ITEM').toUpperCase();

    // 1) 货币：无论附件类型如何，旧数据中的 silver/ingot 与 grant_payload.copper 都并入资产
    const silver = Math.max(0, toInt(attachment.silver));
    const ingot = Math.max(0, toInt(attachment.ingot));
    const copper = Math.max(0, toInt(payload?.copper));

    if (silver > 0 || ingot > 0 || copper > 0) {
      statements.push(
        db
          .prepare(
            `UPDATE players
             SET silver = silver + ?, ingot = ingot + ?, copper = copper + ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`
          )
          .bind(silver, ingot, copper, playerId)
      );
      claimedSilver += silver;
      claimedIngot += ingot;
      claimedCopper += copper;

      grants.push({
        type: 'CURRENCY',
        name: currencyDetail(silver, ingot, copper) || '货币补给',
        count: 1,
        message: `货币已入钱庄：${currencyDetail(silver, ingot, copper)}`,
      });
    }

    // 2) 非货币附件：按类型分派
    if (grantType === 'COMPANION') {
      const { statements: companionStatements, summary } = await buildCompanionClaim(
        db,
        playerId,
        mailId,
        attachment,
        payload
      );
      statements.push(...companionStatements);
      grants.push(summary);
    } else if (grantType === 'CURRENCY') {
      // 货币已在上面统一处理，无需再写其它资产
    } else if (grantType === 'ITEM') {
      const snapshot = safeParseJson(attachment.item_snapshot);
      const itemId = String(
        payload?.itemId || snapshot?.item_id || attachment.item_id || ''
      ).trim();

      if (itemId) {
        const itemName = String(payload?.name || snapshot?.item_name || view.name || itemId);
        const itemType = String(payload?.itemType || snapshot?.item_type || 'MATERIAL');
        const quality = String(payload?.quality || snapshot?.quality || 'COMMON');
        const count = Math.max(1, toInt(payload?.count ?? snapshot?.count ?? attachment.count, 1));
        const inventoryId = `inv_${playerId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

        statements.push(
          db
            .prepare(
              `INSERT INTO inventory
                 (id, player_id, item_id, item_name, item_type, count, is_equipped, quality)
               VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
            )
            .bind(inventoryId, playerId, itemId, itemName, itemType, count, quality)
        );

        if (!claimedItemName) claimedItemName = itemName;
        grants.push({
          type: 'ITEM',
          name: itemName,
          count,
          message: `获得物品【${itemName}】x${count} `,
        });
      }
    } else if (grantType === 'FRIEND_REQUEST') {
      const senderId = payload?.senderId;
      if (senderId && senderId !== playerId) {
        const frId1 = `fr_${playerId}_${senderId}`;
        const frId2 = `fr_${senderId}_${playerId}`;
        statements.push(
          db.prepare('INSERT OR IGNORE INTO friends (id, player_id, friend_id) VALUES (?, ?, ?)')
            .bind(frId1, playerId, senderId),
          db.prepare('INSERT OR IGNORE INTO friends (id, player_id, friend_id) VALUES (?, ?, ?)')
            .bind(frId2, senderId, playerId),
          db.prepare("UPDATE friend_requests SET status = 'ACCEPTED', updated_at = CURRENT_TIMESTAMP WHERE sender_id = ? AND receiver_id = ?")
            .bind(senderId, playerId)
        );
      }
      const friendName = payload?.senderName || '道友';
      grants.push({
        type: 'FRIEND_REQUEST',
        name: '仙友名帖',
        message: `已同意与【${friendName}】结为仙友！`,
      });
    } else {
      throw new Error(`暂不支持的附件发放类型 [${grantType}]，请联系管理员处理`);
    }

    statements.push(
      db
        .prepare('UPDATE mail_attachments SET claimed_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(attachment.id)
    );
  }

  const results = await db.batch(statements);
  for (const res of results) {
    if (res.error) {
      throw new Error(`领取附件事务失败: ${res.error}`);
    }
  }

  const message =
    grants.length > 0
      ? grants.map((g) => g.message).join('；')
      : '随信附件已尽数纳入行囊与钱庄！';

  return {
    claimedSilver,
    claimedIngot,
    claimedCopper,
    claimedItemName,
    grants,
    message,
  };
}
