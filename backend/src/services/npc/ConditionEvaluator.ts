import { DialogueCondition } from '../../models/dialogue';
import { PlayerDialogueContext } from '../../models/dialogueRows';

/**
 * 【规约模式】条件评估器 (ConditionEvaluator)
 * 职责：
 * 一次性结合内存中的 PlayerDialogueContext，执行前置条件毫秒级断言。
 * 支持在可视化配置中组合多种判定规则 (MIN_LEVEL, HAS_ITEM, QUEST_STATUS, HAS_FLAG)。
 */
export class ConditionEvaluator {
  /**
   * 评估单个条件
   */
  static evaluate(
    condition: DialogueCondition,
    ctx: PlayerDialogueContext
  ): { passed: boolean; reason?: string } {
    switch (condition.type) {
      case 'MIN_LEVEL': {
        const currentLevel = ctx.player.level ?? 1;
        if (currentLevel < condition.level) {
          return {
            passed: false,
            reason: `需修为达到等级 ${condition.level}（当前等级 ${currentLevel}）`,
          };
        }
        return { passed: true };
      }

      case 'HAS_ITEM': {
        const owned = ctx.inventoryMap.get(condition.itemId) ?? 0;
        if (owned < condition.count) {
          return {
            passed: false,
            reason: `背包中缺少关键机缘信物 [${condition.itemId}]（需 ${condition.count}，持有 ${owned}）`,
          };
        }
        return { passed: true };
      }

      case 'QUEST_STATUS': {
        const currentStatus = ctx.questStatusMap.get(condition.questId) ?? 'NONE';
        if (currentStatus !== condition.status) {
          const statusNames: Record<string, string> = {
            NONE: '未接取',
            ACTIVE: '进行中',
            DONE: '已达成未提交',
            SUBMITTED: '已完结',
          };
          return {
            passed: false,
            reason: `天机机缘未至（需委托处于【${statusNames[condition.status] || condition.status}】）`,
          };
        }
        return { passed: true };
      }

      case 'HAS_FLAG': {
        const val = ctx.flagsMap.get(condition.key) ?? 0;
        const expected = condition.expectedValue ?? 1;
        if (val !== expected) {
          return {
            passed: false,
            reason: `剧情机缘条件不符 [${condition.key}]`,
          };
        }
        return { passed: true };
      }

      // 未知条件类型一律按未满足处理（fail-closed），避免配置写错反而放行
      default:
        return {
          passed: false,
          reason: '未知的对话条件类型',
        };
    }
  }

  /**
   * 批量评估所有条件（AND 逻辑：全部满足才算通过）
   */
  static evaluateAll(
    conditions: DialogueCondition[],
    ctx: PlayerDialogueContext
  ): { passed: boolean; reason?: string } {
    for (const cond of conditions) {
      const res = this.evaluate(cond, ctx);
      if (!res.passed) {
        return res;
      }
    }
    return { passed: true };
  }
}
