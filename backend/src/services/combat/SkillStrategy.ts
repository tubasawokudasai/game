import { Fighter, SkillEffect } from './types';

/**
 * 【策略模式】技能结算策略接口
 * 将具体的伤害倍率、扣蓝逻辑、Buff 施加、暴击公式从主战斗循环中剥离
 */
export interface SkillStrategy {
  /** 技能唯一标识 */
  readonly skillId: string;
  /** 技能招式名 */
  readonly skillName: string;
  /** 释放所需内力消耗 */
  readonly mpCost: number;

  /**
   * 判定当前战斗者是否满足施法条件 (如内力充足、未被沉默)
   * 用于自动 AI 在没有明确目标时的技能筛选。
   */
  canExecute(attacker: Fighter): boolean;

  /**
   * 判定对指定目标是否可施法（可选）。
   * 例如治疗技能需要目标气血低于阈值，而不是只看施法者。
   */
  canExecuteOn?(attacker: Fighter, defender: Fighter): boolean;

  /**
   * 执行技能数值结算并产生对冲效果
   */
  execute(attacker: Fighter, defender: Fighter): SkillEffect;
}
