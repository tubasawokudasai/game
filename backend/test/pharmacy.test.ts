declare const process: any;

import {
  PharmacyService,
  PHARMACY_GOODS,
  ALCHEMY_RECIPES,
  HEAL_COST_COPPER,
} from '../src/services/pharmacyService';
import { inventoryService } from '../src/services/inventoryService';
import { PlayerRecord } from '../src/models/types';
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
  console.log('--- 开始执行悬壶馆业务逻辑与丹药推演单元测试 ---');

  // 1. 货架与丹方目录完备性测试
  console.log('1. 验证悬壶馆货架名品与神农丹方...');
  const tianjieGood = PHARMACY_GOODS.find((g) => g.itemId === 'item_tianjie_jinchuang');
  assert(!!tianjieGood, '必须存在【天阶金创药】名品');
  assertEqual(tianjieGood?.quality, 'EPIC', '天阶金创药应为极品品质');

  const xisuiGood = PHARMACY_GOODS.find((g) => g.itemId === 'item_xisui_dan');
  assert(!!xisuiGood, '必须存在【洗髓丹】名品');
  assertEqual(xisuiGood?.quality, 'LEGENDARY', '洗髓丹应为绝品品质');

  const xisuiRecipe = ALCHEMY_RECIPES.find((r) => r.outputItemId === 'item_xisui_dan');
  assert(!!xisuiRecipe, '必须存在【洗髓丹】炼制配方');
  assertEqual(HEAL_COST_COPPER, 100, '回春诊费应为 100 铜钱');
  console.log('✓ 1. 货架名品与神农丹方目录校验通过');

  // 2. 服用天阶金创药推演
  console.log('2. 验证服用【天阶金创药】生命恢复推演...');
  const mockPlayer: PlayerRecord = {
    id: 'p_1001',
    nickname: '暮云清歌',
    level: 50,
    exp: 20000,
    hp: 5000,
    max_hp: 20000,
    mp: 3000,
    max_mp: 10000,
    combat_power: 8000,
    sect: '沧浪剑阁',
    realm: '金丹圆满',
    silver: 50000,
    ingot: 1000,
    copper: 50000,
    zone_id: 'changle_city',
    area_id: 'pharmacy',
    signature: '一剑霜寒十四州',
    avatar: '',
    title: '霜刃绝尘',
    status: 'ONLINE',
    is_guest: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const tianjieItem: InventoryItemDetail = {
    id: 'inv_tj_01',
    playerId: 'p_1001',
    itemId: 'item_tianjie_jinchuang',
    itemName: '天阶金创药',
    itemType: 'CONSUMABLE',
    count: 2,
    isEquipped: false,
    quality: 'EPIC',
    enhanceLevel: 0,
    createdAt: '',
    updatedAt: '',
  };

  const tjEffects = inventoryService.calculateItemEffects(tianjieItem, mockPlayer, 1);
  assertEqual(tjEffects.hpGain, 12000, '单份天阶金创药应恢复 12,000 点气血');
  assert(tjEffects.summaryText.includes('气血恢复 +12000'), '反馈文本应包含气血恢复数值');
  console.log('✓ 2. 天阶金创药单剂恢复 12,000 气血推演通过');

  // 3. 服用洗髓丹推演 (脱胎换骨，气血上限/内力上限永久提升)
  console.log('3. 验证服用【洗髓丹】脱胎换骨上限增幅推演...');
  const xisuiItem: InventoryItemDetail = {
    id: 'inv_xs_01',
    playerId: 'p_1001',
    itemId: 'item_xisui_dan',
    itemName: '洗髓丹',
    itemType: 'CONSUMABLE',
    count: 1,
    isEquipped: false,
    quality: 'LEGENDARY',
    enhanceLevel: 0,
    createdAt: '',
    updatedAt: '',
  };

  const xsEffects = inventoryService.calculateItemEffects(xisuiItem, mockPlayer, 1);
  assertEqual(xsEffects.maxHpGain, 1000, '服用洗髓丹永久增加 1,000 气血上限');
  assertEqual(xsEffects.maxMpGain, 500, '服用洗髓丹永久增加 500 内力上限');
  assertEqual(xsEffects.combatPowerGain, 200, '服用洗髓丹永久增加 200 战斗力');
  assertEqual(xsEffects.expGain, 15000, '服用洗髓丹增加 15,000 气海修为');
  assert(xsEffects.summaryText.includes('洗经伐髓'), '反馈文本应突出洗经伐髓');
  console.log('✓ 3. 洗髓丹属性上限与脱胎换骨推演通过');

  // 4. 回春疗伤模拟测试
  console.log('4. 验证药王回春疗伤状态逻辑...');
  const service = new PharmacyService();

  // 模拟全满状态无需疗伤
  const mockFullDb: any = {
    prepare: (sql: string) => ({
      bind: (...args: any[]) => ({
        first: async () => ({
          ...mockPlayer,
          hp: mockPlayer.max_hp,
          mp: mockPlayer.max_mp,
        }),
      }),
    }),
  };

  const alreadyFullRes = await service.healParty(mockFullDb, 'p_1001');
  assertEqual(alreadyFullRes.success, false, '全满状态不应重复治疗');
  assertEqual(alreadyFullRes.alreadyFull, true, '应标记为 alreadyFull');

  // 模拟受伤状态成功疗伤
  let updatedHp = 0;
  let updatedMp = 0;
  let updatedCopper = 0;

  const mockInjuredDb: any = {
    prepare: (sql: string) => ({
      bind: (...args: any[]) => {
        if (sql.includes('UPDATE players')) {
          return {
            run: async () => {
              updatedCopper = args[0];
              updatedHp = mockPlayer.max_hp;
              updatedMp = mockPlayer.max_mp;
            },
          };
        }
        return {
          first: async () => mockPlayer,
          all: async () => ({ results: [] }),
        };
      },
    }),
  };

  const healRes = await service.healParty(mockInjuredDb, 'p_1001');
  assertEqual(healRes.success, true, '受伤状态疗伤应成功');
  assertEqual(healRes.cost, 100, '治疗费用为 100 铜钱');
  assertEqual(healRes.hpRecovered, 15000, '应完全恢复亏损的 15,000 气血');
  assertEqual(healRes.mpRecovered, 7000, '应完全恢复亏损的 7,000 内力');
  assertEqual(updatedCopper, mockPlayer.copper - 100, '应扣减 100 铜钱');
  console.log('✓ 4. 回春疗伤与气血真气全满状态恢复测试通过');

  // 5. 购药逻辑测试 (不足额拦截与成功扣减)
  console.log('5. 验证悬壶药阁购药与铜钱扣减...');
  const poorPlayer: PlayerRecord = { ...mockPlayer, copper: 50 };
  const mockPoorDb: any = {
    prepare: () => ({
      bind: () => ({
        first: async () => poorPlayer,
      }),
    }),
  };

  let buyErrorCaught = false;
  try {
    await service.buyMedicine(mockPoorDb, 'p_1001', 'item_tianjie_jinchuang', 1);
  } catch (err: any) {
    buyErrorCaught = true;
    assert(err.message.includes('铜钱不足'), '铜钱不足时应明确提示拦截');
  }
  assert(buyErrorCaught, '铜钱不足购买应被拦截');

  // 模拟充足铜钱购买天阶金创药
  let batchStatements: any[] = [];
  const mockRichDb: any = {
    prepare: (sql: string) => ({
      bind: (...args: any[]) => ({
        first: async () => (sql.includes('SELECT') && sql.includes('players') ? mockPlayer : null),
        run: async () => {},
      }),
    }),
    batch: async (stmts: any[]) => {
      batchStatements = stmts;
    },
  };

  const buySuccess = await service.buyMedicine(mockRichDb, 'p_1001', 'item_tianjie_jinchuang', 2);
  assertEqual(buySuccess.success, true, '充足铜钱应购买成功');
  assertEqual(buySuccess.cost, 1200, '2份天阶金创药总计 1200 铜钱');
  assertEqual(batchStatements.length, 2, '事务应包含扣钱与道具入库两条语句');
  console.log('✓ 5. 悬壶药阁购药鉴权、扣钱与入库测试通过');

  console.log('--- 恭喜！悬壶馆全套业务逻辑与推演 5 项核心测试顺利通过！ ---');
}

runTests().catch((err) => {
  console.error('测试未通过:', err);
  process.exit(1);
});
