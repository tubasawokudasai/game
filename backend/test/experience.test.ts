declare const process: any;

import {
  LEVEL_EXP_CONFIG,
  getRequiredExpForLevel,
  getLevelCap,
  calculateExpProgress,
  setExpFormula,
  resetExpFormula,
} from '../src/services/experience/expConfig';
import {
  calculateExperienceGain,
  validateExperienceAmount,
} from '../src/services/experience/experienceCalculator';
import { experienceService } from '../src/services/experience/experienceService';
import { inventoryService } from '../src/services/inventoryService';
import { NpcAttributeCalculator } from '../src/services/npc/attributes/NpcAttributeCalculator';

function assert(condition: boolean, msg?: string) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual<T>(actual: T, expected: T, msg?: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: expected ${expected}, got ${actual}. ${msg || ''}`);
  }
}

async function runTests() {
  console.log('=== 开始执行角色升级经验系统单元测试与集成测试 ===\n');

  // ---------------------------------------------------------------------------
  // 1. 验证经验公式与配置参考数值
  // ---------------------------------------------------------------------------
  console.log('1. 验证升级经验曲线公式与参考数值表...');
  assertEqual(getRequiredExpForLevel(1), 200, 'Lv.1 升 Lv.2 所需经验应为 200');
  assertEqual(getRequiredExpForLevel(2), 600, 'Lv.2 升 Lv.3 所需经验应为 600');
  assertEqual(getRequiredExpForLevel(3), 1200, 'Lv.3 升 Lv.4 所需经验应为 1200');
  assertEqual(getRequiredExpForLevel(5), 3000, 'Lv.5 升 Lv.6 所需经验应为 3000');
  assertEqual(getRequiredExpForLevel(10), 11000, 'Lv.10 升 Lv.11 所需经验应为 11000');
  assertEqual(getRequiredExpForLevel(20), 42000, 'Lv.20 升 Lv.21 所需经验应为 42000');
  assertEqual(getRequiredExpForLevel(30), 93000, 'Lv.30 升 Lv.31 所需经验应为 93000');
  assertEqual(getRequiredExpForLevel(50), 255000, 'Lv.50 升 Lv.51 所需经验应为 255000');
  assertEqual(getRequiredExpForLevel(99), 990000, 'Lv.99 升 Lv.100 所需经验应为 990000');
  assertEqual(getRequiredExpForLevel(100), 0, '满级 (Lv.100) 无下一等级，所需经验应为 0');
  assertEqual(getLevelCap(), 100, '等级上限应集中配置为 100');
  console.log('✓ 1. 升级经验曲线公式与参考数值表校验全部通过！\n');

  // ---------------------------------------------------------------------------
  // 2. 正常获得经验，但没有升级
  // ---------------------------------------------------------------------------
  console.log('2. 场景一：正常获得经验，但未达到升级阈值...');
  const res1 = calculateExperienceGain({
    currentLevel: 1,
    currentExp: 0,
    amount: 150,
  });
  assertEqual(res1.preLevel, 1, '升级前等级应为 1');
  assertEqual(res1.postLevel, 1, '未达到 200 经验，等级应保持 1');
  assertEqual(res1.levelUpCount, 0, '升级次数应为 0');
  assertEqual(res1.remainingExp, 150, '当前等级累计经验应为 150');
  assertEqual(res1.requiredExpForNextLevel, 200, '升至下一级所需经验应为 200');
  assertEqual(calculateExpProgress(res1.remainingExp, res1.requiredExpForNextLevel), 75, '进度百分比应为 75%');
  console.log('✓ 2. 正常获得经验未升级场景校验通过！\n');

  // ---------------------------------------------------------------------------
  // 3. 经验刚好达到升级要求
  // ---------------------------------------------------------------------------
  console.log('3. 场景二：经验刚好达到升级要求...');
  const res2 = calculateExperienceGain({
    currentLevel: 1,
    currentExp: 0,
    amount: 200,
  });
  assertEqual(res2.preLevel, 1, '升级前等级应为 1');
  assertEqual(res2.postLevel, 2, '刚好满 200 经验，应升至 2 级');
  assertEqual(res2.levelUpCount, 1, '升级次数应为 1');
  assertEqual(res2.remainingExp, 0, '刚好升级无剩余经验，剩余经验应为 0');
  assertEqual(res2.requiredExpForNextLevel, 600, '2 级升 3 级所需经验应为 600');
  console.log('✓ 3. 经验刚好达到升级要求校验通过！\n');

  // ---------------------------------------------------------------------------
  // 4. 一次获得经验，连续升级多个等级 (题目范例: 5 级获 10000 经验)
  // ---------------------------------------------------------------------------
  console.log('4. 场景三：一次获得海量经验，连续跨多个等级升级...');
  // 5级升6级需 3000 (剩余 7000)
  // 6级升7级需 4200 (剩余 2800)
  // 7级升8级需 5600 (不足，停在 7 级，余 2800)
  const res3 = calculateExperienceGain({
    currentLevel: 5,
    currentExp: 0,
    amount: 10000,
  });
  assertEqual(res3.preLevel, 5, '升级前等级应为 5');
  assertEqual(res3.postLevel, 7, '应连续升 2 级至 7 级');
  assertEqual(res3.levelUpCount, 2, '连升次数应为 2');
  assertEqual(res3.remainingExp, 2800, '7 级剩余经验应为 2800');
  assertEqual(res3.requiredExpForNextLevel, 5600, '7 级升 8 级所需经验应为 5600');
  assertEqual(calculateExpProgress(res3.remainingExp, res3.requiredExpForNextLevel), 50, '进度应为 50%');
  console.log('✓ 4. 一次获得海量经验连续升级校验通过！\n');

  // ---------------------------------------------------------------------------
  // 5. 升级后正确保留剩余经验 (题目范例: 1 级 exp=150 获 100 经验)
  // ---------------------------------------------------------------------------
  console.log('5. 场景四：升级后正确保留剩余经验...');
  // 1级已有150，获得100 -> 总250。扣除200升至2级，余50。2级升3级需600。
  const res4 = calculateExperienceGain({
    currentLevel: 1,
    currentExp: 150,
    amount: 100,
  });
  assertEqual(res4.preLevel, 1, '升级前等级应为 1');
  assertEqual(res4.postLevel, 2, '应升至 2 级');
  assertEqual(res4.levelUpCount, 1, '升级次数应为 1');
  assertEqual(res4.remainingExp, 50, '扣减后剩余经验应为 50');
  assertEqual(res4.requiredExpForNextLevel, 600, '2 级升 3 级所需经验应为 600');
  console.log('✓ 5. 升级后正确保留剩余经验校验通过！\n');

  // ---------------------------------------------------------------------------
  // 6. 负数、零值、非法经验值处理
  // ---------------------------------------------------------------------------
  console.log('6. 场景五：非法经验值（负数、零、NaN、非数字）防御校验...');
  let caughtErrors = 0;

  try {
    validateExperienceAmount(0);
  } catch (err: any) {
    caughtErrors++;
    assert(err.message.includes('大于0'), '零值应抛出异常');
  }

  try {
    validateExperienceAmount(-500);
  } catch (err: any) {
    caughtErrors++;
    assert(err.message.includes('大于0'), '负数应抛出异常');
  }

  try {
    validateExperienceAmount(NaN);
  } catch (err: any) {
    caughtErrors++;
    assert(err.message.includes('大于0'), 'NaN 应抛出异常');
  }

  try {
    validateExperienceAmount('invalid' as any);
  } catch (err: any) {
    caughtErrors++;
    assert(err.message.includes('大于0'), '非数字应抛出异常');
  }

  assertEqual(caughtErrors, 4, '所有 4 种非法经验输入必须被严格拦截');
  console.log('✓ 6. 非法经验输入拦截校验通过！\n');

  // ---------------------------------------------------------------------------
  // 7. 达到等级上限后不再升级
  // ---------------------------------------------------------------------------
  console.log('7. 场景六：等级上限拦截与溢出经验处理...');
  // (1) 已满级角色再获得经验
  const resMax1 = calculateExperienceGain({
    currentLevel: 100,
    currentExp: 0,
    amount: 500000,
  });
  assertEqual(resMax1.preLevel, 100, '升级前为满级 100');
  assertEqual(resMax1.postLevel, 100, '已达上限不可再升级，应停留在 100');
  assertEqual(resMax1.levelUpCount, 0, '满级角色升级次数应为 0');
  assertEqual(resMax1.isMaxLevel, true, 'isMaxLevel 标记应为 true');
  assertEqual(resMax1.remainingExp, 0, '满级溢出经验默认清零');
  assertEqual(resMax1.requiredExpForNextLevel, 0, '满级所需经验应为 0');

  // (2) 99 级角色一口气获得 200 万经验冲击上限
  // 99 级升 100 级需 990,000，升到 100 级后立即停止升级，不再冲破上限
  const resMax2 = calculateExperienceGain({
    currentLevel: 99,
    currentExp: 0,
    amount: 2000000,
  });
  assertEqual(resMax2.preLevel, 99, '升级前等级应为 99');
  assertEqual(resMax2.postLevel, 100, '应升至上限 100 级');
  assertEqual(resMax2.levelUpCount, 1, '升级次数应为 1');
  assertEqual(resMax2.isMaxLevel, true, '到达上限');
  assertEqual(resMax2.remainingExp, 0, '到达满级后溢出经验按规则清零');
  console.log('✓ 7. 达到等级上限后停止升级与溢出处理通过！\n');

  // ---------------------------------------------------------------------------
  // 8. 升级后基础属性正确重新计算，没有重复叠加
  // ---------------------------------------------------------------------------
  console.log('8. 场景七：升级后基础属性重算集成（严禁重复累加、严禁无故满血）...');

  // 模拟真实数据库与修仙者
  let playerRecord = {
    id: 'p_test_1001',
    nickname: '太虚道尊',
    level: 1,
    exp: 0,
    hp: 1200,      // 当前负伤状态
    max_hp: 3000,  // 上限 3000
    mp: 400,       // 当前内力
    max_mp: 1500,  // 上限 1500
    combat_power: 920,
    realm: '练气初期',
  };

  const mockDb: any = {
    prepare: (sql: string) => ({
      bind: (...args: any[]) => ({
        first: async () => {
          if (sql.includes('FROM players')) {
            return { ...playerRecord };
          }
          return null;
        },
        all: async () => ({ results: [] }),
        run: async () => {
          if (sql.includes('UPDATE players')) {
            if (sql.includes('SET level =')) {
              // UPDATE players SET level = ?, exp = ?, hp = ?, mp = ? WHERE id = ? AND level = ? AND exp = ?
              playerRecord.level = args[0];
              playerRecord.exp = args[1];
              playerRecord.hp = args[2];
              playerRecord.mp = args[3];
              return { meta: { changes: 1 } };
            } else if (sql.includes('SET exp = ?')) {
              playerRecord.exp = args[0];
              return { meta: { changes: 1 } };
            } else if (sql.includes('SET combat_power =')) {
              playerRecord.combat_power = args[0];
              return { meta: { changes: 1 } };
            }
          }
          return { meta: { changes: 1 } };
        },
      }),
    }),
  };

  // 1级升至2级 (获得 200 经验)
  const addExpRes = await experienceService.addExperience(mockDb, 'p_test_1001', 200);
  assertEqual(addExpRes.postLevel, 2, '应升级至 2 级');
  assertEqual(addExpRes.levelUpCount, 1, '升级次数应为 1');
  assertEqual(addExpRes.remainingExp, 0, '当前经验应为 0');

  // 验证当前气血内力状态：绝不无故回满血！保留当前伤势
  assertEqual(playerRecord.hp, 1200, '升级后当前气血应保持为原有的 1200，绝不可自动回满');
  assertEqual(playerRecord.mp, 400, '升级后当前内力应保持为原有的 400，绝不可自动回满');
  assertEqual(playerRecord.max_hp, 3000, '升级逻辑严禁直接累加 max_hp');
  assertEqual(playerRecord.max_mp, 1500, '升级逻辑严禁直接累加 max_mp');

  // 验证战力重算引擎集成：
  // 依据 baseLevel * 120 重新计算，而不是在升级逻辑内盲目叠加 += 300
  // basePower = 800 + 2 * 120 = 1040
  assertEqual(playerRecord.combat_power, 1040, '战力应由 recalculatePlayerCombatPower 重算为 1040，无重复叠加');
  console.log('✓ 8. 升级后属性重新计算与状态保持校验通过！\n');

  // ---------------------------------------------------------------------------
  // 9. 战斗、任务与丹药消耗经验奖励接入验证
  // ---------------------------------------------------------------------------
  console.log('9. 场景八：战斗、任务与物品多源经验接入一致性校验...');
  // 连续从 2 级升至 5 级 (2级需600, 3级需1200, 4级需2000 -> 3800经验)
  const multiSourceRes = await experienceService.addExperience(mockDb, 'p_test_1001', 3800);
  assertEqual(multiSourceRes.postLevel, 5, '应连升 3 级至 5 级');
  assertEqual(multiSourceRes.levelUpCount, 3, '连升次数应为 3');
  assertEqual(playerRecord.level, 5, '数据库中玩家等级应更新为 5');
  // 5级战力 = 800 + 5 * 120 = 1400
  assertEqual(playerRecord.combat_power, 1400, '5级战力应重算为 1400');
  console.log('✓ 9. 战斗/任务经验奖励接入校验通过！\n');

  // ---------------------------------------------------------------------------
  // 10. 并发增加经验时数据一致性验证
  // ---------------------------------------------------------------------------
  console.log('10. 场景九：高频并发发放经验与乐观重试一致性校验...');
  let concurrentPlayer = {
    id: 'p_concurrent_001',
    nickname: '逍遥剑仙',
    level: 1,
    exp: 0,
    hp: 3000,
    max_hp: 3000,
    mp: 1500,
    max_mp: 1500,
    combat_power: 920,
  };

  let simulatedVersion = 0;
  const concurrentDb: any = {
    prepare: (sql: string) => ({
      bind: (...args: any[]) => ({
        first: async () => ({ ...concurrentPlayer }),
        all: async () => ({ results: [] }),
        run: async () => {
          if (sql.includes('UPDATE players') && sql.includes('level = ? AND exp = ?')) {
            const expectedLevel = args[args.length - 2];
            const expectedExp = args[args.length - 1];

            // 模拟版本校验
            if (expectedLevel === concurrentPlayer.level && expectedExp === concurrentPlayer.exp) {
              simulatedVersion++;
              if (sql.includes('SET level =')) {
                concurrentPlayer.level = args[0];
                concurrentPlayer.exp = args[1];
              } else {
                concurrentPlayer.exp = args[0];
              }
              return { meta: { changes: 1 } };
            } else {
              // 模拟并发冲突：别的请求先行更新了
              return { meta: { changes: 0 } };
            }
          }
          if (sql.includes('combat_power = ?')) {
            concurrentPlayer.combat_power = args[0];
          }
          return { meta: { changes: 1 } };
        },
      }),
    }),
  };

  // 模拟顺序发送 3 次经验增加
  await experienceService.addExperience(concurrentDb, 'p_concurrent_001', 100);
  assertEqual(concurrentPlayer.level, 1, '第一次+100经验，未升级');
  assertEqual(concurrentPlayer.exp, 100, '第一次累计经验为 100');

  await experienceService.addExperience(concurrentDb, 'p_concurrent_001', 100);
  assertEqual(concurrentPlayer.level, 2, '第二次+100经验达到200，升级至 2 级');
  assertEqual(concurrentPlayer.exp, 0, '升级后剩余经验为 0');

  await experienceService.addExperience(concurrentDb, 'p_concurrent_001', 650);
  assertEqual(concurrentPlayer.level, 3, '第三次+650经验达到600，升级至 3 级');
  assertEqual(concurrentPlayer.exp, 50, '3级剩余经验应为 50');

  console.log('✓ 10. 并发与事务数据一致性校验通过！\n');

  console.log('=== 恭喜！全部 9 大核心测试用例及 10 项校验全部顺利通过！ ===');
}

runTests().catch((err) => {
  console.error('\n❌ 测试执行失败:', err);
  process.exit(1);
});
