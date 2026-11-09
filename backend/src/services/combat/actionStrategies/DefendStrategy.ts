import { BattleActionStrategy } from '../BattleActionStrategy';
import {
  BattleActionCommand,
  BattleActionType,
  BattleActionResult,
  BattleContext,
  Buff,
  RoundLog,
} from '../types';

/**
 * 防御行动策略 (DefendStrategy)
 *
 * 规则：
 * 1. 当前角色本回合进入防御姿态；
 * 2. 赋予伤害减免 Buff (50% 减免)；
 * 3. 通过 Buff 系统管理，回合结算后自动清除，不永久修改角色防御属性；
 * 4. 产生战报事件。
 */
export class DefendStrategy implements BattleActionStrategy {
  readonly actionType = BattleActionType.DEFEND;

  async execute(
    context: BattleContext,
    _command: BattleActionCommand
  ): Promise<BattleActionResult> {
    const { actor, round } = context;

    if (actor.hp <= 0) {
      return { success: false, events: [] };
    }

    // 检查并刷新或添加御守 Buff
    const existing = actor.buffs.find((b) => b.id === `buff_defend_${actor.id}`);
    if (existing) {
      existing.remainingRounds = 1;
      existing.value = 0.5;
    } else {
      const defendBuff: Buff = {
        id: `buff_defend_${actor.id}`,
        name: '横刀御守',
        type: 'SHIELD',
        value: 0.5, // 50% 伤害减免
        remainingRounds: 1, // 本回合有效
      };
      actor.buffs.push(defendBuff);
    }

    const logText = `${actor.name} 气沉丹田，横刀于前进入【防御】姿态，本回合受到伤害大幅减免 50%！`;

    const log: RoundLog = {
      round,
      attackerId: actor.id,
      attackerName: actor.name,
      defenderId: actor.id,
      defenderName: actor.name,
      skillName: '御守防御',
      effect: {
        damage: 0,
        heal: 0,
        isCrit: false,
        logText,
      },
      defenderHpRemaining: actor.hp,
    };

    return {
      success: true,
      events: [log],
    };
  }
}
