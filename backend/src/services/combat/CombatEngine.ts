import { Fighter, BattleResult, RoundLog, TeamBattleResult } from './types';
import { SkillStrategy } from './SkillStrategy';
import {
  PureYangSwordStrategy,
  TaiQingHealingStrategy,
  NineSkyThunderStrategy,
  WanJianGuizongStrategy,
  SpringRainStrategy,
  BasicAttackStrategy,
} from './strategies';

/**
 * 【策略模式执行引擎】战斗驱动调度器 (CombatEngine)
 * 职责：
 * 1. 注册并根据战斗者状态动态选取匹配的技能策略。
 * 2. 调度出手敏捷先攻排序、回合迭代结算。
 * 3. 产出强结构化战报快照，用于持久化至 D1 combat_logs 及供 AI 审计分析。
 */
export class CombatEngine {
  private strategies: Map<string, SkillStrategy> = new Map();
  private defaultFallback: SkillStrategy = new BasicAttackStrategy();

  constructor() {
    // 注册内置技能策略
    this.registerStrategy(new PureYangSwordStrategy());
    this.registerStrategy(new TaiQingHealingStrategy());
    this.registerStrategy(new NineSkyThunderStrategy());
    this.registerStrategy(new WanJianGuizongStrategy());
    this.registerStrategy(new SpringRainStrategy());
    this.registerStrategy(this.defaultFallback);
  }

  public registerStrategy(strategy: SkillStrategy) {
    this.strategies.set(strategy.skillId, strategy);
  }

  /**
   * 执行双人异步/实时回合制决斗切磋
   * 最大 20 回合，超时判定血量高者胜
   */
  public simulateDuel(fighterA: Fighter, fighterB: Fighter): BattleResult {
    const logs: RoundLog[] = [];
    const MAX_ROUNDS = 20;
    let round = 1;

    // 先攻排序：敏捷速度更高者先手
    const [first, second] = fighterA.speed >= fighterB.speed ? [fighterA, fighterB] : [fighterB, fighterA];

    while (first.hp > 0 && second.hp > 0 && round <= MAX_ROUNDS) {
      // 1. 先手行动
      const log1 = this.executeTurn(round, first, second);
      logs.push(log1);
      if (second.hp <= 0) break;

      // 2. 后手反击
      const log2 = this.executeTurn(round, second, first);
      logs.push(log2);
      if (first.hp <= 0) break;

      round++;
    }

    // 确定胜者
    let winner: Fighter;
    if (first.hp > 0 && second.hp <= 0) {
      winner = first;
    } else if (second.hp > 0 && first.hp <= 0) {
      winner = second;
    } else {
      // 超时按剩余血量百分比判定
      const ratioA = first.hp / first.maxHp;
      const ratioB = second.hp / second.maxHp;
      winner = ratioA >= ratioB ? first : second;
    }

    return {
      winnerId: winner.id,
      winnerName: winner.name,
      roundsCount: round,
      logs,
    };
  }

  /**
   * 队伍对决：全员按身法顺序出手，逐回合推进，直到一方全灭或 20 回合封顶
   * 前端只负责演出，胜负与战报一律以本方法结果为准。
   */
  public simulateTeamBattle(allies: Fighter[], enemies: Fighter[]): TeamBattleResult {
    const logs: RoundLog[] = [];
    const MAX_ROUNDS = 20;
    let round = 1;

    const aliveAllies = () => allies.filter((f) => f.hp > 0);
    const aliveEnemies = () => enemies.filter((f) => f.hp > 0);

    while (round <= MAX_ROUNDS && aliveAllies().length > 0 && aliveEnemies().length > 0) {
      // 本回合出手顺序：双方存活单位按身法降序
      const order = [...allies, ...enemies]
        .filter((f) => f.hp > 0)
        .sort((a, b) => b.speed - a.speed);

      for (const actor of order) {
        if (actor.hp <= 0) continue;

        const isAlly = allies.includes(actor);
        const foes = (isAlly ? aliveEnemies() : aliveAllies());
        if (foes.length === 0) break;

        // 集火目标：前排优先（数组顺序即站位顺序）
        const target = foes[0];
        logs.push(this.executeTurn(round, actor, target));
      }

      round++;
    }

    const alliesAlive = aliveAllies();
    const enemiesAlive = aliveEnemies();

    let result: 'WIN' | 'LOSE';
    if (enemiesAlive.length === 0 && alliesAlive.length === 0) {
      // 同归于尽按战败处理，避免"全灭也算赢"
      result = 'LOSE';
    } else if (enemiesAlive.length === 0) {
      result = 'WIN';
    } else if (alliesAlive.length === 0) {
      result = 'LOSE';
    } else {
      result = this.totalHpRatio(allies) >= this.totalHpRatio(enemies) ? 'WIN' : 'LOSE';
    }

    return { result, roundsCount: Math.min(round, MAX_ROUNDS + 1), logs, allies, enemies };
  }

  private totalHpRatio(team: Fighter[]): number {
    const max = team.reduce((sum, f) => sum + f.maxHp, 0);
    if (max <= 0) return 0;
    return team.reduce((sum, f) => sum + Math.max(0, f.hp), 0) / max;
  }

  /** 选出玩家强制指定的技能（只校验技能存在与内力；目标条件由调用方按目标判断） */
  private selectForcedStrategy(
    attacker: Fighter,
    forcedSkillId?: string
  ): SkillStrategy | undefined {
    if (!forcedSkillId) return undefined;
    const forced = this.strategies.get(forcedSkillId);
    if (!forced || !forced.canExecute(attacker)) return undefined;
    return forced;
  }

  /** 自动 AI：按装配顺序选择第一个可执行技能，兜底普攻 */
  private selectAutoStrategy(attacker: Fighter): SkillStrategy {
    for (const skillId of attacker.equippedSkills) {
      const strat = this.strategies.get(skillId);
      if (strat && strat.canExecute(attacker)) {
        return strat;
      }
    }
    return this.defaultFallback;
  }

  private buildRoundLog(
    roundNumber: number,
    attacker: Fighter,
    defender: Fighter,
    strategy: SkillStrategy,
    effect: ReturnType<SkillStrategy['execute']>
  ): RoundLog {
    // 技能的目标就是受击/受益方；治疗技能同样如此（目标可以是自身或任意友方）
    return {
      round: roundNumber,
      attackerId: attacker.id,
      attackerName: attacker.name,
      defenderId: defender.id,
      defenderName: defender.name,
      skillName: strategy.skillName,
      effect,
      defenderHpRemaining: defender.hp,
    };
  }

  /**
   * 单个行动者的回合技能调度
   *
   * @param forcedSkillId 玩家本回合指定的技能（仅切磋实时模式使用）。
   *        若指定技能不存在、内力不足或目标条件不满足，则回退到自动策略选择。
   */
  public resolveAction(
    roundNumber: number,
    attacker: Fighter,
    defender: Fighter,
    forcedSkillId?: string
  ): RoundLog {
    const forced = this.selectForcedStrategy(attacker, forcedSkillId);
    let chosenStrategy: SkillStrategy;

    if (forced && (!forced.canExecuteOn || forced.canExecuteOn(attacker, defender))) {
      chosenStrategy = forced;
    } else {
      chosenStrategy = this.selectAutoStrategy(attacker);
    }

    const effect = chosenStrategy.execute(attacker, defender);
    return this.buildRoundLog(roundNumber, attacker, defender, chosenStrategy, effect);
  }

  /**
   * 多目标技能结算（群体攻击/群体治疗）。
   * - 仅结算玩家强制指定的技能；技能不可用或无合法目标时返回空数组，由调用方回退；
   * - 每个目标单独产出一条战报；
   * - 内力只扣一次：第一次 execute 正常扣费，后续目标前先补回 mpCost。
   */
  public resolveActionOnTargets(
    roundNumber: number,
    attacker: Fighter,
    targets: Fighter[],
    forcedSkillId: string
  ): RoundLog[] {
    const strategy = this.selectForcedStrategy(attacker, forcedSkillId);
    if (!strategy) return [];

    const validTargets = targets.filter((target) => {
      if (!target || target.hp <= 0) return false;
      return !strategy.canExecuteOn || strategy.canExecuteOn(attacker, target);
    });
    if (validTargets.length === 0) return [];

    const logs: RoundLog[] = [];
    let paid = false;

    for (const target of validTargets) {
      if (paid) {
        // 策略 execute 内部会扣一次内力；多目标时先补回，保证整招只收一次
        attacker.mp += strategy.mpCost;
      }
      const effect = strategy.execute(attacker, target);
      paid = true;
      logs.push(this.buildRoundLog(roundNumber, attacker, target, strategy, effect));
    }

    return logs;
  }

  /**
   * 保留旧的私有入口，供模拟整场战斗时复用
   */
  private executeTurn(roundNumber: number, attacker: Fighter, defender: Fighter): RoundLog {
    return this.resolveAction(roundNumber, attacker, defender);
  }
}
