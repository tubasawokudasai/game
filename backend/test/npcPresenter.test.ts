declare const process: any;

import { presentNpc } from '../src/services/map/npcPresenter';
import { NpcInstanceRow } from '../src/db/npcDb';
import { EncounterPreviewResult } from '../src/services/map/encounterPreview';

function assert(condition: boolean, msg?: string) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual<T>(actual: T, expected: T, msg?: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}. ${msg || ''}`);
  }
}

async function runTests() {
  console.log('=== 开始执行 npcPresenter 纯函数单测 ===\n');

  const baseRow: NpcInstanceRow = {
    id: 'npc_001',
    scene_id: 'square',
    key: 'npc_key_1',
    name: '试炼剑客',
    badge: '精英',
    title: '青云门弟子',
    avatar: 'sword_avatar.png',
    type: 'battle',
    template_id: 'tpl_sword',
    battle_group_id: 'grp_001',
    battle_level: 10,
    respawn_seconds: 60,
    once_flag: 'FLAG_DEFEATED_SWORD',
    npc_role: 'MAP',
    pos_x: 100,
    pos_y: 200,
    template_name: '模板剑客',
  };

  const samplePreview: EncounterPreviewResult = {
    name: '青云剑阵',
    enemies: [
      {
        id: 'enemy_1',
        name: '剑卫',
        avatar: 'guard.png',
        position: 'FRONT',
        slotIndex: 0,
        isBoss: false,
        hp: 1000,
        maxHp: 1000,
      },
    ],
  };

  // 1. 无敌方阵容不可战斗 (canFight = false)
  console.log('1. 验证无敌方阵容不可战斗...');
  {
    const emptyPreviewMap = new Map<string, EncounterPreviewResult>();
    emptyPreviewMap.set('npc_001', { name: '', enemies: [] });

    const res = presentNpc(baseRow, {
      encounterPreviewByNpcId: emptyPreviewMap,
    });

    assertEqual(res.canFight, false, '无敌方阵容时 canFight 应为 false');
    assertEqual(res.cooldownRemaining, 0, '无敌方阵容且未触发一次性击杀时 cooldownRemaining 为 0');
    console.log('✓ 1. 无敌方阵容不可战斗测试通过');
  }

  // 2. 一次性强敌已击溃（cooldownRemaining = -1, canFight = false）
  console.log('2. 验证一次性强敌已击溃 (cooldownRemaining = -1)...');
  {
    const previewMap = new Map<string, EncounterPreviewResult>();
    previewMap.set('npc_001', samplePreview);

    const flags = new Set<string>(['FLAG_DEFEATED_SWORD']);

    const res = presentNpc(baseRow, {
      encounterPreviewByNpcId: previewMap,
      playerFlags: flags,
    });

    assertEqual(res.canFight, false, '一次性强敌被击溃后 canFight 应为 false');
    assertEqual(res.cooldownRemaining, -1, '一次性强敌被击溃后 cooldownRemaining 应为 -1');
    console.log('✓ 2. 一次性强敌已击溃测试通过');
  }

  // 3. 冷却中（剩余秒数正确, canFight = false）
  console.log('3. 验证怪物处于重生冷却中...');
  {
    const previewMap = new Map<string, EncounterPreviewResult>();
    previewMap.set('npc_001', samplePreview);

    const now = 1000000;
    // 击败时间为 20 秒前 (1000000 - 20 * 1000 = 980000)
    // respawn_seconds 是 60，因此剩余冷却应为 40 秒
    const encounterMap = new Map<string, { defeat_count: number; last_defeat_at: number }>();
    encounterMap.set('npc_001', {
      defeat_count: 1,
      last_defeat_at: now - 20 * 1000,
    });

    const res = presentNpc(baseRow, {
      now,
      encounterPreviewByNpcId: previewMap,
      encounterMap,
    });

    assertEqual(res.canFight, false, '冷却中 canFight 应为 false');
    assertEqual(res.cooldownRemaining, 40, '剩余秒数应为 40');
    console.log('✓ 3. 冷却中测试通过');
  }

  // 4. 冷却结束可战斗 (canFight = true, cooldownRemaining = 0)
  console.log('4. 验证冷却结束可战斗...');
  {
    const previewMap = new Map<string, EncounterPreviewResult>();
    previewMap.set('npc_001', samplePreview);

    const now = 1000000;
    // 击败时间为 70 秒前 (已超过 60 秒 respawn_seconds)
    const encounterMap = new Map<string, { defeat_count: number; last_defeat_at: number }>();
    encounterMap.set('npc_001', {
      defeat_count: 1,
      last_defeat_at: now - 70 * 1000,
    });

    const res = presentNpc(baseRow, {
      now,
      encounterPreviewByNpcId: previewMap,
      encounterMap,
    });

    assertEqual(res.canFight, true, '冷却结束后 canFight 应为 true');
    assertEqual(res.cooldownRemaining, 0, '冷却结束后 cooldownRemaining 应为 0');
    assertEqual(res.battleMode, 'GROUP', '有 battle_group_id 时 battleMode 为 GROUP');
    assertEqual(res.battleGroupName, '青云剑阵', 'GROUP 模式应附带 battleGroupName');
    console.log('✓ 4. 冷却结束可战斗测试通过');
  }

  // 5. 非战斗 NPC 不带战斗字段
  console.log('5. 验证非战斗 NPC 不带战斗字段...');
  {
    const dialogueNpc: NpcInstanceRow = {
      id: 'npc_dialogue_01',
      scene_id: 'square',
      key: 'elder_zhang',
      name: '张长老',
      badge: '宿老',
      title: '青云门长老',
      avatar: 'elder.png',
      type: 'dialogue',
      npc_role: 'MAP',
    };

    const res = presentNpc(dialogueNpc, {});

    assertEqual(res.type, 'dialogue', '类型应为 dialogue');
    assertEqual(res.battleMode, undefined, '非战斗 NPC 不应有 battleMode');
    assertEqual(res.battleGroupId, undefined, '非战斗 NPC 不应有 battleGroupId');
    assertEqual(res.battleGroupName, undefined, '非战斗 NPC 不应有 battleGroupName');
    assertEqual(res.battleLevel, undefined, '非战斗 NPC 不应有 battleLevel');
    assertEqual(res.battleReward, undefined, '非战斗 NPC 不应有 battleReward');
    assertEqual(res.respawnSeconds, undefined, '非战斗 NPC 不应有 respawnSeconds');
    assertEqual(res.onceFlag, undefined, '非战斗 NPC 不应有 onceFlag');
    assertEqual(res.canFight, undefined, '非战斗 NPC 不应有 canFight');
    assertEqual(res.cooldownRemaining, undefined, '非战斗 NPC 不应有 cooldownRemaining');
    assertEqual(res.enemyPreview, undefined, '非战斗 NPC 不应有 enemyPreview');
    console.log('✓ 5. 非战斗 NPC 不带战斗字段测试通过');
  }

  console.log('\n=== 恭喜！npcPresenter 全部 5 项核心单元测试顺利通过！ ===');
}

runTests().catch((err) => {
  console.error('测试失败:', err);
  process.exit(1);
});
