import { BattleActionStrategy } from '../BattleActionStrategy';
import {
  BattleActionCommand,
  BattleActionType,
  BattleActionResult,
  BattleContext,
  Fighter,
  RoundLog,
} from '../types';

/**
 * 普通攻击行动策略 (NormalAttackStrategy)
 *
 * 规则：
 * 1. 使用角色基础攻击属性计算伤害；
 * 2. 检查目标是否合法、是否存活，若未指定或已阵亡则自动兜底首个存活敌方；
 * 3. 结算受击方防御与防御状态（Buff 减伤）；
 * 4. 产生标准战报事件。
 */
export class NormalAttackStrategy implements BattleActionStrategy {
  readonly actionType = BattleActionType.NORMAL_ATTACK;

  async execute(
    context: BattleContext,
    command: BattleActionCommand
  ): Promise<BattleActionResult> {
    const { actor, enemies, round } = context;

    if (actor.hp <= 0) {
      return { success: false, events: [] };
    }

    const aliveEnemies = enemies.filter((f) => f.hp > 0);
    if (aliveEnemies.length === 0) {
      return { success: false, events: [] };
    }

    // 确定目标：从 command.targetIds 或 command.targetId 解析，未指定或已死则兜底首个存活敌方
    const specifiedTargetId = command.targetId || command.targetIds?.[0];
    let defender: Fighter | undefined;
    if (specifiedTargetId) {
      defender = aliveEnemies.find((f) => f.id === specifiedTargetId);
    }
    if (!defender) {
      defender = aliveEnemies[0];
    }

    // 基础伤害计算
    const baseDamage = Math.max(5, actor.outerAttack - defender.outerDefense);
    const isCrit = Math.random() < actor.critRate;
    let finalDamage = Math.floor(
      isCrit ? baseDamage * (actor.critDmg || 1.5) : baseDamage
    );

    // 检查受击方防御 Buff 减伤
    let damageReduction = 0;
    for (const buff of defender.buffs || []) {
      if (buff.type === 'SHIELD' && buff.value > 0) {
        damageReduction = Math.min(0.9, damageReduction + buff.value);
      }
    }
    if (damageReduction > 0) {
      finalDamage = Math.max(1, Math.floor(finalDamage * (1 - damageReduction)));
    }

    defender.hp = Math.max(0, defender.hp - finalDamage);

    const logText = `${actor.name} 飞身上前施展【普通攻击】！${
      isCrit ? '触发会心暴击！' : ''
    }${
      damageReduction > 0
        ? ` ${defender.name} 处于御守防御姿态，伤害减免 ${(damageReduction * 100).toFixed(0)}%！`
        : ''
    } 对 ${defender.name} 造成 ${finalDamage} 点伤害！`;

    const log: RoundLog = {
      round,
      attackerId: actor.id,
      attackerName: actor.name,
      defenderId: defender.id,
      defenderName: defender.name,
      skillName: '普通攻击',
      effect: {
        damage: finalDamage,
        heal: 0,
        isCrit,
        logText,
      },
      defenderHpRemaining: defender.hp,
    };

    return {
      success: true,
      events: [log],
    };
  }
}
