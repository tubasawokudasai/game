import type { D1Database } from '@cloudflare/workers-types';
import type { GrantInput } from './grantService';

/**
 * 通知管理 · 通用发放内容
 *
 * 所有通知事件（玩家升级 / 剧情节点触发器等）共用同一套发放内容类型与校验：
 * - ITEM：道具必须存在于 item_templates，数量 1–99999，同一道具不允许重复；
 * - COMPANION：角色必须存在于 npc_templates（id 或 key），等级 1–9999；
 * - CURRENCY：纹银 / 元宝 / 铜钱均为非负整数，且至少填写一种。
 *
 * 读取历史配置时允许宽松归一化；后台保存时执行严格校验。
 */

export type NotificationGrant =
  | { type: 'ITEM'; itemId: string; quantity: number }
  | { type: 'COMPANION'; memberKey: string; level: number; realm: string }
  | { type: 'CURRENCY'; silver: number; ingot: number; copper: number };

export const MAX_NOTIFICATION_GRANTS = 20;
export const MAX_NOTIFICATION_ITEM_QUANTITY = 99_999;
export const MAX_NOTIFICATION_COMPANION_LEVEL = 9_999;
export const MAX_NOTIFICATION_CURRENCY = 999_999_999;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export function safeParseJson(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * 归一化历史配置：
 * - 旧数据 [{ itemId, quantity }] 没有 type，按 ITEM 处理；
 * - 非法/空条目直接丢弃，保证通知事件不会因脏数据整体失败；
 * - 数量/等级越界会被夹到合法区间。
 */
export function normalizeNotificationGrants(raw: unknown): NotificationGrant[] {
  if (!Array.isArray(raw)) return [];

  const grants: NotificationGrant[] = [];
  for (const entry of raw) {
    const record = (entry || {}) as Record<string, unknown>;
    const type = String(record.type || 'ITEM').toUpperCase();

    if (type === 'COMPANION') {
      const memberKey = String(record.memberKey ?? record.templateId ?? '').trim();
      if (!memberKey) continue;
      grants.push({
        type: 'COMPANION',
        memberKey,
        level: clampInt(record.level, 1, MAX_NOTIFICATION_COMPANION_LEVEL, 1),
        realm: String(record.realm ?? '').trim(),
      });
      continue;
    }

    if (type === 'CURRENCY') {
      const silver = clampInt(record.silver, 0, MAX_NOTIFICATION_CURRENCY, 0);
      const ingot = clampInt(record.ingot, 0, MAX_NOTIFICATION_CURRENCY, 0);
      const copper = clampInt(record.copper, 0, MAX_NOTIFICATION_CURRENCY, 0);
      if (silver === 0 && ingot === 0 && copper === 0) continue;
      grants.push({ type: 'CURRENCY', silver, ingot, copper });
      continue;
    }

    const itemId = String(record.itemId ?? record.id ?? '').trim();
    if (!itemId) continue;
    grants.push({
      type: 'ITEM',
      itemId,
      quantity: clampInt(record.quantity ?? record.count, 1, MAX_NOTIFICATION_ITEM_QUANTITY, 1),
    });
  }

  return grants;
}

/**
 * 后台保存时的严格校验，返回归一化后的发放内容。
 * 所有校验均在服务端重新执行，前端表单校验只作为交互提示。
 */
export async function validateNotificationGrants(
  db: D1Database,
  rawGrants: unknown
): Promise<NotificationGrant[]> {
  if (!Array.isArray(rawGrants)) {
    throw new Error('发放内容配置格式不正确');
  }
  if (rawGrants.length > MAX_NOTIFICATION_GRANTS) {
    throw new Error(`发放内容最多配置 ${MAX_NOTIFICATION_GRANTS} 项`);
  }

  const seenItemIds = new Set<string>();
  const grants: NotificationGrant[] = [];

  for (let index = 0; index < rawGrants.length; index++) {
    const entry = (rawGrants[index] || {}) as Record<string, unknown>;
    // 历史配置没有 type 字段，按道具发放兼容
    const type = String(entry.type ?? 'ITEM').toUpperCase();

    if (type === 'ITEM') {
      const itemId = String(entry.itemId ?? '').trim();
      if (!itemId) {
        throw new Error(`第 ${index + 1} 项发放缺少道具 ID`);
      }

      const quantity = Number(entry.quantity ?? entry.count);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new Error(`道具 [${itemId}] 的数量必须为正整数`);
      }
      if (quantity > MAX_NOTIFICATION_ITEM_QUANTITY) {
        throw new Error(`道具 [${itemId}] 的数量不能超过 ${MAX_NOTIFICATION_ITEM_QUANTITY}`);
      }

      if (seenItemIds.has(itemId)) {
        throw new Error(`附件道具不允许重复添加：[${itemId}]`);
      }
      seenItemIds.add(itemId);

      grants.push({ type: 'ITEM', itemId, quantity });
      continue;
    }

    if (type === 'COMPANION') {
      const memberKey = String(entry.memberKey ?? entry.templateId ?? '').trim();
      if (!memberKey) {
        throw new Error(`第 ${index + 1} 项发放缺少角色模版`);
      }

      const level = entry.level === undefined || entry.level === null ? 1 : Number(entry.level);
      if (!Number.isInteger(level) || level <= 0) {
        throw new Error(`角色 [${memberKey}] 的等级必须为正整数`);
      }
      if (level > MAX_NOTIFICATION_COMPANION_LEVEL) {
        throw new Error(`角色 [${memberKey}] 的等级不能超过 ${MAX_NOTIFICATION_COMPANION_LEVEL}`);
      }

      const realm = String(entry.realm ?? '').trim();
      if (realm.length > 64) {
        throw new Error(`角色 [${memberKey}] 的境界不能超过 64 个字符`);
      }

      grants.push({ type: 'COMPANION', memberKey, level, realm });
      continue;
    }

    if (type === 'CURRENCY') {
      const silver = entry.silver === undefined || entry.silver === null ? 0 : Number(entry.silver);
      const ingot = entry.ingot === undefined || entry.ingot === null ? 0 : Number(entry.ingot);
      const copper = entry.copper === undefined || entry.copper === null ? 0 : Number(entry.copper);

      for (const [label, value] of [
        ['纹银', silver],
        ['元宝', ingot],
        ['铜钱', copper],
      ] as const) {
        if (!Number.isInteger(value) || value < 0) {
          throw new Error(`第 ${index + 1} 项${label}数量必须为非负整数`);
        }
        if (value > MAX_NOTIFICATION_CURRENCY) {
          throw new Error(`第 ${index + 1} 项${label}数量不能超过 ${MAX_NOTIFICATION_CURRENCY}`);
        }
      }

      if (silver === 0 && ingot === 0 && copper === 0) {
        throw new Error(`第 ${index + 1} 项至少需要填写一种货币数量`);
      }

      grants.push({ type: 'CURRENCY', silver, ingot, copper });
      continue;
    }

    throw new Error(`第 ${index + 1} 项发放类型不支持：[${String(entry.type)}]`);
  }

  // 道具必须存在于现有道具数据源 item_templates，绝不信任前端提交的名称
  const itemIds = Array.from(
    new Set(
      grants
        .map((grant) => (grant.type === 'ITEM' ? grant.itemId : ''))
        .filter((itemId) => Boolean(itemId))
    )
  );
  if (itemIds.length > 0) {
    const placeholders = itemIds.map(() => '?').join(',');
    const { results } = await db
      .prepare(`SELECT id, name FROM item_templates WHERE id IN (${placeholders})`)
      .bind(...itemIds)
      .all<{ id: string; name: string }>();

    const existingIds = new Set((results || []).map((row) => row.id));
    const missing = itemIds.filter((itemId) => !existingIds.has(itemId));

    if (missing.length > 0) {
      throw new Error(`道具不存在或不可发放：${missing.join('、')}`);
    }
  }

  // 角色必须存在于 npc_templates（兼容 id 与 key 两种提交方式）
  const companionKeys = Array.from(
    new Set(
      grants
        .map((grant) => (grant.type === 'COMPANION' ? grant.memberKey : ''))
        .filter((memberKey) => Boolean(memberKey))
    )
  );
  if (companionKeys.length > 0) {
    const placeholders = companionKeys.map(() => '?').join(',');
    const { results } = await db
      .prepare(
        `SELECT id, key FROM npc_templates
         WHERE id IN (${placeholders}) OR key IN (${placeholders})`
      )
      .bind(...companionKeys, ...companionKeys)
      .all<{ id: string; key: string }>();

    const existingKeys = new Set<string>();
    for (const row of results || []) {
      existingKeys.add(row.id);
      existingKeys.add(row.key);
    }

    const missing = companionKeys.filter((key) => !existingKeys.has(key));
    if (missing.length > 0) {
      throw new Error(`角色模版不存在或不可发放：${missing.join('、')}`);
    }
  }

  return grants;
}

/** 转换为 grantService 可直接使用的邮件附件发放项 */
export function notificationGrantToMailGrant(grant: NotificationGrant): GrantInput {
  if (grant.type === 'COMPANION') {
    return {
      type: 'COMPANION',
      memberKey: grant.memberKey,
      level: grant.level,
      realm: grant.realm,
    };
  }

  if (grant.type === 'CURRENCY') {
    return {
      type: 'CURRENCY',
      silver: grant.silver,
      ingot: grant.ingot,
      copper: grant.copper,
    };
  }

  return { type: 'ITEM', itemId: grant.itemId, count: grant.quantity };
}
