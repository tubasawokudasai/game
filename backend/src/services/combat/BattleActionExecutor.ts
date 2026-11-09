import { BattleActionStrategy } from './BattleActionStrategy';
import {
  BattleActionCommand,
  BattleActionType,
  BattleActionResult,
  BattleContext,
} from './types';
import {
  NormalAttackStrategy,
  DefendStrategy,
  SkillActionStrategy,
  UseItemStrategy,
  EscapeStrategy,
} from './actionStrategies';

/**
 * 战斗指令执行调度器 (BattleActionExecutor)
 *
 * 采用策略模式与注册表，通过 actionType 统一分发执行具体行动，
 * 控制器与路由无需堆积 if/else 或 switch。
 */
export class BattleActionExecutor {
  private strategies: Record<BattleActionType, BattleActionStrategy>;

  constructor(customStrategies?: Partial<Record<BattleActionType, BattleActionStrategy>>) {
    this.strategies = {
      [BattleActionType.NORMAL_ATTACK]: new NormalAttackStrategy(),
      [BattleActionType.DEFEND]: new DefendStrategy(),
      [BattleActionType.SKILL]: new SkillActionStrategy(),
      [BattleActionType.USE_ITEM]: new UseItemStrategy(),
      [BattleActionType.ESCAPE]: new EscapeStrategy(),
      ...customStrategies,
    };
  }

  /**
   * 注册或覆盖某种类型的行动策略
   */
  public registerStrategy(type: BattleActionType, strategy: BattleActionStrategy): void {
    this.strategies[type] = strategy;
  }

  /**
   * 根据 actionType 获取对应策略
   */
  public getStrategy(type: BattleActionType): BattleActionStrategy {
    const strategy = this.strategies[type];
    if (!strategy) {
      // 缺省降级为普通攻击策略
      return this.strategies[BattleActionType.NORMAL_ATTACK];
    }
    return strategy;
  }

  /**
   * 统一执行行动指令
   */
  public async execute(
    context: BattleContext,
    command: BattleActionCommand
  ): Promise<BattleActionResult> {
    const strategy = this.getStrategy(command.actionType);
    return await strategy.execute(context, command);
  }
}
