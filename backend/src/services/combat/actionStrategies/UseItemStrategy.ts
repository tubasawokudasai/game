import { BattleActionStrategy } from '../BattleActionStrategy';
import {
  BattleActionCommand,
  BattleActionType,
  BattleActionResult,
  BattleContext,
  Fighter,
  RoundLog,
} from '../types';

/** 默认支持的战斗丹药/消耗品效果配置字典 (配置驱动) */
export const BATTLE_CONSUMABLE_CONFIG: Record<
  string,
  {
    itemId: string;
    itemName: string;
    hpGain: number;
    mpGain: number;
    description: string;
  }
> = {
  item_healing_dan: {
    itemId: 'item_healing_dan',
    itemName: '回春金疮散',
    hpGain: 3000,
    mpGain: 0,
    description: '疗伤灵药，回复 3000 点气血',
  },
  item_juqi_dan: {
    itemId: 'item_juqi_dan',
    itemName: '聚气丹',
    hpGain: 0,
    mpGain: 500,
    description: '凝神聚气，回复 500 点真气法力',
  },
  item_zhuji_dan: {
    itemId: 'item_zhuji_dan',
    itemName: '筑基丹',
    hpGain: 5000,
    mpGain: 2000,
    description: '洗髓伐脉，恢复 5000 点气血与 2000 点真气',
  },
  item_jindan_yuye: {
    itemId: 'item_jindan_yuye',
    itemName: '金丹玉液',
    hpGain: 99999,
    mpGain: 99999,
    description: '状态完全补满',
  },
};

/**
 * 物品使用行动策略 (UseItemStrategy)
 *
 * 规则：
 * 1. 检查背包是否拥有对应物品（通过 context.findItem 联查）；
 * 2. 检查物品是否允许在战斗中使用；
 * 3. 检查目标是否合法（友方存活单位，默认自身）；
 * 4. 根据物品效果执行气血/法力回复；
 * 5. 成功使用后扣除 1 件物品（context.deductItem）；
 * 6. 校验失败时不得扣除物品，并产生说明日志。
 */
export class UseItemStrategy implements BattleActionStrategy {
  readonly actionType = BattleActionType.USE_ITEM;

  async execute(
    context: BattleContext,
    command: BattleActionCommand
  ): Promise<BattleActionResult> {
    const { actor, allies, round, findItem, deductItem } = context;

    if (actor.hp <= 0) {
      return { success: false, events: [] };
    }

    const itemId = command.itemId;
    if (!itemId) {
      const logText = `${actor.name} 翻寻行囊，却未指定使用的法宝丹药！`;
      return {
        success: false,
        events: [this.createLog(round, actor, actor, '使用道具', 0, 0, logText)],
      };
    }

    // 1. 检查背包是否拥有对应物品
    let itemName = itemId;
    let hpGain = 0;
    let mpGain = 0;

    const config = BATTLE_CONSUMABLE_CONFIG[itemId];
    if (config) {
      itemName = config.itemName;
      hpGain = config.hpGain;
      mpGain = config.mpGain;
    }

    if (findItem) {
      const itemRecord = await findItem(actor.id, itemId);
      if (!itemRecord || itemRecord.count <= 0) {
        const logText = `${actor.name} 欲服用【${itemName}】，但行囊中已无存量！`;
        return {
          success: false,
          events: [this.createLog(round, actor, actor, '使用道具', 0, 0, logText)],
        };
      }

      if (!itemRecord.usable) {
        const logText = `${actor.name} 欲使用【${itemRecord.itemName || itemName}】，但此物不可在激战中吞服！`;
        return {
          success: false,
          events: [this.createLog(round, actor, actor, '使用道具', 0, 0, logText)],
        };
      }

      itemName = itemRecord.itemName || itemName;
      if (itemRecord.hpGain !== undefined) hpGain = itemRecord.hpGain;
      if (itemRecord.mpGain !== undefined) mpGain = itemRecord.mpGain;
    }

    // 2. 确定作用目标（单体友方，默认自身）
    const aliveAllies = allies.filter((f) => f.hp > 0);
    const specifiedTargetId = command.targetId || command.targetIds?.[0];
    let target: Fighter | undefined;
    if (specifiedTargetId) {
      target = aliveAllies.find((f) => f.id === specifiedTargetId);
    }
    if (!target) {
      target = actor;
    }

    // 3. 执行治疗与真气恢复效果
    const actualHp = Math.min(target.maxHp - target.hp, hpGain);
    const actualMp = Math.min(target.maxMp - target.mp, mpGain);

    target.hp = Math.min(target.maxHp, target.hp + hpGain);
    target.mp = Math.min(target.maxMp, target.mp + mpGain);

    // 4. 成功后扣减背包道具
    if (deductItem) {
      await deductItem(actor.id, itemId, 1);
    }

    const effectsSummary: string[] = [];
    if (actualHp > 0) effectsSummary.push(`恢复 ${actualHp} 点气血`);
    if (actualMp > 0) effectsSummary.push(`恢复 ${actualMp} 点真气`);
    if (effectsSummary.length === 0) effectsSummary.push('灵光缭绕，神清气爽');

    const logText = `${actor.name} 从行囊中取出【${itemName}】服下/为 ${target.name} 服下，${effectsSummary.join('、')}！`;

    const log = this.createLog(
      round,
      actor,
      target,
      itemName,
      0,
      actualHp,
      logText
    );

    return {
      success: true,
      events: [log],
      itemDeducted: true,
    };
  }

  private createLog(
    round: number,
    actor: Fighter,
    target: Fighter,
    itemName: string,
    damage: number,
    heal: number,
    logText: string
  ): RoundLog {
    return {
      round,
      attackerId: actor.id,
      attackerName: actor.name,
      defenderId: target.id,
      defenderName: target.name,
      skillName: `物品:${itemName}`,
      effect: {
        damage,
        heal,
        isCrit: false,
        logText,
      },
      defenderHpRemaining: target.hp,
    };
  }
}
