/**
 * 角色升级经验系统 - 核心配置
 *
 * 初始公式：EXP(L) = 100 * L * L + 100 * L
 * 其中：
 * - L: 当前等级 (从 baseLevel 起算)
 * - EXP(L): 从当前等级升到下一级所需经验
 *
 * 集中管理经验公式与等级上限，禁止散落在各业务模块中。
 */
export const LEVEL_EXP_CONFIG = {
  /** 基础初始等级 */
  baseLevel: 1,
  /** 全局统一等级上限：达到上限后不再升级 */
  maxLevel: 100,
  /** 达到等级上限后的溢出经验策略：ZERO(清零) | RETAIN(保留) */
  overflowPolicy: 'ZERO' as 'ZERO' | 'RETAIN',
} as const;

/**
 * 升级经验曲线计算器类型
 */
export type ExpCurveCalculator = (level: number) => number;

/**
 * 默认升级经验公式：EXP(L) = 100 * L^2 + 100 * L
 */
export const defaultExpFormula: ExpCurveCalculator = (level: number): number => {
  const l = Math.max(1, Math.floor(level));
  return 100 * l * l + 100 * l;
};

/**
 * 可配置的当前经验公式引用（支持后续热更或调整经验曲线）
 */
let activeExpFormula: ExpCurveCalculator = defaultExpFormula;

/**
 * 获取从指定等级升到下一级所需的升级经验
 * @param level 当前等级
 */
export function getRequiredExpForLevel(level: number): number {
  if (level >= LEVEL_EXP_CONFIG.maxLevel) {
    // 已达到上限，无下一级
    return 0;
  }
  return activeExpFormula(level);
}

/**
 * 获取系统配置的统一等级上限
 */
export function getLevelCap(): number {
  return LEVEL_EXP_CONFIG.maxLevel;
}

/**
 * 动态替换升级经验曲线公式（供活动、测试或数值调整使用）
 */
export function setExpFormula(formula: ExpCurveCalculator): void {
  activeExpFormula = formula;
}

/**
 * 重置为默认升级经验公式
 */
export function resetExpFormula(): void {
  activeExpFormula = defaultExpFormula;
}

/**
 * 计算当前等级经验百分比进度 (0 ~ 100)
 */
export function calculateExpProgress(currentExp: number, requiredExp: number): number {
  if (requiredExp <= 0) return 100;
  const progress = (currentExp / requiredExp) * 100;
  return Math.min(100, Math.max(0, Math.round(progress * 10) / 10));
}
