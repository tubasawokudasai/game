declare const process: any;

import {
  calculateNpcAttributesFromRows,
  NPC_GROWTH_TEMPLATES,
  NPC_QUALITY_DEFINITIONS,
  NPC_REALM_DEFINITIONS,
  npcAttributeCalculator,
} from '../src/services/npc/attributes';
import type {
  NpcAttributeCalculateInput,
  NpcAttributes,
} from '../src/services/npc/attributes';
import {
  filterNpcBattleMemberLevels,
  normalizeNpcBattleMemberLevels,
} from '../src/utils/npcBattleLevels';

function assert(condition: boolean, msg?: string) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual<T>(actual: T, expected: T, msg?: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: expected ${expected}, got ${actual}. ${msg || ''}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`Assertion failed: expected ${b}, got ${a}. ${msg || ''}`);
}

function assertClose(actual: number, expected: number, tolerance: number, msg?: string) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(
      `Assertion failed: expected ${expected} ±${tolerance}, got ${actual}. ${msg || ''}`
    );
  }
}

const ZERO_GROWTH: NpcAttributes = {
  hp: 0,
  mp: 0,
  atk: 0,
  matk: 0,
  def: 0,
  mdef: 0,
  spd: 0,
  crit: 0,
};

function makeSource(overrides: Partial<NpcAttributeCalculateInput> = {}): NpcAttributeCalculateInput {
  return {
    level: 1,
    base: {
      hp: 1000,
      mp: 100,
      atk: 100,
      matk: 100,
      def: 100,
      mdef: 100,
      spd: 100,
      crit: 0.1,
    },
    growth: { ...ZERO_GROWTH },
    quality: 'COMMON',
    ...overrides,
  };
}

export function runNpcAttributeTests() {
  console.log('--- 开始执行 NPC 数值成长系统单元测试 ---');

  // 1. 等级 1 / 10 / 20 / 50 / 100 的公式与四大成长模板
  {
    const levels = [1, 10, 20, 50, 100];
    for (const profile of Object.values(NPC_GROWTH_TEMPLATES)) {
      for (const level of levels) {
        const final = npcAttributeCalculator.calculate({
          level,
          growthTemplate: profile.id,
          quality: 'COMMON',
        });

        const expectedHp = Math.max(
          1,
          Math.round(profile.base.hp + (level - 1) * profile.growth.hp)
        );
        const expectedMp = Math.max(
          0,
          Math.round(profile.base.mp + (level - 1) * profile.growth.mp)
        );
        const expectedAtk = Math.max(
          1,
          Math.round(profile.base.atk + (level - 1) * profile.growth.atk)
        );
        const expectedMatk = Math.max(
          0,
          Math.round(profile.base.matk + (level - 1) * profile.growth.matk)
        );
        const expectedDef = Math.max(
          0,
          Math.round(profile.base.def + (level - 1) * profile.growth.def)
        );
        const expectedMdef = Math.max(
          0,
          Math.round(profile.base.mdef + (level - 1) * profile.growth.mdef)
        );
        const expectedSpd = Math.max(
          1,
          Math.round(profile.base.spd + (level - 1) * profile.growth.spd)
        );
        const expectedCrit =
          Math.round(
            Math.min(
              1,
              Math.max(0, profile.base.crit + (level - 1) * profile.growth.crit)
            ) * 10000
          ) / 10000;

        assertEqual(final.maxHp, expectedHp, `${profile.label} Lv.${level} HP 公式`);
        assertEqual(final.maxMp, expectedMp, `${profile.label} Lv.${level} MP 公式`);
        assertEqual(final.atk, expectedAtk, `${profile.label} Lv.${level} ATK 公式`);
        assertEqual(final.matk, expectedMatk, `${profile.label} Lv.${level} MATK 公式`);
        assertEqual(final.def, expectedDef, `${profile.label} Lv.${level} DEF 公式`);
        assertEqual(final.mdef, expectedMdef, `${profile.label} Lv.${level} MDEF 公式`);
        assertEqual(final.spd, expectedSpd, `${profile.label} Lv.${level} SPD 公式`);
        assertEqual(final.crit, expectedCrit, `${profile.label} Lv.${level} CRIT 公式`);
        assertEqual(final.hp, final.maxHp, 'hp 必须等于最终 maxHp');
        assertEqual(final.mp, final.maxMp, 'mp 必须等于最终 maxMp');
        assertEqual(final.currentHp, final.maxHp, '新生成 NPC 应满血');
        assertEqual(final.currentMp, final.maxMp, '新生成 NPC 应满蓝');

        const direct = npcAttributeCalculator.calculateFromGrowthTemplate(profile.id, level);
        assertEqual(direct.hp, expectedHp, `${profile.label} Lv.${level} calculateFromGrowthTemplate`);
        assertEqual(direct.matk, expectedMatk, `${profile.label} Lv.${level} 模板直算 MATK`);
      }
    }
    console.log('✓ 1. 四大成长模板在 Lv.1/10/20/50/100 的公式全部通过');
  }

  // 2. 数据库直存成长值：不再存在 base × 10% 的运行时兼容推导
  {
    const level = 15;
    const base: NpcAttributes = {
      hp: 15800,
      mp: 300,
      atk: 3200,
      matk: 3200,
      def: 1800,
      mdef: 1800,
      spd: 150,
      crit: 0.25,
    };
    const growth: NpcAttributes = {
      hp: 1580,
      mp: 30,
      atk: 320,
      matk: 320,
      def: 180,
      mdef: 180,
      spd: 15,
      crit: 0,
    };

    const final = npcAttributeCalculator.calculate({
      level,
      base,
      growth,
      quality: 'COMMON',
    });
    assertEqual(final.maxHp, 15800 + 14 * 1580, '数据库成长值应直接参与计算');
    assertEqual(final.atk, 3200 + 14 * 320, '数据库攻击成长应直接参与计算');
    assertEqual(final.growthSource, 'database', '显式 growth 应标记为 database');

    const withoutGrowth = npcAttributeCalculator.calculate({
      level,
      base,
      quality: 'COMMON',
    });
    assertEqual(withoutGrowth.maxHp, 15800, '缺少 growth 时不得再按 base × 10% 推导');
    assertEqual(withoutGrowth.atk, 3200, '缺少 growth 时攻击应保持基础值');
    assertEqual(withoutGrowth.growthSource, 'none', '无成长来源应标记为 none');
    console.log('✓ 2. 数据库直存成长值 / 无旧版推导测试通过');
  }

  // 3. 品质倍率：普通 / 精英 / 首领 / 传说
  {
    const level = 20;
    const common = npcAttributeCalculator.calculate({
      level,
      growthTemplate: 'balanced',
      quality: 'COMMON',
    });

    for (const quality of ['ELITE', 'BOSS', 'LEGENDARY'] as const) {
      const definition = NPC_QUALITY_DEFINITIONS[quality];
      const final = npcAttributeCalculator.calculate({
        level,
        growthTemplate: 'balanced',
        quality,
      });
      assertEqual(
        final.maxHp,
        Math.round(common.breakdown.afterQuality.hp * definition.statMultiplier),
        `${definition.label} 倍率应作用于 HP`
      );
      assertClose(
        final.maxHp / common.maxHp,
        definition.statMultiplier,
        0.01,
        `${definition.label} HP 倍率`
      );
      assertClose(
        final.crit / common.crit,
        definition.critMultiplier,
        0.01,
        `${definition.label} 暴击倍率`
      );
      assertEqual(final.quality, definition.id, '品质 ID 应正确回传');
    }
    console.log('✓ 3. 四档品质倍率及差异测试通过');
  }

  // 4. 职业成长差异
  {
    const level = 50;
    const warrior = npcAttributeCalculator.calculate({ level, growthTemplate: 'warrior' });
    const mage = npcAttributeCalculator.calculate({ level, growthTemplate: 'mage' });
    const support = npcAttributeCalculator.calculate({ level, growthTemplate: 'support' });
    const balanced = npcAttributeCalculator.calculate({ level, growthTemplate: 'balanced' });

    assert(warrior.maxHp > mage.maxHp, '战士气血应高于法术型');
    assert(warrior.def > mage.def, '战士物防应高于法术型');
    assert(mage.matk > warrior.matk, '法术型法攻应高于战士');
    assert(mage.mdef > warrior.mdef, '法术型法防应高于战士');
    assert(support.mdef > warrior.mdef, '辅助型法防应高于战士');
    assert(support.maxMp > warrior.maxMp, '辅助型内力应高于战士');
    assert(
      Math.abs(balanced.atk - balanced.matk) <= 1,
      '均衡型物攻与法攻应接近'
    );
    console.log('✓ 4. 战士/法术/均衡/辅助成长差异测试通过');
  }

  // 5. 境界加成：不修改基础成长模板，仅影响最终输出
  {
    const level = 20;
    const baseBefore = { ...NPC_GROWTH_TEMPLATES.balanced.base };
    const growthBefore = { ...NPC_GROWTH_TEMPLATES.balanced.growth };
    const noRealm = npcAttributeCalculator.calculate({
      level,
      growthTemplate: 'balanced',
      realm: null,
    });
    const goldenCore = npcAttributeCalculator.calculate({
      level,
      growthTemplate: 'balanced',
      realm: '金丹中期',
    });

    assertClose(goldenCore.maxHp / noRealm.maxHp, 1.1, 0.01, '金丹 +10% 气血');
    assert(goldenCore.crit > noRealm.crit, '金丹应提供额外暴击');
    assertEqual(goldenCore.realmLabel, '金丹', '境界文案匹配');
    assertEqual(
      NPC_GROWTH_TEMPLATES.balanced.base.hp,
      baseBefore.hp,
      '境界加成不得修改成长模板 base'
    );
    assertEqual(
      NPC_GROWTH_TEMPLATES.balanced.growth.hp,
      growthBefore.hp,
      '境界加成不得修改成长模板 growth'
    );
    assertEqual(
      noRealm.growthTemplateId,
      'balanced',
      '无境界时成长模板仍应正确回传'
    );
    console.log('✓ 5. 境界加成与成长模板隔离测试通过');
  }

  // 6. 装备 / 永久属性加成
  {
    const final = npcAttributeCalculator.calculate(
      makeSource({
        bonuses: {
          equipment: [
            { sourceId: 'eq_sword', flat: { atk: 50 }, percent: { matk: 0.2 } },
            { sourceId: 'eq_robe', percent: { def: 0.1, mdef: 0.1 } },
          ],
          permanent: [{ sourceId: 'title', flat: { hp: 100 }, percent: { hp: 0.1 } }],
        },
      })
    );

    assertEqual(final.atk, 150, '装备固定攻击加成');
    assertEqual(final.matk, 120, '装备百分比法攻加成');
    assertEqual(final.def, 110, '装备百分比物防加成');
    assertEqual(final.mdef, 110, '装备百分比法防加成');
    // (1000 + 100) × 1.1 = 1210
    assertEqual(final.maxHp, 1210, '永久固定 + 百分比气血加成');
    console.log('✓ 6. 装备与永久属性加成测试通过');
  }

  // 7. 数据一致性：重算不恢复生命/内力，升级保留当前值，降级夹取
  {
    const source = makeSource({
      level: 10,
      base: {
        hp: 1000,
        mp: 500,
        atk: 100,
        matk: 100,
        def: 100,
        mdef: 100,
        spd: 100,
        crit: 0.1,
      },
      growth: {
        hp: 100,
        mp: 50,
        atk: 10,
        matk: 10,
        def: 10,
        mdef: 10,
        spd: 1,
        crit: 0.001,
      },
    });

    const full = npcAttributeCalculator.calculate(source);
    const hurt = npcAttributeCalculator.calculate({
      ...source,
      current: { hp: 123, mp: 45 },
    });
    assertEqual(hurt.currentHp, 123, '重算应保留当前气血');
    assertEqual(hurt.currentMp, 45, '重算应保留当前内力');
    assert(hurt.currentHp < full.currentHp, '重算不得自动回满');

    const upgraded = npcAttributeCalculator.recalculate(hurt, { ...source, level: 20 });
    assert(upgraded.maxHp > hurt.maxHp, '升级后最大气血应提高');
    assertEqual(upgraded.currentHp, 123, '升级不得凭空恢复当前气血');
    assertEqual(upgraded.currentMp, 45, '升级不得凭空恢复当前内力');

    // 先构造一个当前值高于新上限的状态，验证降级夹取
    const highState = npcAttributeCalculator.calculate({
      ...source,
      level: 50,
      current: { hp: 999999, mp: 999999 },
    });
    const downgraded = npcAttributeCalculator.recalculate(highState, { ...source, level: 1 });
    assert(downgraded.maxHp < highState.maxHp, '降级后最大气血应降低');
    assertEqual(downgraded.currentHp, downgraded.maxHp, '降级后当前气血应夹取到新上限');
    assertEqual(downgraded.currentMp, downgraded.maxMp, '降级后当前内力应夹取到新上限');

    const equipped = npcAttributeCalculator.recalculate(hurt, {
      ...source,
      bonuses: { equipment: [{ flat: { hp: 500, mp: 100 } }] },
    });
    assert(equipped.maxHp > hurt.maxHp, '换装后最大气血应提高');
    assertEqual(equipped.currentHp, 123, '换装不得恢复当前气血');
    assertEqual(equipped.currentMp, 45, '换装不得恢复当前内力');

    const dead = npcAttributeCalculator.calculate({
      ...source,
      current: { hp: 0, mp: 0 },
    });
    assertEqual(dead.currentHp, 0, '阵亡状态重算后仍应为 0');
    assertEqual(dead.currentMp, 0, '空蓝状态重算后仍应为 0');

    const revivedByEquipment = npcAttributeCalculator.recalculate(dead, {
      ...source,
      level: 20,
      bonuses: {
        equipment: [{ flat: { hp: 500 } }],
      },
    });
    assertEqual(revivedByEquipment.currentHp, 0, '换装提高上限也不得自动复活/回血');
    console.log('✓ 7. 重算/升级/降级/阵亡状态一致性测试通过');
  }

  // 8. 战斗配置覆盖值优先级最高
  {
    const final = npcAttributeCalculator.calculate({
      level: 50,
      growthTemplate: 'warrior',
      quality: 'LEGENDARY',
      overrides: {
        hp: 9999,
        atk: 1234,
        def: 0,
        spd: 88,
      },
    });
    assertEqual(final.maxHp, 9999, 'HP 覆盖值应优先');
    assertEqual(final.atk, 1234, 'ATK 覆盖值应优先');
    assertEqual(final.def, 0, 'DEF 覆盖值可为 0');
    assertEqual(final.spd, 88, 'SPD 覆盖值应优先');
    console.log('✓ 8. 战斗配置属性覆盖测试通过');
  }

  // 9. 数据库行映射：实例品质/加成覆盖模板，且成长模板正确生效
  {
    const final = calculateNpcAttributesFromRows({
      template: {
        base_hp: 1000,
        base_mp: 100,
        base_attack: 100,
        base_defense: 100,
        base_speed: 100,
        base_crit: 0.1,
        growth_template: 'warrior',
        quality: 'COMMON',
        bonus_json: '{"permanent":[{"flat":{"atk":10}}]}',
        growth_hp: null,
        growth_mp: null,
        growth_attack: null,
        growth_matk: null,
        growth_defense: null,
        growth_mdef: null,
        growth_speed: null,
        growth_crit: null,
      },
      instance: {
        quality: 'BOSS',
        growth_template: null,
        bonus_json: '{"equipment":[{"percent":{"hp":0.1}}]}',
      },
      realm: '筑基初期',
      level: 10,
    });

    assertEqual(final.quality, 'BOSS', '实例品质应覆盖模板品质');
    assertEqual(final.growthTemplateId, 'warrior', '实例未指定时继承模板成长模板');
    assertEqual(final.realmLabel, '筑基', '境界应由实例/调用方传入');

    // 期望值按统一流水线手算：等级成长 -> 品质 -> 境界 -> 加成
    const bossMultiplier = NPC_QUALITY_DEFINITIONS.BOSS.statMultiplier;
    const foundationPercent =
      NPC_REALM_DEFINITIONS.find((realm) => realm.id === 'FOUNDATION')?.percentBonus || 0;
    const leveledAtk = 100 + 9 * NPC_GROWTH_TEMPLATES.warrior.growth.atk;
    const leveledHp = 1000 + 9 * NPC_GROWTH_TEMPLATES.warrior.growth.hp;
    assertEqual(
      final.atk,
      Math.round(leveledAtk * bossMultiplier * (1 + foundationPercent) + 10),
      '模板永久加成应在品质/境界之后叠加'
    );
    assertEqual(
      final.maxHp,
      Math.round(leveledHp * bossMultiplier * (1 + foundationPercent) * 1.1),
      '实例装备百分比加成应最后叠加'
    );
    console.log('✓ 9. 模板行/实例行统一映射测试通过');
  }

  // 10. 等级预览：去重、排序、数量正确
  {
    const rows = npcAttributeCalculator.preview(
      { growthTemplate: 'mage', quality: 'ELITE' },
      [100, 10, 1, 20, 50, 10]
    );
    assertEqual(rows.length, 5, '预览等级应去重');
    assertEqual(rows[0].level, 1, '预览等级应升序');
    assertEqual(rows[4].level, 100, '预览等级应完整');
    assert(rows.every((row) => row.quality === 'ELITE'), '预览应携带品质');
    console.log('✓ 10. 多等级成长预览测试通过');
  }

  // 11. 地图 NPC 专属敌方槽位等级：解析、夹取与槽位过滤
  {
    assertDeepEqual(
      normalizeNpcBattleMemberLevels('{"0":20,"1":15,"2":0,"9":30}'),
      { '0': 20, '1': 15, '2': 1 },
      '对象格式应解析并夹取等级'
    );
    assertDeepEqual(
      normalizeNpcBattleMemberLevels([
        { slot_index: 0, level: 22 },
        { slot_index: 1, level: 16 },
      ]),
      { '0': 22, '1': 16 },
      '数组格式应解析'
    );
    assertDeepEqual(
      filterNpcBattleMemberLevels({ '0': 20, '1': 15, '2': 18 }, [0, 2]),
      { '0': 20, '2': 18 },
      '不在当前战斗配置中的槽位应被过滤'
    );
    console.log('✓ 11. 地图 NPC 专属槽位等级解析与过滤测试通过');
  }

  console.log('--- 恭喜！NPC 数值成长系统 11 项测试全部通过！ ---');
}

if (typeof process !== 'undefined' && process.argv[1]?.includes('npcAttributes.test')) {
  try {
    runNpcAttributeTests();
  } catch (err) {
    console.error('测试失败:', err);
    process.exit(1);
  }
}
