/**
 * 角色升级经验系统 - 前端常量与计算工具
 *
 * 升级经验公式：EXP(L) = 100 * L * L + 100 * L
 */
export const LEVEL_EXP_CONFIG = {
  baseLevel: 1,
  maxLevel: 100,
} as const;

/**
 * 升至下一等级所需经验公式
 */
export function getRequiredExpForLevel(level: number): number {
  if (level >= LEVEL_EXP_CONFIG.maxLevel) return 0;
  const l = Math.max(1, Math.floor(level));
  return 100 * l * l + 100 * l;
}

/**
 * 经验进度百分比 (0 ~ 100)
 */
export function calculateExpProgress(currentExp: number, requiredExp: number): number {
  if (requiredExp <= 0) return 100;
  const progress = (currentExp / requiredExp) * 100;
  return Math.min(100, Math.max(0, Math.round(progress)));
}
