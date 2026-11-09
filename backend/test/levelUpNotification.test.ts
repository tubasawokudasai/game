declare const process: any;
declare const require: any;
declare const __dirname: string;

import { bindRuntimeEnv } from '../src/utils/runtimeEnv';
import {
  DEFAULT_LEVEL_UP_NOTIFICATION_CONFIG,
  getLevelUpNotificationConfig,
  getPendingLevelUpEventIds,
  processLevelUpEvents,
  renderLevelUpNotification,
  resetLevelUpNotificationConfig,
  saveLevelUpNotificationConfig,
} from '../src/services/levelUpNotificationService';
import { experienceService } from '../src/services/experience/experienceService';
import { claimMailAttachmentsTx } from '../src/services/grantService';
import {
  createStoryNotification,
  saveStoryNotificationConfig,
  sendStoryNodeNotification,
  sendStoryNotificationById,
} from '../src/services/storyNotificationService';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function assert(condition: boolean, msg?: string) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual<T>(actual: T, expected: T, msg?: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}. ${msg || ''}`);
  }
}

async function assertRejects(fn: () => Promise<unknown>, contains: string, msg?: string) {
  try {
    await fn();
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    assert(
      message.includes(contains),
      `${msg || 'Expected rejection message'} 应包含「${contains}」，实际为「${message}」`
    );
    return;
  }
  throw new Error(`${msg || 'Expected promise to reject'}：未抛出异常`);
}

/* -------------------------------------------------------------------------- */
/* 轻量 D1 适配器（node:sqlite）                                                */
/* -------------------------------------------------------------------------- */

class SqliteStatement {
  sql: string;
  args: any[] = [];
  private database: any;

  constructor(database: any, sql: string) {
    this.database = database;
    this.sql = sql;
  }

  bind(...args: any[]) {
    this.args = args.map((value) => (value === undefined ? null : value));
    return this;
  }

  async first<T>(): Promise<T | null> {
    const row = this.database.prepare(this.sql).get(...this.args);
    return (row as T) || null;
  }

  async all<T>(): Promise<{ results: T[]; success: boolean }> {
    const results = this.database.prepare(this.sql).all(...this.args) as T[];
    return { results, success: true };
  }

  async run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }> {
    const info = this.database.prepare(this.sql).run(...this.args);
    return {
      success: true,
      meta: {
        changes: Number(info.changes || 0),
        last_row_id: Number(info.lastInsertRowid || 0),
      },
    };
  }
}

class SqliteD1 {
  database: any;

  constructor() {
    this.database = new DatabaseSync(':memory:');
    this.database.exec('PRAGMA foreign_keys = OFF');
  }

  prepare(sql: string) {
    return new SqliteStatement(this.database, sql);
  }

  async batch(statements: SqliteStatement[]) {
    const results: Array<{ success: boolean; meta: { changes: number; last_row_id: number } }> = [];
    for (const statement of statements) {
      results.push(await statement.run());
    }
    return results;
  }

  exec(sql: string) {
    this.database.exec(sql);
  }
}

/* -------------------------------------------------------------------------- */
/* 测试数据库与基础数据                                                        */
/* -------------------------------------------------------------------------- */

const CORE_SCHEMA = `
CREATE TABLE players (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  exp INTEGER NOT NULL DEFAULT 0,
  hp INTEGER NOT NULL DEFAULT 100,
  max_hp INTEGER NOT NULL DEFAULT 100,
  mp INTEGER NOT NULL DEFAULT 100,
  max_mp INTEGER NOT NULL DEFAULT 100,
  combat_power INTEGER NOT NULL DEFAULT 1000,
  realm TEXT NOT NULL DEFAULT '练气期',
  silver INTEGER NOT NULL DEFAULT 0,
  ingot INTEGER NOT NULL DEFAULT 0,
  copper INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ONLINE',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE inventory (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  item_type TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  is_equipped INTEGER NOT NULL DEFAULT 0,
  slot TEXT,
  quality TEXT NOT NULL DEFAULT 'COMMON',
  stats TEXT,
  enhance_level INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE item_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'MATERIAL',
  quality TEXT NOT NULL DEFAULT 'COMMON',
  description TEXT DEFAULT ''
);

CREATE TABLE npc_templates (
  id TEXT PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  badge TEXT NOT NULL DEFAULT '',
  avatar TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'DPS',
  sort_order INTEGER NOT NULL DEFAULT 0,
  skills_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE npc_instances (
  npc_id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  instance_type TEXT NOT NULL DEFAULT 'WORLD',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  scene_id TEXT,
  key TEXT,
  name TEXT NOT NULL,
  badge TEXT DEFAULT '',
  title TEXT NOT NULL,
  avatar TEXT,
  type TEXT NOT NULL DEFAULT 'dialogue',
  quote TEXT DEFAULT '',
  gossip TEXT DEFAULT '',
  owner_player_id TEXT,
  created_by TEXT NOT NULL DEFAULT 'SYSTEM',
  source TEXT NOT NULL DEFAULT 'WORLD',
  source_ref TEXT,
  battle_group_id TEXT,
  battle_level INTEGER NOT NULL DEFAULT 1,
  battle_reward_json TEXT NOT NULL DEFAULT '{}',
  respawn_seconds INTEGER NOT NULL DEFAULT 0,
  once_flag TEXT,
  level INTEGER NOT NULL DEFAULT 1,
  realm TEXT,
  skills_json TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE party_members (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  member_key TEXT NOT NULL,
  member_name TEXT NOT NULL,
  title TEXT,
  avatar TEXT,
  role TEXT NOT NULL DEFAULT 'DPS',
  realm TEXT,
  level INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(player_id, member_key)
);

CREATE TABLE mails (
  id TEXT PRIMARY KEY,
  sender_id TEXT,
  sender_name TEXT NOT NULL,
  receiver_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  mail_type TEXT NOT NULL DEFAULT 'SYSTEM',
  has_attachment INTEGER NOT NULL DEFAULT 0,
  is_read INTEGER NOT NULL DEFAULT 0,
  is_claimed INTEGER NOT NULL DEFAULT 0,
  expire_at INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE mail_attachments (
  id TEXT PRIMARY KEY,
  mail_id TEXT NOT NULL,
  item_id TEXT,
  item_snapshot TEXT,
  count INTEGER NOT NULL DEFAULT 1,
  silver INTEGER NOT NULL DEFAULT 0,
  ingot INTEGER NOT NULL DEFAULT 0,
  grant_type TEXT NOT NULL DEFAULT 'ITEM',
  grant_payload TEXT,
  claimed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dialogue_packages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE dialogue_nodes (
  id TEXT PRIMARY KEY,
  package_id TEXT,
  chapter_title TEXT
);

CREATE TABLE story_notifications (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL,
  node_id TEXT DEFAULT NULL,
  trigger_event TEXT NOT NULL DEFAULT 'ANY',
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  reward_items_json TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

function readMigrationSql(): string {
  const candidates = [
    path.resolve(process.cwd(), 'migrations/20261107_player_level_notification.sql'),
    path.resolve(process.cwd(), 'backend/migrations/20261107_player_level_notification.sql'),
    path.resolve(__dirname, '../../migrations/20261107_player_level_notification.sql'),
  ];
  const found = candidates.find((candidate: string) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`找不到通知迁移 SQL，已尝试：${candidates.join(', ')}`);
  }
  return fs.readFileSync(found, 'utf8');
}

const MIGRATION_SQL = readMigrationSql();

interface Harness {
  db: any;
  env: any;
  toastCalls: any[];
  playerId: string;
  playerName: string;
}

let playerSequence = 0;

async function createHarness(options: {
  level?: number;
  exp?: number;
  playerName?: string;
  items?: Array<{ id: string; name: string; type?: string; quality?: string }>;
  companions?: Array<{
    id: string;
    key?: string;
    name: string;
    title?: string;
    role?: string;
  }>;
} = {}): Promise<Harness> {
  const db = new SqliteD1();
  db.exec(CORE_SCHEMA);
  db.exec(MIGRATION_SQL);

  const playerId = `p_test_levelup_${++playerSequence}`;
  const playerName = options.playerName || '暮云清歌';
  const level = options.level ?? 1;
  const exp = options.exp ?? 0;

  await db
    .prepare(
      `INSERT INTO players
         (id, nickname, level, exp, hp, max_hp, mp, max_mp, combat_power, realm, silver, ingot, copper)
       VALUES (?, ?, ?, ?, 80, 100, 60, 100, 1000, '练气期', 0, 0, 0)`
    )
    .bind(playerId, playerName, level, exp)
    .run();

  for (const item of options.items || []) {
    await db
      .prepare(
        `INSERT INTO item_templates (id, name, type, quality, description)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(
        item.id,
        item.name,
        item.type || 'MATERIAL',
        item.quality || 'COMMON',
        `${item.name}测试道具`
      )
      .run();
  }

  for (const companion of options.companions || []) {
    await db
      .prepare(
        `INSERT INTO npc_templates (id, key, name, title, badge, avatar, role, sort_order)
         VALUES (?, ?, ?, ?, '', '', ?, 0)`
      )
      .bind(
        companion.id,
        companion.key || companion.id.replace(/^tpl_/, ''),
        companion.name,
        companion.title || '',
        companion.role || 'DPS'
      )
      .run();
  }

  const toastCalls: any[] = [];
  const env: any = {
    ZONE_DO: {
      idFromName: (name: string) => name,
      get: () => ({
        fetch: async (_url: string, init: any) => {
          toastCalls.push(JSON.parse(init.body));
          return new Response(JSON.stringify({ success: true, delivered: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        },
      }),
    },
  };

  bindRuntimeEnv(env);

  return { db, env, toastCalls, playerId, playerName };
}

async function addItem(
  db: any,
  id: string,
  name: string,
  type = 'MATERIAL',
  quality = 'COMMON'
) {
  await db
    .prepare(
      `INSERT INTO item_templates (id, name, type, quality, description)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(id, name, type, quality, `${name}测试道具`)
    .run();
}

async function getEvents(db: any, playerId: string): Promise<any[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM level_up_events WHERE player_id = ? ORDER BY new_level ASC`
    )
    .bind(playerId)
    .all();
  return results || [];
}

async function getMails(db: any, playerId: string): Promise<any[]> {
  const { results } = await db
    .prepare(`SELECT * FROM mails WHERE receiver_id = ? ORDER BY created_at ASC`)
    .bind(playerId)
    .all();
  return results || [];
}

async function getAttachments(db: any, mailId: string): Promise<any[]> {
  const { results } = await db
    .prepare(`SELECT * FROM mail_attachments WHERE mail_id = ? ORDER BY id ASC`)
    .bind(mailId)
    .all();
  return results || [];
}

async function getInventory(db: any, playerId: string): Promise<any[]> {
  const { results } = await db
    .prepare(`SELECT * FROM inventory WHERE player_id = ? ORDER BY item_id ASC`)
    .bind(playerId)
    .all();
  return results || [];
}

async function getPartyMembers(db: any, playerId: string): Promise<any[]> {
  const { results } = await db
    .prepare(`SELECT * FROM party_members WHERE player_id = ? ORDER BY member_key ASC`)
    .bind(playerId)
    .all();
  return results || [];
}

async function getCompanionInstances(db: any, playerId: string): Promise<any[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM npc_instances WHERE owner_player_id = ? ORDER BY npc_id ASC`
    )
    .bind(playerId)
    .all();
  return results || [];
}

/* -------------------------------------------------------------------------- */
/* 测试用例                                                                    */
/* -------------------------------------------------------------------------- */

async function runTests() {
  console.log('=== 开始执行「通知管理 · 玩家升级通知」测试 ===\n');

  // 1. 启用 + 空附件：只发即时通知
  {
    console.log('1. 通知启用、附件为空：升级后只发送即时通知...');
    const h = await createHarness();
    await saveLevelUpNotificationConfig(h.db, {
      enabled: true,
      title: '突破成功',
      content: '道友 {playerName} 从 Lv.{oldLevel} 突破至 Lv.{newLevel}',
      grants: [],
    });

    const result = await experienceService.addExperience(h.db, h.playerId, 200);
    assertEqual(result.levelUpCount, 1, '应升 1 级');
    assertEqual(result.postLevel, 2, '应升至 2 级');
    assertEqual(h.toastCalls.length, 1, '应恰好发送 1 条即时通知');

    const message = h.toastCalls[0].message;
    assertEqual(message.type, 'NOTICE', '即时通知类型应为 NOTICE');
    assertEqual(message.action, 'TOAST', '即时通知动作应为 TOAST');
    assertEqual(message.payload.title, '突破成功', '通知标题应使用后台配置');
    assertEqual(
      message.payload.content,
      '道友 暮云清歌 从 Lv.1 突破至 Lv.2',
      '动态变量应被正确替换'
    );

    const mails = await getMails(h.db, h.playerId);
    assertEqual(mails.length, 0, '附件为空时不应创建奖励邮件');

    const events = await getEvents(h.db, h.playerId);
    assertEqual(events.length, 1, '应写入 1 条升级事件');
    assertEqual(events[0].status, 'PROCESSED', '事件应处理完成');
    assertEqual(events[0].notification_sent, 1, '即时通知应标记为已投递');
    assertEqual(events[0].mail_id, null, '无附件时不应有邮件 ID');
    console.log('✓ 1. 仅即时通知场景通过\n');
  }

  // 2. 启用 + 一个附件道具：通知 + 奖励邮件 + 领取入背包
  {
    console.log('2. 通知启用、配置一个附件道具：通知 + 奖励邮件 + 领取...');
    const h = await createHarness({
      items: [{ id: 'item_yuanbao', name: '元宝', type: 'MATERIAL' }],
    });
    await saveLevelUpNotificationConfig(h.db, {
      enabled: true,
      title: '恭喜升级！',
      content: '恭喜少侠 {playerName}，成功提升至 Lv.{newLevel}！',
      grants: [{ itemId: 'item_yuanbao', quantity: 100 }],
    });

    await experienceService.addExperience(h.db, h.playerId, 200);
    assertEqual(h.toastCalls.length, 1, '应发送即时通知');

    const mails = await getMails(h.db, h.playerId);
    assertEqual(mails.length, 1, '应创建 1 封奖励邮件');
    assertEqual(mails[0].receiver_id, h.playerId, '收件人应为当前升级玩家');
    assertEqual(mails[0].mail_type, 'SYSTEM', '奖励邮件应为系统邮件');

    const attachments = await getAttachments(h.db, mails[0].id);
    assertEqual(attachments.length, 1, '应创建 1 条附件');
    assertEqual(attachments[0].item_id, 'item_yuanbao', '附件道具 ID 应正确');
    assertEqual(Number(attachments[0].count), 100, '附件数量应正确');
    assertEqual(attachments[0].grant_type, 'ITEM', '附件类型应为道具');

    const inventoryBefore = await getInventory(h.db, h.playerId);
    assertEqual(inventoryBefore.length, 0, '领取前不应直接修改玩家背包');

    const claimResult = await claimMailAttachmentsTx(h.db, h.playerId, mails[0].id);
    assertEqual(claimResult.grants.length, 1, '领取应返回 1 项奖励');

    const inventoryAfter = await getInventory(h.db, h.playerId);
    assertEqual(inventoryAfter.length, 1, '领取后道具应进入背包');
    assertEqual(inventoryAfter[0].item_id, 'item_yuanbao', '领取入包道具应正确');
    assertEqual(Number(inventoryAfter[0].count), 100, '领取入包数量应正确');

    const mailAfter = await getMails(h.db, h.playerId);
    assertEqual(Number(mailAfter[0].is_claimed), 1, '领取后邮件应标记已领取');
    console.log('✓ 2. 单附件奖励邮件与领取链路通过\n');
  }

  // 3. 多个附件道具：数量与种类正确
  {
    console.log('3. 通知启用、配置多个附件道具：邮件附件及数量正确...');
    const h = await createHarness({
      items: [
        { id: 'item_yuanbao', name: '元宝', type: 'MATERIAL' },
        { id: 'item_xiuwei_dan', name: '初级修为丹', type: 'CONSUMABLE' },
        { id: 'item_lingshi', name: '灵石', type: 'MATERIAL' },
      ],
    });
    await saveLevelUpNotificationConfig(h.db, {
      enabled: true,
      title: '升级贺礼',
      content: '{playerName} 升至 Lv.{newLevel}',
      grants: [
        { itemId: 'item_yuanbao', quantity: 100 },
        { itemId: 'item_xiuwei_dan', quantity: 2 },
        { itemId: 'item_lingshi', quantity: 500 },
      ],
    });

    await experienceService.addExperience(h.db, h.playerId, 200);
    const mails = await getMails(h.db, h.playerId);
    assertEqual(mails.length, 1, '应创建 1 封奖励邮件');

    const attachments = await getAttachments(h.db, mails[0].id);
    assertEqual(attachments.length, 3, '应创建 3 条附件');

    const quantityMap = new Map(
      attachments.map((attachment: any) => [attachment.item_id, Number(attachment.count)])
    );
    assertEqual(quantityMap.get('item_yuanbao'), 100, '元宝数量应为 100');
    assertEqual(quantityMap.get('item_xiuwei_dan'), 2, '初级修为丹数量应为 2');
    assertEqual(quantityMap.get('item_lingshi'), 500, '灵石数量应为 500');
    console.log('✓ 3. 多附件数量与种类校验通过\n');
  }

  // 4. 通知关闭：不发通知、不发奖、不建邮件
  {
    console.log('4. 通知关闭：不发送通知，也不发放道具...');
    const h = await createHarness({
      items: [{ id: 'item_yuanbao', name: '元宝', type: 'MATERIAL' }],
    });
    await saveLevelUpNotificationConfig(h.db, {
      enabled: false,
      title: '不会发送',
      content: '不会发送',
      grants: [{ itemId: 'item_yuanbao', quantity: 100 }],
    });

    const result = await experienceService.addExperience(h.db, h.playerId, 200);
    assertEqual(result.postLevel, 2, '角色升级应正常完成');
    assertEqual(h.toastCalls.length, 0, '关闭时不应发送即时通知');
    assertEqual((await getMails(h.db, h.playerId)).length, 0, '关闭时不应创建奖励邮件');

    const events = await getEvents(h.db, h.playerId);
    assertEqual(events.length, 1, '仍应留下升级事件审计记录');
    assertEqual(events[0].status, 'PROCESSED', '关闭配置的事件应直接处理完成');
    assertEqual(events[0].notification_sent, 0, '通知未发送');
    assertEqual(events[0].mail_id, null, '未创建奖励邮件');
    console.log('✓ 4. 通知关闭场景通过\n');
  }

  // 5. 连续升级多级：每级各一次，不漏不重
  {
    console.log('5. 连续升级多级：每级分别触发一次，不漏发、不重复发...');
    const h = await createHarness({
      items: [{ id: 'item_yuanbao', name: '元宝', type: 'MATERIAL' }],
    });
    await saveLevelUpNotificationConfig(h.db, {
      enabled: true,
      title: '连破境界',
      content: '{playerName} 升至 Lv.{newLevel}（前 Lv.{oldLevel}）',
      grants: [{ itemId: 'item_yuanbao', quantity: 10 }],
    });

    // 1 -> 4 需要 200 + 600 + 1200 = 2000
    const result = await experienceService.addExperience(h.db, h.playerId, 2000);
    assertEqual(result.levelUpCount, 3, '应连续升 3 级');
    assertEqual(result.postLevel, 4, '应升至 4 级');

    const events = await getEvents(h.db, h.playerId);
    assertEqual(events.length, 3, '应写入 3 条升级事件');
    assert(events.map((e: any) => Number(e.new_level)).join(',') === '2,3,4', '事件等级应为 2,3,4');
    assert(events.every((e: any) => e.status === 'PROCESSED'), '所有事件应处理完成');

    assertEqual(h.toastCalls.length, 3, '每一级应各发送一次即时通知');
    const notificationLevels = h.toastCalls.map((call: any) => call.message.payload.content);
    assert(notificationLevels[0].includes('Lv.2'), '第一条通知应对应 Lv.2');
    assert(notificationLevels[1].includes('Lv.3'), '第二条通知应对应 Lv.3');
    assert(notificationLevels[2].includes('Lv.4'), '第三条通知应对应 Lv.4');

    const mails = await getMails(h.db, h.playerId);
    assertEqual(mails.length, 3, '每一级应各创建 1 封奖励邮件');
    const mailIds = new Set(mails.map((mail: any) => mail.id));
    assertEqual(mailIds.size, 3, '奖励邮件 ID 不应重复');

    for (const mail of mails) {
      const attachments = await getAttachments(h.db, mail.id);
      assertEqual(attachments.length, 1, '每封邮件应有 1 条附件');
      assertEqual(Number(attachments[0].count), 10, '每封邮件附件数量应为 10');
    }

    // 重复处理不应产生重复邮件
    const repeat = await processLevelUpEvents(
      h.db,
      events.map((event: any) => event.event_id),
      { env: h.env }
    );
    assertEqual(repeat.processed, 0, '已处理事件不应再次处理');
    assertEqual((await getMails(h.db, h.playerId)).length, 3, '重复处理不应创建重复邮件');
    console.log('✓ 5. 连续升级多级场景通过\n');
  }

  // 6. 非法配置：道具不存在、数量非法、重复道具
  {
    console.log('6. 道具不存在或数量非法：后台保存失败...');
    const h = await createHarness({
      items: [{ id: 'item_yuanbao', name: '元宝', type: 'MATERIAL' }],
    });

    await assertRejects(
      () =>
        saveLevelUpNotificationConfig(h.db, {
          enabled: true,
          title: '标题',
          content: '内容',
          grants: [{ itemId: 'item_not_exist', quantity: 1 }],
        }),
      '道具不存在或不可发放',
      '不存在的道具'
    );

    await assertRejects(
      () =>
        saveLevelUpNotificationConfig(h.db, {
          enabled: true,
          title: '标题',
          content: '内容',
          grants: [{ itemId: 'item_yuanbao', quantity: 0 }],
        }),
      '数量必须为正整数',
      '数量为 0'
    );

    await assertRejects(
      () =>
        saveLevelUpNotificationConfig(h.db, {
          enabled: true,
          title: '标题',
          content: '内容',
          grants: [{ itemId: 'item_yuanbao', quantity: 1.5 }],
        }),
      '数量必须为正整数',
      '数量为小数'
    );

    await assertRejects(
      () =>
        saveLevelUpNotificationConfig(h.db, {
          enabled: true,
          title: '标题',
          content: '内容',
          grants: [
            { itemId: 'item_yuanbao', quantity: 1 },
            { itemId: 'item_yuanbao', quantity: 2 },
          ],
        }),
      '不允许重复添加',
      '重复道具'
    );

    await assertRejects(
      () =>
        saveLevelUpNotificationConfig(h.db, {
          enabled: true,
          title: '',
          content: '内容',
          grants: [],
        }),
      '通知标题不能为空',
      '空标题'
    );

    await assertRejects(
      () =>
        saveLevelUpNotificationConfig(h.db, {
          enabled: true,
          title: '标题',
          content: '',
          grants: [],
        }),
      '通知内容不能为空',
      '空内容'
    );

    const config = await getLevelUpNotificationConfig(h.db);
    assertEqual(config.title, DEFAULT_LEVEL_UP_NOTIFICATION_CONFIG.title, '保存失败后配置不应被修改');
    console.log('✓ 6. 非法配置校验通过\n');
  }

  // 7. 邮件服务异常：升级正常完成，不重复发奖
  {
    console.log('7. 邮件服务异常：角色升级正常完成，不重复发放奖励...');
    const h = await createHarness({
      items: [{ id: 'item_yuanbao', name: '元宝', type: 'MATERIAL' }],
    });
    await saveLevelUpNotificationConfig(h.db, {
      enabled: true,
      title: '升级奖励',
      content: '{playerName} 升至 Lv.{newLevel}',
      grants: [{ itemId: 'item_yuanbao', quantity: 50 }],
    });

    // 模拟道具在保存后被删除，使邮件服务在解析附件时失败
    await h.db.prepare('DELETE FROM item_templates WHERE id = ?').bind('item_yuanbao').run();

    const result = await experienceService.addExperience(h.db, h.playerId, 200);
    assertEqual(result.postLevel, 2, '邮件失败不应回滚角色升级');
    assertEqual(h.toastCalls.length, 1, '邮件失败不影响即时通知发送');
    assertEqual((await getMails(h.db, h.playerId)).length, 0, '邮件失败时不应有半成品邮件');

    const events = await getEvents(h.db, h.playerId);
    assertEqual(events.length, 1, '应保留升级事件');
    assertEqual(events[0].status, 'PENDING', '邮件失败后事件应保留为待重试');

    // 恢复道具后重试：应只创建 1 封邮件
    await addItem(h.db, 'item_yuanbao', '元宝', 'MATERIAL', 'COMMON');
    const pending = await getPendingLevelUpEventIds(h.db, h.playerId);
    assertEqual(pending.length, 1, '应有 1 条待重试事件');

    const retryResult = await processLevelUpEvents(h.db, pending, { env: h.env });
    assertEqual(retryResult.processed, 1, '重试应成功处理 1 条事件');
    assertEqual((await getMails(h.db, h.playerId)).length, 1, '重试后应创建 1 封奖励邮件');
    assertEqual(h.toastCalls.length, 1, '重试时不应重复发送已送达的即时通知');

    // 再重复处理一次，仍不能重复发奖
    const repeat = await processLevelUpEvents(h.db, [events[0].event_id], { env: h.env });
    assertEqual(repeat.processed, 0, '已处理事件不应重复处理');
    assertEqual(repeat.skipped, 1, '重复事件应被跳过');
    assertEqual((await getMails(h.db, h.playerId)).length, 1, '重复处理不应重复创建邮件');
    console.log('✓ 7. 邮件异常与幂等重试场景通过\n');
  }

  // 8. 修改后台文案后：新通知使用最新配置
  {
    console.log('8. 修改后台通知文案后：新通知使用最新配置...');
    const h = await createHarness({
      items: [{ id: 'item_yuanbao', name: '元宝', type: 'MATERIAL' }],
    });

    await saveLevelUpNotificationConfig(h.db, {
      enabled: true,
      title: '旧标题',
      content: '旧内容 {playerName}',
      grants: [],
    });
    await experienceService.addExperience(h.db, h.playerId, 200);
    assertEqual(h.toastCalls[0].message.payload.title, '旧标题', '第一次应使用旧标题');

    await saveLevelUpNotificationConfig(h.db, {
      enabled: true,
      title: '新标题',
      content: '新内容 {playerName} Lv.{newLevel} {unknown}',
      grants: [],
    });
    await experienceService.addExperience(h.db, h.playerId, 600);
    assertEqual(h.toastCalls.length, 2, '第二次升级应发送新通知');
    assertEqual(h.toastCalls[1].message.payload.title, '新标题', '第二次应使用最新标题');
    assertEqual(
      h.toastCalls[1].message.payload.content,
      '新内容 暮云清歌 Lv.3 {unknown}',
      '最新内容应替换已注册变量，未知变量保持原样'
    );

    const rendered = renderLevelUpNotification(
      { title: '{playerName}', content: '{playerName} {oldLevel} {newLevel}' },
      { playerName: '测试道友', oldLevel: 9, newLevel: 10 }
    );
    assertEqual(rendered.title, '测试道友', 'render 应替换标题变量');
    assertEqual(rendered.content, '测试道友 9 10', 'render 应替换内容变量');
    console.log('✓ 8. 修改文案后新通知使用最新配置通过\n');
  }

  // 9. 恢复默认配置
  {
    console.log('9. 恢复默认配置：正确恢复默认状态、文案和空附件...');
    const h = await createHarness({
      items: [{ id: 'item_yuanbao', name: '元宝', type: 'MATERIAL' }],
    });

    await saveLevelUpNotificationConfig(h.db, {
      enabled: false,
      title: '自定义标题',
      content: '自定义内容',
      grants: [{ itemId: 'item_yuanbao', quantity: 9 }],
    });

    const reset = await resetLevelUpNotificationConfig(h.db, 'tester');
    assertEqual(reset.enabled, true, '恢复默认后应启用');
    assertEqual(reset.title, DEFAULT_LEVEL_UP_NOTIFICATION_CONFIG.title, '恢复默认标题');
    assertEqual(reset.content, DEFAULT_LEVEL_UP_NOTIFICATION_CONFIG.content, '恢复默认内容');
    assertEqual(reset.grants.length, 0, '恢复默认后发放内容应为空');
    assertEqual(reset.updatedBy, 'tester', '应记录修改人');

    await experienceService.addExperience(h.db, h.playerId, 200);
    assertEqual(h.toastCalls.length, 1, '恢复默认后应发送默认即时通知');
    assertEqual(h.toastCalls[0].message.payload.title, '恭喜升级！', '应使用默认标题');
    assertEqual((await getMails(h.db, h.playerId)).length, 0, '恢复默认后附件为空，不应创建邮件');
    console.log('✓ 9. 恢复默认配置通过\n');
  }

  // 10. 邮件已创建但事件状态未写回：重试复用确定性邮件，不重复发奖
  {
    console.log('10. 邮件已创建但事件状态未写回：重试复用确定性邮件...');
    const h = await createHarness({
      items: [{ id: 'item_yuanbao', name: '元宝', type: 'MATERIAL' }],
    });
    await saveLevelUpNotificationConfig(h.db, {
      enabled: true,
      title: '幂等测试',
      content: '{playerName} 升至 Lv.{newLevel}',
      grants: [{ itemId: 'item_yuanbao', quantity: 5 }],
    });

    await experienceService.addExperience(h.db, h.playerId, 200);
    const events = await getEvents(h.db, h.playerId);
    assertEqual(events.length, 1, '应写入 1 条事件');
    const eventId = events[0].event_id;
    assertEqual((await getMails(h.db, h.playerId)).length, 1, '首次处理应创建 1 封邮件');

    // 模拟"邮件已创建、但进程在写回事件最终状态前崩溃"
    await h.db
      .prepare(
        `UPDATE level_up_events
         SET status = 'PENDING', mail_id = NULL, notification_sent = 1
         WHERE event_id = ?`
      )
      .bind(eventId)
      .run();

    const pending = await getPendingLevelUpEventIds(h.db, h.playerId);
    assertEqual(pending.length, 1, '事件应回退为待重试');
    const retried = await processLevelUpEvents(h.db, pending, { env: h.env });
    assertEqual(retried.processed, 1, '重试应成功处理事件');

    const mailsAfter = await getMails(h.db, h.playerId);
    assertEqual(mailsAfter.length, 1, '重试不应创建第二封邮件');
    const attachmentsAfter = await getAttachments(h.db, mailsAfter[0].id);
    assertEqual(attachmentsAfter.length, 1, '重试不应追加附件');
    assertEqual(Number(attachmentsAfter[0].count), 5, '附件数量不应被重复叠加');
    assertEqual(h.toastCalls.length, 1, '已标记通知送达时不应重复弹 Toast');
    console.log('✓ 10. 邮件已创建但事件状态未写回的幂等重试通过\n');
  }

  // 11. 角色发放：升级奖励可发放角色，领取后进入同道名册
  {
    console.log('11. 角色发放：升级奖励邮件附带角色，领取后进入同道名册（休息）...');
    const h = await createHarness({
      companions: [
        { id: 'tpl_cangyun', key: 'cangyun', name: '苍云剑客', title: '苍云剑宗', role: 'TANK' },
      ],
    });
    await saveLevelUpNotificationConfig(h.db, {
      enabled: true,
      title: '升级赠礼',
      content: '{playerName} 升至 Lv.{newLevel}',
      grants: [{ type: 'COMPANION', memberKey: 'tpl_cangyun', level: 5, realm: '金丹中期' }],
    });

    await experienceService.addExperience(h.db, h.playerId, 200);
    const mails = await getMails(h.db, h.playerId);
    assertEqual(mails.length, 1, '应创建 1 封奖励邮件');

    const attachments = await getAttachments(h.db, mails[0].id);
    assertEqual(attachments.length, 1, '应创建 1 条角色附件');
    assertEqual(attachments[0].grant_type, 'COMPANION', '附件类型应为角色');
    assertEqual(
      (await getPartyMembers(h.db, h.playerId)).length,
      0,
      '领取前不应进入同道名册'
    );
    assertEqual(
      (await getCompanionInstances(h.db, h.playerId)).length,
      1,
      '发送时应预创建 1 条 PENDING 角色实例'
    );

    const claim = await claimMailAttachmentsTx(h.db, h.playerId, mails[0].id);
    assertEqual(claim.grants.length, 1, '领取应返回 1 项角色');
    assertEqual(claim.grants[0].type, 'COMPANION', '领取结果类型应为角色');

    const members = await getPartyMembers(h.db, h.playerId);
    assertEqual(members.length, 1, '领取后应进入同道名册');
    assertEqual(members[0].member_name, '苍云剑客', '角色名称应来自模版');
    assertEqual(Number(members[0].level), 5, '角色等级应使用配置值');
    assertEqual(members[0].realm, '金丹中期', '角色境界应使用配置值');
    assertEqual(Number(members[0].is_active), 0, '新角色应保持休息，不自动出战');

    const instances = await getCompanionInstances(h.db, h.playerId);
    assertEqual(instances.length, 1, '应保留 1 条角色实例');
    assertEqual(instances[0].status, 'ACTIVE', '领取后角色实例应激活');
    assertEqual(instances[0].instance_type, 'PLAYER', '角色实例类型应为 PLAYER');
    console.log('✓ 11. 角色发放与领取通过\n');
  }

  // 12. 货币发放：领取后直接入钱庄
  {
    console.log('12. 货币发放：升级奖励邮件附带货币，领取后直接入钱庄...');
    const h = await createHarness();
    await saveLevelUpNotificationConfig(h.db, {
      enabled: true,
      title: '升级贺礼',
      content: '{playerName} 升至 Lv.{newLevel}',
      grants: [{ type: 'CURRENCY', silver: 500, ingot: 2, copper: 30 }],
    });

    await experienceService.addExperience(h.db, h.playerId, 200);
    const mails = await getMails(h.db, h.playerId);
    assertEqual(mails.length, 1, '应创建 1 封奖励邮件');

    const attachments = await getAttachments(h.db, mails[0].id);
    assertEqual(attachments.length, 1, '应创建 1 条货币附件');
    assertEqual(attachments[0].grant_type, 'CURRENCY', '附件类型应为货币');
    assertEqual(Number(attachments[0].silver), 500, '纹银数量应正确');
    assertEqual(Number(attachments[0].ingot), 2, '元宝数量应正确');
    assertEqual(Number(JSON.parse(attachments[0].grant_payload).copper), 30, '铜钱数量应正确');

    const claim = await claimMailAttachmentsTx(h.db, h.playerId, mails[0].id);
    assertEqual(claim.claimedSilver, 500, '领取后应获得 500 纹银');
    assertEqual(claim.claimedIngot, 2, '领取后应获得 2 元宝');
    assertEqual(claim.claimedCopper, 30, '领取后应获得 30 铜钱');

    const player = await h.db
      .prepare('SELECT silver, ingot, copper FROM players WHERE id = ?')
      .bind(h.playerId)
      .first();
    assertEqual(Number(player.silver), 500, '玩家纹银应入账');
    assertEqual(Number(player.ingot), 2, '玩家元宝应入账');
    assertEqual(Number(player.copper), 30, '玩家铜钱应入账');
    console.log('✓ 12. 货币发放与领取通过\n');
  }

  // 13. 混合发放 + 配置校验
  {
    console.log('13. 混合发放：道具 / 角色 / 货币同封邮件，并校验非法配置...');
    const h = await createHarness({
      items: [{ id: 'item_yuanbao', name: '元宝', type: 'MATERIAL' }],
      companions: [{ id: 'tpl_jianwuhen', key: 'jianwuhen', name: '剑无痕' }],
    });
    await saveLevelUpNotificationConfig(h.db, {
      enabled: true,
      title: '厚礼',
      content: '{playerName} 升至 Lv.{newLevel}',
      grants: [
        { type: 'ITEM', itemId: 'item_yuanbao', quantity: 3 },
        { type: 'COMPANION', memberKey: 'jianwuhen', level: 2 },
        { type: 'CURRENCY', copper: 10 },
      ],
    });

    await experienceService.addExperience(h.db, h.playerId, 200);
    const mails = await getMails(h.db, h.playerId);
    assertEqual(mails.length, 1, '混合发放应只创建 1 封邮件（多附件）');

    const attachments = await getAttachments(h.db, mails[0].id);
    assertEqual(attachments.length, 3, '应创建 3 条附件');
    const types = new Set(attachments.map((attachment: any) => attachment.grant_type));
    assert(types.has('ITEM') && types.has('COMPANION') && types.has('CURRENCY'), '三类附件都应在邮件中');

    const claim = await claimMailAttachmentsTx(h.db, h.playerId, mails[0].id);
    assertEqual(claim.grants.length, 3, '一次领取应结算 3 项发放内容');
    assertEqual((await getInventory(h.db, h.playerId)).length, 1, '道具应进入背包');
    assertEqual((await getPartyMembers(h.db, h.playerId)).length, 1, '角色应进入同道名册');
    assertEqual(claim.claimedCopper, 10, '货币应入钱庄');

    await assertRejects(
      () =>
        saveLevelUpNotificationConfig(h.db, {
          enabled: true,
          title: '标题',
          content: '内容',
          grants: [{ type: 'COMPANION', memberKey: 'tpl_not_exist', level: 1 }],
        }),
      '角色模版不存在或不可发放',
      '不存在的角色模版'
    );

    await assertRejects(
      () =>
        saveLevelUpNotificationConfig(h.db, {
          enabled: true,
          title: '标题',
          content: '内容',
          grants: [{ type: 'CURRENCY', silver: 0, ingot: 0, copper: 0 }],
        }),
      '至少需要填写一种货币数量',
      '货币全为 0'
    );

    await assertRejects(
      () =>
        saveLevelUpNotificationConfig(h.db, {
          enabled: true,
          title: '标题',
          content: '内容',
          grants: [{ type: 'PET' } as any],
        }),
      '发放类型不支持',
      '未知发放类型'
    );

    // 旧字段名 + 旧条目形态（无 type）仍可保存，按道具处理
    const legacySaved = await saveLevelUpNotificationConfig(h.db, {
      enabled: true,
      title: '旧字段',
      content: '旧字段内容',
      rewardItems: [{ itemId: 'item_yuanbao', quantity: 8 }] as any,
    });
    assertEqual(legacySaved.grants.length, 1, '旧字段应被接受');
    assertEqual(legacySaved.grants[0].type, 'ITEM', '无 type 的旧条目应归一化为道具');
    console.log('✓ 13. 混合发放与配置校验通过\n');
  }

  // 14. 历史配置兼容：旧 reward_items_json 直接读取
  {
    console.log('14. 历史配置兼容：旧 reward_items_json 按道具发放读取...');
    const h = await createHarness({
      items: [{ id: 'item_yuanbao', name: '元宝', type: 'MATERIAL' }],
    });

    await h.db
      .prepare(
        `UPDATE notification_configs
         SET reward_items_json = ?
         WHERE event_code = 'PLAYER_LEVEL_UP'`
      )
      .bind(JSON.stringify([{ itemId: 'item_yuanbao', quantity: 7 }]))
      .run();

    const config = await getLevelUpNotificationConfig(h.db);
    assertEqual(config.grants.length, 1, '旧配置应读取为 1 项发放内容');
    assertEqual(config.grants[0].type, 'ITEM', '旧配置应归一化为道具');
    assertEqual(
      config.grants[0].type === 'ITEM' ? config.grants[0].quantity : 0,
      7,
      '旧配置数量应保留'
    );

    await experienceService.addExperience(h.db, h.playerId, 200);
    const mails = await getMails(h.db, h.playerId);
    assertEqual(mails.length, 1, '旧配置升级后仍应创建奖励邮件');
    const attachments = await getAttachments(h.db, mails[0].id);
    assertEqual(Number(attachments[0].count), 7, '旧配置道具数量应正确发放');
    console.log('✓ 14. 历史配置兼容通过\n');
  }

  // 15. 剧情通知：与玩家升级通知使用同一套内容 + 发放逻辑
  {
    console.log('15. 剧情通知：内容渲染、发放内容与幂等...');
    const h = await createHarness({
      items: [{ id: 'item_juqi_dan', name: '聚气丹', type: 'CONSUMABLE' }],
    });

    await h.db
      .prepare('INSERT INTO dialogue_packages (id, name) VALUES (?, ?)')
      .bind('pkg_test', '测试剧本')
      .run();
    await h.db
      .prepare(
        'INSERT INTO dialogue_nodes (id, package_id, chapter_title) VALUES (?, ?, ?)'
      )
      .bind('node_test', 'pkg_test', '测试 · 分支')
      .run();

    const variables = {
      playerName: h.playerName,
      chapterTitle: '测试 · 分支',
      packageName: '测试剧本',
      nodeId: 'node_test',
    };

    const notification = await createStoryNotification(
      h.db,
      {
        package_id: 'pkg_test',
        node_id: 'node_test',
        trigger_event: 'ENTER',
        name: '测试发放通知',
        title: '剧情奖励',
        content: '少侠在【{chapterTitle}】获得奖励。',
        grants: [
          { type: 'ITEM', itemId: 'item_juqi_dan', quantity: 3 },
          { type: 'CURRENCY', silver: 0, ingot: 0, copper: 50 },
        ],
        enabled: true,
      },
      'test'
    );
    assertEqual(notification.grants.length, 2, '剧情通知应保存 2 项发放内容');

    const delivered = await sendStoryNotificationById(
      h.env,
      h.db,
      h.playerId,
      notification.id,
      variables
    );
    assertEqual(delivered, true, '剧情通知应投递即时通知');

    const mails = await getMails(h.db, h.playerId);
    assertEqual(mails.length, 1, '有发放内容时剧情通知应创建奖励邮件');
    assertEqual(mails[0].title, '剧情奖励', '奖励邮件标题应使用通知标题');
    assert(
      String(mails[0].content).includes('测试 · 分支'),
      '奖励邮件正文应替换章节变量'
    );

    const attachments = await getAttachments(h.db, mails[0].id);
    assertEqual(attachments.length, 2, '奖励邮件应包含 2 个附件');
    const itemAttachment = attachments.find((row: any) => row.grant_type === 'ITEM');
    const currencyAttachment = attachments.find(
      (row: any) => row.grant_type === 'CURRENCY'
    );
    assertEqual(Number(itemAttachment?.count), 3, '道具附件数量应正确');
    const currencyPayload = JSON.parse(String(currencyAttachment?.grant_payload || '{}'));
    assertEqual(Number(currencyPayload.copper), 50, '货币附件数量应正确');

    // 同一通知重复触发：即时通知可再次投递，但奖励邮件按幂等键复用
    await sendStoryNotificationById(h.env, h.db, h.playerId, notification.id, variables);
    const mailsAfterRepeat = await getMails(h.db, h.playerId);
    assertEqual(mailsAfterRepeat.length, 1, '重复触发不应重复创建奖励邮件');

    // 全局兜底配置同样支持发放内容
    await saveStoryNotificationConfig(
      h.db,
      {
        enabled: true,
        title: '剧情推进',
        content: '少侠在【{chapterTitle}】中的抉择，已引动九州风云。',
        grants: [{ type: 'CURRENCY', silver: 12, ingot: 0, copper: 0 }],
      },
      'test'
    );
    await sendStoryNodeNotification(
      h.env,
      h.db,
      h.playerId,
      { rewardKey: 'storycfg_node_test_ENTER_0' },
      variables
    );
    const mailsAfterGlobal = await getMails(h.db, h.playerId);
    assertEqual(mailsAfterGlobal.length, 2, '全局兜底通知应创建奖励邮件');

    // 节点内联触发器：内联发放内容优先于全局兜底配置
    await sendStoryNodeNotification(
      h.env,
      h.db,
      h.playerId,
      {
        rewardKey: 'storycfg_inline_0',
        grants: [{ type: 'ITEM', itemId: 'item_juqi_dan', quantity: 1 }],
      },
      variables
    );
    const inlineMail = (
      await getMails(h.db, h.playerId)
    ).find((mail: any) => mail.id === `mail_storycfg_inline_0_${h.playerId}`);
    assert(Boolean(inlineMail), '内联触发器应创建奖励邮件');
    const inlineAttachments = await getAttachments(h.db, inlineMail.id);
    assertEqual(inlineAttachments.length, 1, '内联触发器应使用内联发放内容');
    assertEqual(inlineAttachments[0].grant_type, 'ITEM', '内联触发器发放类型应为道具');

    // 内联显式配置空发放内容：不再沿用全局兜底配置
    await sendStoryNodeNotification(
      h.env,
      h.db,
      h.playerId,
      { rewardKey: 'storycfg_inline_empty', grants: [] },
      variables
    );
    assertEqual(
      (await getMails(h.db, h.playerId)).length,
      3,
      '内联空发放内容不应创建奖励邮件'
    );

    // 关闭后不再发送通知，也不再创建奖励邮件
    await saveStoryNotificationConfig(
      h.db,
      {
        enabled: false,
        title: '剧情推进',
        content: '少侠在【{chapterTitle}】中的抉择，已引动九州风云。',
        grants: [{ type: 'CURRENCY', silver: 12, ingot: 0, copper: 0 }],
      },
      'test'
    );
    const deliveredWhenDisabled = await sendStoryNodeNotification(
      h.env,
      h.db,
      h.playerId,
      { rewardKey: 'storycfg_node_test_COMPLETE_0' },
      variables
    );
    assertEqual(deliveredWhenDisabled, false, '通知关闭后不应投递即时通知');
    assertEqual(
      (await getMails(h.db, h.playerId)).length,
      3,
      '通知关闭后不应创建奖励邮件'
    );
    console.log('✓ 15. 剧情通知内容与发放逻辑通过\n');
  }

  bindRuntimeEnv(null);
  console.log('=== 恭喜！通知管理 · 玩家升级通知全部 15 项测试通过 ===');
}

runTests().catch((err) => {
  console.error('\n❌ 测试执行失败:', err);
  process.exit(1);
});
