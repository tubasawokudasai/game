import {
  BattleActionCommand,
  BattleActionType,
  BattleActionResult,
  BattleContext,
} from './types';

/**
 * 统一行动策略接口 (BattleActionStrategy)
 * 各具体行动策略（普攻、防御、技能、物品、逃跑）共享相同的上下文与返回结构。
 */
export interface BattleActionStrategy {
  readonly actionType: BattleActionType;
  execute(
    context: BattleContext,
    command: BattleActionCommand
  ): Promise<BattleActionResult>;
}
