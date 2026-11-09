declare const process: any;

import {
  BattleActionType,
  BattleActionCommand,
  BattleContext,
  Fighter,
} from '../src/services/combat/types';
import { BattleActionExecutor } from '../src/services/combat/BattleActionExecutor';
import { NormalAttackStrategy } from '../src/services/combat/actionStrategies/NormalAttackStrategy';
import { DefendStrategy } from '../src/services/combat/actionStrategies/DefendStrategy';
import { UseItemStrategy } from '../src/services/combat/actionStrategies/UseItemStrategy';
import { EscapeStrategy } from '../src/services/combat/actionStrategies/EscapeStrategy';
import { DuelSession } from '../src/services/combat/DuelSession';
import { CombatEngine } from '../src/services/combat/CombatEngine';

function assert(condition: boolean, msg?: string) {
  if (!condition) {
    throw new Error(msg || 'Assertion failed');
  }
}

function assertEqual<T>(actual: T, expected: T, msg?: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: expected ${expected}, got ${actual}. ${msg || ''}`);
  }
}

function createMockFighter(overrides: Partial<Fighter> = {}): Fighter {
  return {
    id: overrides.id || 'f_1',
    name: overrides.name || '剑修道友',
    realm: '筑基初期',
    hp: overrides.hp ?? 1000,
    maxHp: overrides.maxHp ?? 1000,
    mp: overrides.mp ?? 500,
    maxMp: overrides.maxMp ?? 500,
    outerAttack: overrides.outerAttack ?? 200,
    innerAttack: overrides.innerAttack ?? 150,
    outerDefense: overrides.outerDefense ?? 50,
    innerDefense: overrides.innerDefense ?? 40,
    critRate: overrides.critRate ?? 0,
    critDmg: 1.5,
    speed: overrides.speed ?? 100,
    buffs: overrides.buffs ?? [],
    equippedSkills: overrides.equippedSkills ?? ['skill_pure_yang_sword'],
  };
}

export async function runAllTests() {
  console.log('--- 开始执行战斗行动策略与执行调度器单元测试 ---');

  // 测试 1
  {
    const attacker = createMockFighter({ id: 'a1', outerAttack: 300, critRate: 0 });
    const defender = createMockFighter({ id: 'd1', hp: 1000, outerDefense: 100 });
    const strategy = new NormalAttackStrategy();

    const context: BattleContext = {
      round: 1,
      actor: attacker,
      allies: [attacker],
      enemies: [defender],
    };

    const command: BattleActionCommand = {
      actorId: 'a1',
      actionType: BattleActionType.NORMAL_ATTACK,
      targetId: 'd1',
    };

    const result = await strategy.execute(context, command);
    assert(result.success, '普攻应当执行成功');
    assertEqual(result.events.length, 1, '产生 1 条战报');
    assertEqual(result.events[0].effect.damage, 200, '基础伤害应为 300 - 100 = 200');
    assertEqual(defender.hp, 800, '目标气血应扣减至 800');
    console.log('✓ 1. 普通攻击策略测试通过');
  }

  // 测试 2
  {
    const actor = createMockFighter({ id: 'def1', outerDefense: 80 });
    const strategy = new DefendStrategy();

    const context: BattleContext = {
      round: 1,
      actor,
      allies: [actor],
      enemies: [createMockFighter({ id: 'e1' })],
    };

    const command: BattleActionCommand = {
      actorId: 'def1',
      actionType: BattleActionType.DEFEND,
    };

    const result = await strategy.execute(context, command);
    assert(result.success, '防御策略应当执行成功');
    assertEqual(actor.buffs.length, 1, '获得防御 Buff');
    assertEqual(actor.buffs[0].type, 'SHIELD', 'Buff 类型为 SHIELD');
    assertEqual(actor.buffs[0].value, 0.5, '50% 减伤');
    assertEqual(actor.outerDefense, 80, '基础防御不得被永久修改');

    // 测试普攻打在防御状态下的角色
    const attacker = createMockFighter({ id: 'atk1', outerAttack: 280, critRate: 0 });
    const normalAtk = new NormalAttackStrategy();
    const atkContext: BattleContext = {
      round: 1,
      actor: attacker,
      allies: [attacker],
      enemies: [actor],
    };
    const atkResult = await normalAtk.execute(atkContext, {
      actorId: 'atk1',
      actionType: BattleActionType.NORMAL_ATTACK,
      targetId: 'def1',
    });

    // 原始伤害 280 - 80 = 200；50% 减免后为 100
    assertEqual(atkResult.events[0].effect.damage, 100, '受击减免 50% 伤害');
    console.log('✓ 2. 防御策略与伤害减免测试通过');
  }

  // 测试 3
  {
    const actor = createMockFighter({ id: 'u1', hp: 300, maxHp: 1000 });
    let inventoryCount = 2;
    let deductedCount = 0;

    const strategy = new UseItemStrategy();
    const context: BattleContext = {
      round: 1,
      actor,
      allies: [actor],
      enemies: [createMockFighter({ id: 'e1' })],
      findItem: async (_actorId, itemId) => {
        if (itemId === 'item_healing_dan') {
          return {
            id: 'inv_1',
            itemId: 'item_healing_dan',
            itemName: '回春金疮散',
            count: inventoryCount,
            usable: true,
            hpGain: 500,
          };
        }
        return null;
      },
      deductItem: async (_actorId, _itemId, count) => {
        deductedCount += count;
        inventoryCount -= count;
        return true;
      },
    };

    // 成功使用
    const command: BattleActionCommand = {
      actorId: 'u1',
      actionType: BattleActionType.USE_ITEM,
      itemId: 'item_healing_dan',
      targetId: 'u1',
    };
    const result = await strategy.execute(context, command);
    assert(result.success, '使用物品应成功');
    assert(result.itemDeducted === true, '应标记物品扣减');
    assertEqual(deductedCount, 1, '扣除 1 个物品');
    assertEqual(actor.hp, 800, '气血应恢复至 800');

    // 道具存量为 0 时失败且不扣除
    inventoryCount = 0;
    const failResult = await strategy.execute(context, command);
    assert(!failResult.success, '物品不足应返回失败');
    assertEqual(deductedCount, 1, '失败时不得扣减道具');
    console.log('✓ 3. 物品使用与扣减安全测试通过');
  }

  // 测试 4
  {
    const actor = createMockFighter({ id: 'esc1', speed: 1000 });
    const enemy = createMockFighter({ id: 'boss1', speed: 10 });
    const strategy = new EscapeStrategy();

    // 禁止逃跑环境
    const forbiddenCtx: BattleContext = {
      round: 1,
      actor,
      allies: [actor],
      enemies: [enemy],
      allowEscape: false,
    };
    const forbiddenResult = await strategy.execute(forbiddenCtx, {
      actorId: 'esc1',
      actionType: BattleActionType.ESCAPE,
    });
    assert(!forbiddenResult.success, '禁止逃跑时应当失败');
    assert(!forbiddenResult.escaped, '未脱离');

    // 允许逃跑环境
    const allowCtx: BattleContext = {
      round: 1,
      actor,
      allies: [actor],
      enemies: [enemy],
      allowEscape: true,
    };
    // 逃跑判定包含随机数；测试中固定随机源，避免偶发失败
    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      const allowResult = await strategy.execute(allowCtx, {
        actorId: 'esc1',
        actionType: BattleActionType.ESCAPE,
      });
      assert(allowResult.success, '高敏捷逃跑应成功');
      assert(allowResult.escaped === true, 'escaped 标记为 true');
    } finally {
      Math.random = originalRandom;
    }
    console.log('✓ 4. 逃跑策略与规则限制测试通过');
  }

  // 测试 5
  {
    const executor = new BattleActionExecutor();
    const actor = createMockFighter({ id: 'a1' });
    const enemy = createMockFighter({ id: 'e1' });
    const context: BattleContext = {
      round: 1,
      actor,
      allies: [actor],
      enemies: [enemy],
      allowEscape: true,
    };

    const atkRes = await executor.execute(context, {
      actorId: 'a1',
      actionType: BattleActionType.NORMAL_ATTACK,
    });
    assert(atkRes.success, '分发普攻应成功');

    const defRes = await executor.execute(context, {
      actorId: 'a1',
      actionType: BattleActionType.DEFEND,
    });
    assert(defRes.success, '分发防御应成功');
    assert(actor.buffs.some((b) => b.type === 'SHIELD'), '防御 Buff 生效');
    console.log('✓ 5. BattleActionExecutor 策略分发测试通过');
  }

  // 测试 6
  {
    const fastHero = createMockFighter({ id: 'h1', speed: 200, hp: 500 });
    const slowHero = createMockFighter({ id: 'h2', speed: 180, hp: 500 });
    const enemy = createMockFighter({ id: 'm1', speed: 10, hp: 500 });

    const session = new DuelSession(
      new CombatEngine(),
      [fastHero, slowHero],
      [enemy],
      20,
      undefined,
      { allowEscape: true }
    );

    // 注入逃跑策略测试中断行为
    session.executor.registerStrategy(BattleActionType.ESCAPE, {
      actionType: BattleActionType.ESCAPE,
      execute: async () => ({
        success: true,
        escaped: true,
        events: [
          {
            round: 1,
            attackerId: 'h1',
            attackerName: 'h1',
            defenderId: 'h1',
            defenderName: 'h1',
            skillName: '遁术逃生',
            effect: { damage: 0, heal: 0, isCrit: false, logText: '成功脱离战场！' },
            defenderHpRemaining: 500,
          },
        ],
      }),
    });

    const allyActions = new Map();
    allyActions.set('h1', { actionType: BattleActionType.ESCAPE });
    allyActions.set('h2', { actionType: BattleActionType.NORMAL_ATTACK });

    const outcome = await session.playRound(allyActions, new Map());
    assert(outcome.escaped === true, '结果标记 escaped');
    assert(outcome.finished === true, '战斗已终止');
    assertEqual(outcome.events.length, 1, '逃跑成功后立即终止后续出招，仅有 1 条战报');
    console.log('✓ 6. DuelSession 逃跑中断与回合生命周期测试通过');
  }

  console.log('--- 恭喜！全部 6 项核心测试用例顺利通过！ ---');
}

if (typeof process !== 'undefined' && process.argv[1]?.includes('combatStrategies.test')) {
  runAllTests().catch((err) => {
    console.error('测试失败:', err);
    process.exit(1);
  });
}
