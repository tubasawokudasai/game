import {
  LEVEL_EXP_CONFIG,
  getRequiredExpForLevel,
} from './expConfig';

export interface ExperienceCalculationInput {
  currentLevel: number;
  currentExp: number;
  amount: number;
  maxLevel?: number;
  overflowPolicy?: 'ZERO' | 'RETAIN';
}

export interface ExperienceCalculationResult {
  /** 本次实际获得的经验 */
  gainedExp: number;
  /** 升级前等级 */
  preLevel: number;
  /** 升级后等级 */
  postLevel: number;
  /** 升级次数 (连续升级时可能 > 1) */
  levelUpCount: number;
  /** 当前等级内剩余经验 */
  remainingExp: number;
  /** 升至下一等级所需经验 (满级为 0) */
  requiredExpForNextLevel: number;
  /** 是否达到等级上限 */
  isMaxLevel: boolean;
}

/**
 * 校验经验增量是否为合法正数
 */
export function validateExperienceAmount(amount: unknown): number {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new Error(`经验值必须为大于0的正数，收到非法值: ${amount}`);
  }
  return Math.floor(amount);
}

/**
 * 纯函数：根据经验曲线连续判断升级结果
 *
 * 核心规则：
 * 1. 校验经验值必须为正数
 * 2. 增加角色当前经验
 * 3. 循环判断是否满足升级条件，支持一次性海量经验连续跨多级
 * 4. 每次升级扣除当前等级对应的升级经验
 * 5. 达到等级上限后停止升级，溢出经验依策略处理 (默认清零)
 * 6. 返回升级前后等级、升级次数与当前等级剩余经验
 */
export function calculateExperienceGain(
  input: ExperienceCalculationInput
): ExperienceCalculationResult {
  const amount = validateExperienceAmount(input.amount);
  const maxLevel = Math.max(
    LEVEL_EXP_CONFIG.baseLevel,
    input.maxLevel ?? LEVEL_EXP_CONFIG.maxLevel
  );
  const overflowPolicy = input.overflowPolicy ?? LEVEL_EXP_CONFIG.overflowPolicy;

  const preLevel = Math.max(
    LEVEL_EXP_CONFIG.baseLevel,
    Math.min(maxLevel, Math.floor(Number(input.currentLevel) || LEVEL_EXP_CONFIG.baseLevel))
  );
  let currentExp = Math.max(0, Math.floor(Number(input.currentExp) || 0));

  // 1. 若当前已达满级，不再升级
  if (preLevel >= maxLevel) {
    return {
      gainedExp: amount,
      preLevel,
      postLevel: maxLevel,
      levelUpCount: 0,
      remainingExp: overflowPolicy === 'RETAIN' ? currentExp + amount : 0,
      requiredExpForNextLevel: 0,
      isMaxLevel: true,
    };
  }

  // 2. 增加角色当前经验
  let level = preLevel;
  let remainingExp = currentExp + amount;
  let levelUpCount = 0;

  // 3. 连续判断升级
  while (level < maxLevel) {
    const requiredExp = getRequiredExpForLevel(level);
    if (requiredExp <= 0 || remainingExp < requiredExp) {
      break;
    }
    remainingExp -= requiredExp;
    level++;
    levelUpCount++;
  }

  // 4. 达到上限后的溢出经验处理
  const isMaxLevel = level >= maxLevel;
  if (isMaxLevel) {
    level = maxLevel;
    if (overflowPolicy === 'ZERO') {
      remainingExp = 0;
    }
  }

  return {
    gainedExp: amount,
    preLevel,
    postLevel: level,
    levelUpCount,
    remainingExp,
    requiredExpForNextLevel: getRequiredExpForLevel(level),
    isMaxLevel,
  };
}
