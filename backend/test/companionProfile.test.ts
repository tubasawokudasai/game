declare const process: any;

import { calculateNpcAttributesFromRows } from '../src/services/npc/attributes/npcAttributeService';
import { toLeaderDto } from '../src/db/partyDb';
import { PlayerRecord } from '../src/models/types';

function assert(condition: boolean, msg?: string) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual<T>(actual: T, expected: T, msg?: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: expected ${expected}, got ${actual}. ${msg || ''}`);
  }
}

async function runTests() {
  console.log('--- 开始执行伙伴档案与气血内力展示单元测试 ---');

  // 1. 验证主角阵眼 DTO 包含等级、气血与内力值
  console.log('1. 验证主角阵眼 DTO 属性映射...');
  const mockLeader: PlayerRecord = {
    id: 'p_leader_01',
    nickname: '青云剑修',
    level: 25,
    exp: 5000,
    hp: 18540,
    max_hp: 18540,
    mp: 9620,
    max_mp: 9620,
    combat_power: 6500,
    sect: '纯阳宫',
    realm: '金丹初期',
    silver: 1000,
    ingot: 50,
    copper: 2000,
    zone_id: 'changle_city',
    area_id: 'square',
    signature: '剑道独尊',
    avatar: '/assets/avatar1.png',
    title: '纯阳真人',
    status: 'ONLINE',
    is_guest: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const leaderDto = toLeaderDto(mockLeader);
  assertEqual(leaderDto.id, 'p_leader_01', '主角ID应匹配');
  assertEqual(leaderDto.level, 25, '主角等级应正确');
  assertEqual(leaderDto.hp, 18540, '主角当前气血应正确映射');
  assertEqual(leaderDto.maxHp, 18540, '主角最大气血应正确映射');
  assertEqual(leaderDto.mp, 9620, '主角当前内力应正确映射');
  assertEqual(leaderDto.maxMp, 9620, '主角最大内力应正确映射');
  console.log('✓ 1. 主角阵眼 DTO 等级、气血、内力值映射测试通过');

  // 2. 验证伙伴 NPC 模板属性推演具备等级、气血上限与内力上限
  console.log('2. 验证伙伴（苍云剑客）属性推演计算...');
  const cangyunAttrs = calculateNpcAttributesFromRows({
    template: {
      base_hp: 15800,
      base_mp: 300,
      base_attack: 1800,
      base_defense: 900,
      base_speed: 100,
      base_matk: 0,
      base_mdef: 0,
      base_crit: 0.05,
      growth_hp: 500,
      growth_mp: 50,
      growth_attack: 80,
      growth_matk: 0,
      growth_defense: 40,
      growth_mdef: 20,
      growth_speed: 1,
      growth_crit: 0,
      growth_template: 'physical_dps',
      quality: 'COMMON',
      bonus_json: '{}',
    },
    instance: null,
    level: 10,
    realm: '筑基中期',
  });

  assert(cangyunAttrs.maxHp > 15800, 'Lv.10 伙伴气血必须大于基础气血');
  assert(cangyunAttrs.maxMp > 300, 'Lv.10 伙伴内力必须大于基础内力');
  assert(cangyunAttrs.combatPower > 0, '伙伴战力必须大于0');
  assertEqual(cangyunAttrs.level, 10, '伙伴等级应为10');
  console.log(`✓ 2. 伙伴【苍云剑客】Lv.10 气血: ${cangyunAttrs.maxHp}, 内力: ${cangyunAttrs.maxMp}, 战力: ${cangyunAttrs.combatPower}`);

  console.log('--- 恭喜！伙伴档案与气血内力全套测试用例顺利通过！ ---');
}

runTests().catch((err) => {
  console.error('测试失败:', err);
  process.exit(1);
});
