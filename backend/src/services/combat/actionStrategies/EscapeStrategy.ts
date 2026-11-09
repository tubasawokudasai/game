import { BattleActionStrategy } from '../BattleActionStrategy';
import {
  BattleActionCommand,
  BattleActionType,
  BattleActionResult,
  BattleContext,
  RoundLog,
} from '../types';

/**
 * 逃跑行动策略 (EscapeStrategy)
 *
 * 规则：
 * 1. 检查当前战斗是否允许逃跑（context.allowEscape）；
 * 2. 计算逃跑成功率（基于角色身法与敌方平均敏捷对比，基础 60%，浮动在 20% ~ 90% 之间）；
 * 3. 成功则标记 escaped: true，由回合管理器中断后续出招并结算脱离战场；
 * 4. 失败则消耗本回合行动机会；
 * 5. 产出战斗事件，客户端不得绕过服务端自主判定逃跑。
 */
export class EscapeStrategy implements BattleActionStrategy {
  readonly actionType = BattleActionType.ESCAPE;

  async execute(
    context: BattleContext,
    _command: BattleActionCommand
  ): Promise<BattleActionResult> {
    const { actor, enemies, round, allowEscape } = context;

    if (actor.hp <= 0) {
      return { success: false, events: [] };
    }

    // 1. 检查是否允许逃跑（切磋论道或特殊决战可能禁止逃跑）
    if (allowEscape === false) {
      const logText = `${actor.name} 欲捏碎遁符抽身而退，但战场天地已被强大威压封锁，无法临阵遁走！`;
      const log: RoundLog = {
        round,
        attackerId: actor.id,
        attackerName: actor.name,
        defenderId: actor.id,
        defenderName: actor.name,
        skillName: '施展遁法',
        effect: {
          damage: 0,
          heal: 0,
          isCrit: false,
          logText,
        },
        defenderHpRemaining: actor.hp,
      };

      return {
        success: false,
        escaped: false,
        events: [log],
        message: '此场战斗不可逃跑',
      };
    }

    // 2. 计算逃跑成功率
    const aliveEnemies = enemies.filter((f) => f.hp > 0);
    const avgEnemySpeed =
      aliveEnemies.length > 0
        ? aliveEnemies.reduce((sum, e) => sum + e.speed, 0) / aliveEnemies.length
        : 100;

    // 身法每高出 10 点，逃跑率增加 5%
    const speedDelta = actor.speed - avgEnemySpeed;
    const escapeRate = Math.min(0.9, Math.max(0.2, 0.6 + speedDelta * 0.005));
    const isSuccess = Math.random() < escapeRate;

    if (isSuccess) {
      const logText = `${actor.name} 见机极快，化作一道破空遁光撕裂重围，成功脱离战场！`;
      const log: RoundLog = {
        round,
        attackerId: actor.id,
        attackerName: actor.name,
        defenderId: actor.id,
        defenderName: actor.name,
        skillName: '遁术逃生',
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
        escaped: true,
        events: [log],
      };
    } else {
      const logText = `${actor.name} 纵身欲使金蝉脱壳之术，却被敌方强横气机阻遏，遁法被破，未能脱身！`;
      const log: RoundLog = {
        round,
        attackerId: actor.id,
        attackerName: actor.name,
        defenderId: actor.id,
        defenderName: actor.name,
        skillName: '遁术逃生',
        effect: {
          damage: 0,
          heal: 0,
          isCrit: false,
          logText,
        },
        defenderHpRemaining: actor.hp,
      };

      return {
        success: false,
        escaped: false,
        events: [log],
      };
    }
  }
}
