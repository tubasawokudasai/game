declare const process: any;

import { inventoryService } from '../src/services/inventoryService';
import { PlayerRecord, MedicineRecord } from '../src/models/types';
import { InventoryItemDetail } from '../src/db/inventoryDb';

function assert(condition: boolean, msg?: string) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual<T>(actual: T, expected: T, msg?: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: expected ${expected}, got ${actual}. ${msg || ''}`);
  }
}

async function runTests() {
  console.log('--- 开始执行药品管理系统与动态丹道推演单元测试 ---');

  const mockPlayer: PlayerRecord = {
    id: 'p_2001',
    nickname: '丹阳子',
    level: 60,
    exp: 50000,
    hp: 8000,
    max_hp: 25000,
    mp: 4000,
    max_mp: 12000,
    combat_power: 12000,
    sect: '药王谷',
    realm: '元婴初期',
    silver: 80000,
    ingot: 2000,
    copper: 100000,
    zone_id: 'changle_city',
    area_id: 'pharmacy',
    signature: '神农尝百草，金丹照大千',
    avatar: '',
    title: '妙手丹圣',
    status: 'ONLINE',
    is_guest: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // 1. 验证自定义动态药品效果推演
  console.log('1. 验证自定义动态药品【九转还魂丹】推演...');
  const customMedicine: MedicineRecord = {
    id: 'item_jiuzhuan_huanhun',
    name: '九转还魂丹',
    quality: 'MYTHIC',
    type: 'CONSUMABLE',
    price_copper: 8888,
    effect_desc: '服用瞬回20,000气血与8,000真气，气血上限永久+2,000，修为+30,000',
    description: '太上老君八卦炉中历经九九八十一日方炼就的绝世神丹。',
    icon: 'flare',
    hp_restore: 20000,
    mp_restore: 8000,
    exp_restore: 30000,
    max_hp_bonus: 2000,
    max_mp_bonus: 1000,
    status: 1,
  };

  const inventoryItem: InventoryItemDetail = {
    id: 'inv_test_med_01',
    playerId: 'p_2001',
    itemId: customMedicine.id,
    itemName: customMedicine.name,
    itemType: 'CONSUMABLE',
    count: 2,
    isEquipped: false,
    quality: customMedicine.quality,
    enhanceLevel: 0,
    createdAt: '',
    updatedAt: '',
  };

  // 推演服用 1 颗
  const effectsSingle = inventoryService.calculateItemEffects(
    inventoryItem,
    mockPlayer,
    1,
    customMedicine
  );
  assertEqual(effectsSingle.hpGain, 20000, '服用单颗应恢复 20,000 点气血');
  assertEqual(effectsSingle.mpGain, 8000, '服用单颗应恢复 8,000 点真气');
  assertEqual(effectsSingle.expGain, 30000, '服用单颗应获得 30,000 点修为');
  assertEqual(effectsSingle.maxHpGain, 2000, '服用单颗气血上限应永久 +2,000');
  assertEqual(effectsSingle.maxMpGain, 1000, '服用单颗内力上限应永久 +1,000');
  assert(effectsSingle.summaryText.includes('气血 +20000'), '反馈文本应包含气血恢复');
  assert(effectsSingle.summaryText.includes('气血上限 +2000'), '反馈文本应包含上限加成');
  console.log('✓ 1. 自定义动态药品【九转还魂丹】单剂推演通过');

  // 2. 验证多剂量批量服用推演
  console.log('2. 验证多剂批量服用倍率推演...');
  const effectsDouble = inventoryService.calculateItemEffects(
    inventoryItem,
    mockPlayer,
    2,
    customMedicine
  );
  assertEqual(effectsDouble.hpGain, 40000, '批量2份应恢复 40,000 点气血');
  assertEqual(effectsDouble.mpGain, 16000, '批量2份应恢复 16,000 点真气');
  assertEqual(effectsDouble.expGain, 60000, '批量2份应获得 60,000 点修为');
  assertEqual(effectsDouble.maxHpGain, 4000, '批量2份气血上限应增加 4,000');
  assertEqual(effectsDouble.maxMpGain, 2000, '批量2份内力上限应增加 2,000');
  console.log('✓ 2. 多剂批量服用倍率推演通过');

  // 3. 验证无配置保底降级推演
  console.log('3. 验证无动态配置保底推演...');
  const fallbackItem: InventoryItemDetail = {
    id: 'inv_fallback_01',
    playerId: 'p_2001',
    itemId: 'item_unknown_herb',
    itemName: '无名灵草',
    itemType: 'CONSUMABLE',
    count: 1,
    isEquipped: false,
    quality: 'RARE',
    enhanceLevel: 0,
    createdAt: '',
    updatedAt: '',
  };
  const fallbackEffects = inventoryService.calculateItemEffects(fallbackItem, mockPlayer, 1);
  assertEqual(fallbackEffects.hpGain, 3000, '灵品消耗品默认恢复 3000 气血');
  assertEqual(fallbackEffects.mpGain, 1500, '灵品消耗品默认恢复 1500 真气');
  console.log('✓ 3. 无动态配置保底推演通过');

  console.log('--- 恭喜！药品管理系统与动态丹道推演全部测试顺利通过！ ---');
}

runTests().catch((err) => {
  console.error('测试未通过:', err);
  process.exit(1);
});
