import { BattleActionStrategy } from '../BattleActionStrategy';
import {
  BattleActionCommand,
  BattleActionType,
  BattleActionResult,
  BattleContext,
  Fighter,
  RoundLog,
} from '../types';
import { CombatEngine } from '../CombatEngine';
import {
  CombatSkillInfo,
  CombatSkillTargetType,
  DUEL_SKILLS,
} from '../../../models/combat';

/**
 * 技能释放行动策略 (SkillStrategy)
 *
 * 规则：
 * 1. 释放指定的法诀技能（如纯阳剑煞、太清回春、九霄天雷、万剑归宗、春风化雨等）；
 * 2. 校验内力与目标合法性；若内力不足或目标不合法，降级为普通攻击或自动技能；
 * 3. 支持单体伤害、群体伤害、单体回春、群体普济；
 * 4. 伤害结算时统一遵循受击方的防御与 Buff 减免。
 */
export class SkillActionStrategy implements BattleActionStrategy {
  readonly actionType = BattleActionType.SKILL;
  private engine: CombatEngine;
  private skillTargetTypes = new Map<string, CombatSkillTargetType>();

  constructor(engine?: CombatEngine, skills: CombatSkillInfo[] = DUEL_SKILLS) {
    this.engine = engine || new CombatEngine();
    for (const skill of skills) {
      this.skillTargetTypes.set(skill.id, skill.targetType);
    }
  }

  async execute(
    context: BattleContext,
    command: BattleActionCommand
  ): Promise<BattleActionResult> {
    const { actor, allies, enemies, round } = context;

    if (actor.hp <= 0) {
      return { success: false, events: [] };
    }

    const aliveAllies = allies.filter((f) => f.hp > 0);
    const aliveEnemies = enemies.filter((f) => f.hp > 0);

    if (aliveEnemies.length === 0) {
      return { success: false, events: [] };
    }

    const skillId = command.skillId || 'skill_basic_attack';
    const targetType = this.skillTargetTypes.get(skillId) || 'SINGLE_ENEMY';

    const events: RoundLog[] = [];

    // 群体技能处理
    if (targetType === 'ALL_ENEMIES' || targetType === 'ALL_ALLIES') {
      const targets = targetType === 'ALL_ENEMIES' ? aliveEnemies : aliveAllies;
      const aoeLogs = this.engine.resolveActionOnTargets(
        round,
        actor,
        targets,
        skillId
      );

      if (aoeLogs.length > 0) {
        this.applyBuffReductionToLogs(aoeLogs, targets);
        events.push(...aoeLogs);
      } else {
        // 无合法群体目标（如全员满血），回退为对首个敌人的普通出手
        const fallbackTarget = aliveEnemies[0];
        if (fallbackTarget) {
          const fallbackLog = this.engine.resolveAction(
            round,
            actor,
            fallbackTarget
          );
          this.applyBuffReductionToLogs([fallbackLog], [fallbackTarget]);
          events.push(fallbackLog);
        }
      }

      return {
        success: events.length > 0,
        events,
      };
    }

    // 单体技能处理
    let target: Fighter | undefined;
    const specifiedTargetId = command.targetId || command.targetIds?.[0];

    if (targetType === 'SINGLE_ALLY' || targetType === 'SELF') {
      if (targetType === 'SELF') {
        target = actor;
      } else {
        target = specifiedTargetId
          ? aliveAllies.find((f) => f.id === specifiedTargetId)
          : undefined;
        target = target || aliveAllies[0];
      }
    } else {
      target = specifiedTargetId
        ? aliveEnemies.find((f) => f.id === specifiedTargetId)
        : undefined;
      target = target || aliveEnemies[0];
    }

    if (!target) {
      return { success: false, events: [] };
    }

    const log = this.engine.resolveAction(round, actor, target, skillId);
    this.applyBuffReductionToLogs([log], [target]);
    events.push(log);

    return {
      success: true,
      events,
    };
  }

  /**
   * 确保受击方处于防御姿态时，技能伤害同样获得减免
   */
  private applyBuffReductionToLogs(logs: RoundLog[], targets: Fighter[]) {
    for (const log of logs) {
      if (log.effect.damage > 0) {
        const target = targets.find((t) => t.id === log.defenderId);
        if (target) {
          let reduction = 0;
          for (const buff of target.buffs || []) {
            if (buff.type === 'SHIELD' && buff.value > 0) {
              reduction = Math.min(0.9, reduction + buff.value);
            }
          }
          if (reduction > 0) {
            const original = log.effect.damage;
            const reduced = Math.max(1, Math.floor(original * (1 - reduction)));
            const saved = original - reduced;
            log.effect.damage = reduced;
            target.hp = Math.min(target.maxHp, target.hp + saved);
            log.defenderHpRemaining = target.hp;
            log.effect.logText += ` (${target.name} 处于防御姿态，减免 ${saved} 点伤害)`;
          }
        }
      }
    }
  }
}
