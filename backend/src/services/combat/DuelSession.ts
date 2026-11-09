import { CombatEngine } from './CombatEngine';
import { Fighter, RoundLog, BattleContext } from './types';
import {
  BattleActionCommand,
  BattleActionType,
  CombatSkillInfo,
  CombatSkillTargetType,
  DUEL_SKILLS,
} from '../../models/combat';
import { BattleActionExecutor } from './BattleActionExecutor';

/**
 * 单侧玩家本回合的出招指令（兼容统一战斗指令 BattleActionCommand）
 */
export interface DuelSideAction {
  skillId?: string;
  targetId?: string;
  targetIds?: string[];
  actionType?: BattleActionType;
  actorId?: string;
  itemId?: string;
  unitId?: string;
}

export interface DuelRoundOutcome {
  /** 本回合产生的逐条战报 */
  events: RoundLog[];
  /** 是否已分出胜负（一方全灭、达到回合上限或逃跑成功） */
  finished: boolean;
  /** 胜方：ALLY = 发起方，ENEMY = 应战方 */
  winner: 'ALLY' | 'ENEMY' | null;
  /** 本回合序号 */
  round: number;
  /** 是否通过逃跑结束 */
  escaped?: boolean;
}

export interface DuelSessionOptions {
  executor?: BattleActionExecutor;
  battleMode?: 'PVP' | 'PVE';
  battleType?: string;
  allowEscape?: boolean;
  findItem?: BattleContext['findItem'];
  deductItem?: BattleContext['deductItem'];
}

/**
 * 实时战斗会话 (DuelSession)
 *
 * 职责：
 * 1. 持有双方 Fighter 状态；
 * 2. 每回合按身法速度顺序调度所有存活单位；
 * 3. 通过 BattleActionExecutor 分发执行各行动（普攻、防御、技能、物品、逃跑）；
 * 4. 逃跑成功时即刻终止后续行动；
 * 5. 回合结算后清理临时 Buff（防御姿态）；
 * 6. 判定胜负或平局。
 */
export class DuelSession {
  public engine: CombatEngine;
  public executor: BattleActionExecutor;
  public allies: Fighter[];
  public enemies: Fighter[];
  public maxRounds: number;
  public battleMode: 'PVP' | 'PVE';
  public battleType?: string;
  public allowEscape: boolean;
  public findItem?: BattleContext['findItem'];
  public deductItem?: BattleContext['deductItem'];
  /** 技能键 -> 作用目标类型 */
  private skillTargetTypes = new Map<string, CombatSkillTargetType>();
  /** 下一回合序号（从 1 开始） */
  public round = 1;

  constructor(
    engine: CombatEngine,
    allies: Fighter[],
    enemies: Fighter[],
    maxRounds = 20,
    skills: CombatSkillInfo[] = DUEL_SKILLS,
    options?: DuelSessionOptions
  ) {
    this.engine = engine;
    this.allies = allies;
    this.enemies = enemies;
    this.maxRounds = maxRounds;
    for (const skill of skills) {
      this.skillTargetTypes.set(skill.id, skill.targetType);
    }
    this.executor = options?.executor || new BattleActionExecutor();
    this.battleMode = options?.battleMode || 'PVP';
    this.battleType = options?.battleType;
    this.allowEscape = options?.allowEscape ?? (this.battleMode !== 'PVP');
    this.findItem = options?.findItem;
    this.deductItem = options?.deductItem;
  }

  /** 已进行的回合数 */
  public get roundsPlayed(): number {
    return this.round - 1;
  }

  /** 是否已结束（供外部查询，不改变状态） */
  public get finished(): boolean {
    return (
      this.allies.every((f) => f.hp <= 0) ||
      this.enemies.every((f) => f.hp <= 0)
    );
  }

  /**
   * 回合结束时清理/递减 Buff（防御状态在此清除，保证不永久修改角色属性）
   */
  public tickBuffs(): void {
    const all = [...this.allies, ...this.enemies];
    for (const fighter of all) {
      if (fighter.buffs && fighter.buffs.length > 0) {
        for (const buff of fighter.buffs) {
          buff.remainingRounds -= 1;
        }
        fighter.buffs = fighter.buffs.filter((b) => b.remainingRounds > 0);
      }
    }
  }

  /**
   * 规范化指令对象
   */
  private normalizeCommand(
    actor: Fighter,
    action: DuelSideAction | undefined,
    allies: Fighter[],
    enemies: Fighter[]
  ): BattleActionCommand {
    if (!action) {
      // 托管 AI：如果有可用技能则优先释放，否则普通攻击
      const defaultSkill = actor.equippedSkills[0] || 'skill_basic_attack';
      const actionType =
        defaultSkill === 'skill_basic_attack'
          ? BattleActionType.NORMAL_ATTACK
          : BattleActionType.SKILL;
      const targetId = enemies[0]?.id;
      return {
        actorId: actor.id,
        unitId: actor.id,
        actionType,
        skillId: defaultSkill,
        targetId,
        targetIds: targetId ? [targetId] : [],
      };
    }

    let actionType = action.actionType;
    if (!actionType) {
      if (action.itemId) {
        actionType = BattleActionType.USE_ITEM;
      } else if (action.skillId === 'skill_basic_attack') {
        actionType = BattleActionType.NORMAL_ATTACK;
      } else if (action.skillId) {
        actionType = BattleActionType.SKILL;
      } else {
        actionType = BattleActionType.NORMAL_ATTACK;
      }
    }

    const targetId = action.targetId || action.targetIds?.[0];
    const targetIds = action.targetIds || (targetId ? [targetId] : []);

    return {
      actorId: action.actorId || action.unitId || actor.id,
      unitId: action.unitId || action.actorId || actor.id,
      actionType,
      skillId: action.skillId,
      itemId: action.itemId,
      targetId,
      targetIds,
    };
  }

  /**
   * 结算一个完整回合。
   * allyActions / enemyActions 以出战单位 ID 为键，每个存活角色各有一条指令；
   * 未提供指令的单位由引擎自动选择技能（超时补位/托管）。
   */
  public async playRound(
    allyActions: Map<string, DuelSideAction> = new Map(),
    enemyActions: Map<string, DuelSideAction> = new Map()
  ): Promise<DuelRoundOutcome> {
    const playedRound = this.round;
    const events: RoundLog[] = [];
    let hasEscaped = false;
    let escapeWinner: 'ALLY' | 'ENEMY' | null = null;

    // 本回合出手顺序：双方存活单位按身法降序
    const order = [...this.allies, ...this.enemies]
      .filter((f) => f.hp > 0)
      .sort((a, b) => b.speed - a.speed);

    for (const actor of order) {
      if (actor.hp <= 0) continue;

      const isAlly = this.allies.includes(actor);
      const foes = (isAlly ? this.enemies : this.allies).filter((f) => f.hp > 0);
      const ownSide = (isAlly ? this.allies : this.enemies).filter((f) => f.hp > 0);
      if (foes.length === 0) break;

      // 读取指令并统一分发
      const action = (isAlly ? allyActions : enemyActions).get(actor.id);
      const command = this.normalizeCommand(actor, action, ownSide, foes);

      const context: BattleContext = {
        round: playedRound,
        actor,
        allies: ownSide,
        enemies: foes,
        battleMode: this.battleMode,
        battleType: this.battleType,
        allowEscape: this.allowEscape,
        findItem: this.findItem,
        deductItem: this.deductItem,
      };

      const result = await this.executor.execute(context, command);
      events.push(...result.events);

      // 特别注意：逃跑成功属于终止当前战斗的特殊情况，正确终止后续行动
      if (result.escaped) {
        hasEscaped = true;
        // 逃跑方主动撤离，对立面胜出
        escapeWinner = isAlly ? 'ENEMY' : 'ALLY';
        break;
      }

      // 敌方全部阵亡则提前收招
      if (foes.every((f) => f.hp <= 0)) {
        break;
      }
    }

    // 回合结算后清理/衰减 Buff（防御状态）
    this.tickBuffs();

    this.round++;

    const alliesAlive = this.allies.filter((f) => f.hp > 0).length;
    const enemiesAlive = this.enemies.filter((f) => f.hp > 0).length;

    let winner: 'ALLY' | 'ENEMY' | null = null;
    let finished = false;

    if (hasEscaped) {
      finished = true;
      winner = escapeWinner;
    } else if (alliesAlive === 0 && enemiesAlive === 0) {
      // 同归于尽：按剩余气血比例判定（均为 0 时发起方判负，避免“双方都算赢”）
      winner =
        this.totalHpRatio(this.allies) > this.totalHpRatio(this.enemies)
          ? 'ALLY'
          : 'ENEMY';
      finished = true;
    } else if (enemiesAlive === 0) {
      winner = 'ALLY';
      finished = true;
    } else if (alliesAlive === 0) {
      winner = 'ENEMY';
      finished = true;
    } else if (this.round > this.maxRounds) {
      // 回合上限：按剩余气血比例判定
      winner =
        this.totalHpRatio(this.allies) >= this.totalHpRatio(this.enemies)
          ? 'ALLY'
          : 'ENEMY';
      finished = true;
    }

    return {
      events,
      finished,
      winner,
      round: playedRound,
      escaped: hasEscaped,
    };
  }

  private totalHpRatio(team: Fighter[]): number {
    const max = team.reduce((sum, f) => sum + f.maxHp, 0);
    if (max <= 0) return 0;
    return team.reduce((sum, f) => sum + Math.max(0, f.hp), 0) / max;
  }
}
