/**
 * 地图 NPC 专属敌方槽位等级。
 *
 * 存储格式：{ "0": 20, "1": 15 }，key 为 monster_group_members.slot_index。
 * 未覆盖的槽位继续使用 battle group 的默认 level。
 */
export type NpcBattleMemberLevels = Record<string, number>;

function parseRaw(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function normalizeSlotKey(value: unknown): string | null {
  const slot = Number(value);
  if (!Number.isInteger(slot) || slot < 0 || slot > 3) return null;
  return String(slot);
}

function normalizeLevel(value: unknown): number | null {
  const level = Number(value);
  if (!Number.isFinite(level)) return null;
  return Math.max(1, Math.min(9999, Math.round(level)));
}

/**
 * 兼容三种输入：
 * - { "0": 20, "1": 15 }
 * - [{ slot_index: 0, level: 20 }]
 * - JSON 字符串形式
 */
export function normalizeNpcBattleMemberLevels(raw: unknown): NpcBattleMemberLevels {
  const parsed = parseRaw(raw);
  if (!parsed) return {};

  const result: NpcBattleMemberLevels = {};

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const slot = normalizeSlotKey(record.slot_index ?? record.slotIndex ?? record.slot);
      const level = normalizeLevel(record.level);
      if (slot && level !== null) result[slot] = level;
    }
    return result;
  }

  if (typeof parsed === 'object') {
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const slot = normalizeSlotKey(key);
      if (!slot) continue;
      const level = normalizeLevel(
        value && typeof value === 'object'
          ? (value as Record<string, unknown>).level
          : value
      );
      if (level !== null) result[slot] = level;
    }
  }

  return result;
}

/** 只保留当前战斗配置实际存在的槽位 */
export function filterNpcBattleMemberLevels(
  levels: NpcBattleMemberLevels,
  allowedSlots: Iterable<number>
): NpcBattleMemberLevels {
  const allowed = new Set(Array.from(allowedSlots, (slot) => String(slot)));
  return Object.fromEntries(
    Object.entries(levels).filter(([slot]) => allowed.has(slot))
  );
}
