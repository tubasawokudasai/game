import { createAdminRouter, toNumber, toNullableInt, toNullableNumber, normalizeQuality, normalizeGrowthTemplate } from './types';
import {
  calculateNpcAttributesFromRows,
  resolveEffectiveGrowthProfile,
} from '../../services/npc/attributes';
import {
  filterNpcBattleMemberLevels,
  normalizeNpcBattleMemberLevels,
} from '../../utils/npcBattleLevels';

export const worldNpcsRoutes = createAdminRouter();

async function normalizeRewardForSave(
  db: D1Database,
  body: any,
  fallbackJson = '{}'
): Promise<{ json?: string; error?: string }> {
  let raw: any = {};
  if (body.battle_reward && typeof body.battle_reward === 'object') {
    raw = body.battle_reward;
  } else if (typeof body.battle_reward_json === 'string' && body.battle_reward_json.trim()) {
    try {
      raw = JSON.parse(body.battle_reward_json);
    } catch {
      return { error: '奖励配置 JSON 格式错误' };
    }
  } else if (fallbackJson && fallbackJson.trim()) {
    try {
      raw = JSON.parse(fallbackJson);
    } catch {
      raw = {};
    }
  }

  const exp = Math.max(0, toNumber(raw.exp, 0));
  const gold = Math.max(0, toNumber(raw.gold ?? raw.copper, 0));
  const silver = Math.max(0, toNumber(raw.silver, 0));
  const items: Array<{ id: string; count: number }> = Array.isArray(raw.items)
    ? raw.items
        .map((it: any) => ({
          id: String(it?.id || '').trim(),
          count: Math.max(1, Math.round(toNumber(it?.count, 1))),
        }))
        .filter((it: { id: string }) => Boolean(it.id))
    : [];

  let resolvedItems = items;
  if (items.length > 0) {
    const ids: string[] = Array.from(new Set(items.map((it) => it.id)));
    const placeholders = ids.map(() => '?').join(',');
    const { results } = await db
      .prepare(`SELECT id, name FROM item_templates WHERE id IN (${placeholders})`)
      .bind(...ids)
      .all<{ id: string; name: string }>();
    const nameMap = new Map((results || []).map((r) => [r.id, r.name]));
    const missing = ids.filter((id) => !nameMap.has(id));
    if (missing.length > 0) {
      return { error: `奖励道具未备案：${missing.join('、')}，请先在道具库补录` };
    }
    resolvedItems = items.map((it) => ({ ...it, name: nameMap.get(it.id) || it.id }));
  }

  return { json: JSON.stringify({ exp, gold, silver, items: resolvedItems }) };
}

/**
 * 获取地图 NPC 实例列表（可按 sceneId 过滤）
 * GET /api/admin/npcs?sceneId=xxx
 */
worldNpcsRoutes.get('/npcs', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未初始化' }, 500);

  const sceneId = c.req.query('sceneId');
  let sql = `
    SELECT
      n.npc_id AS id, n.scene_id, n.key, n.name, n.badge, n.title, n.avatar, n.type,
      n.status, n.quote, n.gossip, n.dialogue_package_id, n.dialogue_root_node_id, n.created_at, n.updated_at,
      s.name AS scene_name,
      n.template_id, n.battle_group_id, n.battle_level,
      n.battle_member_levels_json,
      n.battle_reward_json, n.respawn_seconds, n.once_flag,
      n.skills_json,
      t.name AS template_name, t.title AS template_title, t.badge AS template_badge,
      t.avatar AS template_avatar, t.skills_json AS template_skills_json,
      mg.name AS battle_group_name,
      dp.name AS dialogue_package_name
    FROM npc_instances n
    LEFT JOIN scenes s ON s.id = n.scene_id
    LEFT JOIN npc_templates t ON t.id = n.template_id
    LEFT JOIN monster_groups mg ON mg.id = n.battle_group_id
    LEFT JOIN dialogue_packages dp ON dp.id = n.dialogue_package_id
    WHERE n.instance_type = 'WORLD' AND n.npc_role = 'MAP'
  `;
  const bindings: any[] = [];
  if (sceneId) {
    sql += ' AND n.scene_id = ?';
    bindings.push(sceneId);
  }
  sql += ' ORDER BY n.scene_id ASC, n.npc_id ASC';

  const query = c.env.DB.prepare(sql);
  const { results } = bindings.length > 0 ? await query.bind(...bindings).all<any>() : await query.all<any>();

  // 战斗配置的成员数 / 成员名（用于列表展示）
  const { results: memberStats } = await c.env.DB.prepare(
    `SELECT m.group_id, COUNT(*) AS count, GROUP_CONCAT(t.name, '、') AS names
     FROM monster_group_members m
     JOIN npc_instances i ON i.npc_id = m.npc_instance_id
     JOIN npc_templates t ON t.id = i.template_id
     GROUP BY m.group_id`
  ).all<any>();
  const memberMap = new Map(
    (memberStats || []).map((row) => [row.group_id, { count: Number(row.count) || 0, names: row.names || '' }])
  );

  const data = (results || []).map((row) => {
    let battleReward: any = {};
    if (row.battle_reward_json) {
      try {
        battleReward = JSON.parse(row.battle_reward_json);
      } catch {
        battleReward = {};
      }
    }
    const stats = row.battle_group_id ? memberMap.get(row.battle_group_id) : undefined;
    const rowType = row.type || 'dialogue';
    const battleMode = rowType === 'battle' ? (row.battle_group_id ? 'GROUP' : 'SOLO') : null;
    const soloEnemyName = row.name || row.template_name || row.id;
    return {
      id: row.id,
      scene_id: row.scene_id,
      scene_name: row.scene_name || row.scene_id,
      key: row.key,
      name: row.name || row.template_name || row.id,
      badge: row.badge || row.template_badge || '',
      title: row.title || row.template_title || '',
      avatar: row.avatar || row.template_avatar || '',
      type: rowType,
      status: row.status || 'ACTIVE',
      template_id: row.template_id || null,
      template_name: row.template_name || null,
      skills_json: row.skills_json || null,
      template_skills_json: row.template_skills_json || '[]',
      battle_mode: battleMode,
      battle_group_id: row.battle_group_id || null,
      battle_group_name: row.battle_group_name || null,
      enemyCount: stats?.count ?? (battleMode === 'SOLO' ? 1 : 0),
      enemyNames: stats?.names
        ? stats.names.split('、')
        : battleMode === 'SOLO'
          ? [soloEnemyName]
          : [],
      battle_level: Number(row.battle_level) || 1,
      battle_member_levels: normalizeNpcBattleMemberLevels(row.battle_member_levels_json),
      battle_member_levels_json: row.battle_member_levels_json || '{}',
      battle_reward: battleReward,
      battle_reward_json: row.battle_reward_json || '{}',
      respawn_seconds: Number(row.respawn_seconds) || 0,
      once_flag: row.once_flag || null,
      quote: row.quote || '',
      gossip: row.gossip || '',
      dialogue_package_id: row.dialogue_package_id || null,
      dialogue_package_name: row.dialogue_package_name || null,
      dialogue_root_node_id: row.dialogue_root_node_id || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });

  return c.json({ success: true, data });
});

/** 读取战斗配置实际存在的槽位，过滤地图 NPC 的等级覆盖表 */
async function loadBattleGroupSlotIndexes(
  db: D1Database,
  groupId: string | null
): Promise<number[]> {
  if (!groupId) return [];
  const { results } = await db
    .prepare(
      `SELECT slot_index FROM monster_group_members
       WHERE group_id = ?
       ORDER BY slot_index ASC`
    )
    .bind(groupId)
    .all<{ slot_index: number }>();
  return (results || []).map((row) => Number(row.slot_index)).filter(Number.isInteger);
}

/**
 * 在地图上创建 NPC 实例
 * POST /api/admin/npcs
 * body: { scene_id, template_id, name?, title?, avatar?, badge?, type?, battle_group_id?, ... }
 */
worldNpcsRoutes.post('/npcs', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未初始化' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const sceneId = String(body.scene_id || '').trim();
  const templateId = String(body.template_id || '').trim();

  if (!sceneId) return c.json({ error: '所属场景不能为空' }, 400);
  if (!templateId) return c.json({ error: '请选择一个 NPC 模板' }, 400);

  const scene = await c.env.DB.prepare('SELECT id FROM scenes WHERE id = ?').bind(sceneId).first();
  if (!scene) return c.json({ error: `指定的场景 [${sceneId}] 不存在` }, 400);

  const template = await c.env.DB.prepare('SELECT * FROM npc_templates WHERE id = ?')
    .bind(templateId)
    .first<any>();
  if (!template) return c.json({ error: `NPC 模板 [${templateId}] 不存在` }, 400);

  const type = body.type === 'battle' || body.type === 'dialogue' ? body.type : 'dialogue';
  const name = String(body.name || '').trim() || template.name;
  if (!name) return c.json({ error: 'NPC 姓名不能为空' }, 400);

  let battleGroupId: string | null = null;
  if (type === 'battle') {
    // 不选战斗配置 = 单人遭遇：该 NPC 以自己的模板作为唯一敌人上阵
    battleGroupId = String(body.battle_group_id || '').trim() || null;
    if (battleGroupId) {
      const group = await c.env.DB.prepare('SELECT id FROM monster_groups WHERE id = ?').bind(battleGroupId).first();
      if (!group) return c.json({ error: `战斗配置 [${battleGroupId}] 不存在` }, 400);
    }
  }

  const reward = await normalizeRewardForSave(c.env.DB, body);
  if (reward.error) return c.json({ error: reward.error }, 400);

  let id = String(body.id || '').trim();
  if (!id) id = `npc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  let key = String(body.key || '').trim();
  if (!key) key = `npc_${sceneId}_${Math.random().toString(36).slice(2, 8)}`;

  const conflict = await c.env.DB.prepare("SELECT npc_id FROM npc_instances WHERE instance_type = 'WORLD' AND (npc_id = ? OR key = ?)")
    .bind(id, key)
    .first();
  if (conflict) return c.json({ error: `NPC ID 或 key [${id}/${key}] 已存在` }, 400);

  const title = String(body.title || '').trim() || template.title || '江湖中人';
  const badge = String(body.badge || '').trim() || template.badge || '';
  const avatar = String(body.avatar || '').trim() || template.avatar || '';
  const quote = String(body.quote || '').trim();
  const gossip = String(body.gossip || '').trim();
  const dialoguePackageId = type === 'dialogue' ? String(body.dialogue_package_id || '').trim() || null : null;
  const dialogueRootNodeId = type === 'dialogue' ? String(body.dialogue_root_node_id || '').trim() || null : null;
  const battleLevel = Math.max(1, Math.round(toNumber(body.battle_level, 1)));
  const respawnSeconds = Math.max(0, Math.round(toNumber(body.respawn_seconds, 0)));
  const onceFlag = String(body.once_flag || '').trim() || null;
  const skillsJson = body.skills_json !== undefined
    ? (typeof body.skills_json === 'string'
        ? (body.skills_json.trim() === '' ? null : body.skills_json)
        : (Array.isArray(body.skills) || Array.isArray(body.skills_json) ? JSON.stringify(body.skills || body.skills_json) : null))
    : (template.skills_json || null);
  const allowedSlots = await loadBattleGroupSlotIndexes(c.env.DB, battleGroupId);
  const battleMemberLevels = filterNpcBattleMemberLevels(
    normalizeNpcBattleMemberLevels(
      body.battle_member_levels ?? body.battle_member_levels_json
    ),
    allowedSlots
  );

  try {
    await c.env.DB.prepare(
      `INSERT INTO npc_instances
        (npc_id, template_id, instance_type, status, scene_id, key, name, badge, title, avatar,
         type, quote, gossip, dialogue_package_id, dialogue_root_node_id,
         owner_player_id, created_by, source, source_ref,
         battle_group_id, battle_level, battle_member_levels_json,
         battle_reward_json, respawn_seconds, once_flag, level, skills_json,
         created_at, updated_at)
       VALUES (?, ?, 'WORLD', 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               NULL, ?, 'WORLD', NULL, ?, ?, ?,
               ?, ?, ?, 1, ?,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    ).bind(
      id,
      templateId,
      sceneId,
      key,
      name,
      badge,
      title,
      avatar,
      type,
      quote,
      gossip,
      dialoguePackageId,
      dialogueRootNodeId,
      c.get('adminUser')?.username || 'admin',
      type === 'battle' ? battleGroupId : null,
      battleLevel,
      JSON.stringify(type === 'battle' ? battleMemberLevels : {}),
      type === 'battle' ? reward.json || '{}' : '{}',
      type === 'battle' ? respawnSeconds : 0,
      type === 'battle' ? onceFlag : null,
      skillsJson
    ).run();

    return c.json({
      success: true,
      message: `NPC [${name}] 已创建`,
      data: { id, scene_id: sceneId, key, name, type, template_id: templateId },
    });
  } catch (err: any) {
    return c.json({ error: err.message || '创建 NPC 失败' }, 500);
  }
});

/**
 * 更新地图 NPC 实例（支持跨场景移动）
 * PUT /api/admin/npcs/:id
 */
worldNpcsRoutes.put('/npcs/:id', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未初始化' }, 500);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const existing = await c.env.DB.prepare("SELECT * FROM npc_instances WHERE npc_id = ? AND instance_type = 'WORLD'").bind(id).first<any>();
  if (!existing) return c.json({ error: 'NPC 不存在' }, 404);

  const instance = existing;
  const nextKey = String(body.key || existing.key || '').trim() || existing.key;
  if (nextKey !== existing.key) {
    const keyConflict = await c.env.DB.prepare(
      "SELECT npc_id FROM npc_instances WHERE instance_type = 'WORLD' AND key = ? AND npc_id <> ?"
    )
      .bind(nextKey, id)
      .first<{ npc_id: string }>();
    if (keyConflict) return c.json({ error: `NPC key [${nextKey}] 已被占用` }, 400);
  }

  const sceneId = String(body.scene_id || existing.scene_id).trim();
  const scene = await c.env.DB.prepare('SELECT id FROM scenes WHERE id = ?').bind(sceneId).first();
  if (!scene) return c.json({ error: `指定的场景 [${sceneId}] 不存在` }, 400);

  const templateId = String(body.template_id || instance?.template_id || '').trim();
  if (!templateId) return c.json({ error: '该 NPC 尚未绑定模板，请先选择模板' }, 400);

  const template = await c.env.DB.prepare('SELECT * FROM npc_templates WHERE id = ?')
    .bind(templateId)
    .first<any>();
  if (!template) return c.json({ error: `NPC 模板 [${templateId}] 不存在` }, 400);

  const type = body.type === 'battle' || body.type === 'dialogue' ? body.type : (existing.type || 'dialogue');
  const name = String(body.name || '').trim() || template.name;
  if (!name) return c.json({ error: 'NPC 姓名不能为空' }, 400);

  let battleGroupId: string | null = null;
  if (type === 'battle') {
    // 显式传 null / '' 表示切换为单人遭遇；未传则沿用原战斗配置
    const hasGroupInput = body.battle_group_id !== undefined;
    const rawGroupId = hasGroupInput ? body.battle_group_id : instance?.battle_group_id;
    battleGroupId = String(rawGroupId || '').trim() || null;
    if (battleGroupId) {
      const group = await c.env.DB.prepare('SELECT id FROM monster_groups WHERE id = ?').bind(battleGroupId).first();
      if (!group) return c.json({ error: `战斗配置 [${battleGroupId}] 不存在` }, 400);
    }
  }

  const reward = await normalizeRewardForSave(c.env.DB, body, instance?.battle_reward_json || '{}');
  if (reward.error) return c.json({ error: reward.error }, 400);

  const title = String(body.title || '').trim() || template.title || '江湖中人';
  const badge = String(body.badge || '').trim() || template.badge || '';
  const avatar = String(body.avatar || '').trim() || template.avatar || '';
  const quote = String(body.quote || '').trim();
  const gossip = String(body.gossip || '').trim();
  const battleLevel = Math.max(1, Math.round(toNumber(body.battle_level ?? instance?.battle_level, 1)));
  const respawnSeconds = Math.max(0, Math.round(toNumber(body.respawn_seconds ?? instance?.respawn_seconds, 0)));
  const onceFlag = String(body.once_flag ?? instance?.once_flag ?? '').trim() || null;
  const skillsJson = body.skills_json !== undefined
    ? (typeof body.skills_json === 'string'
        ? (body.skills_json.trim() === '' ? null : body.skills_json)
        : (Array.isArray(body.skills) || Array.isArray(body.skills_json) ? JSON.stringify(body.skills || body.skills_json) : null))
    : (instance?.skills_json || null);

  const hasLevelsInput =
    body.battle_member_levels !== undefined || body.battle_member_levels_json !== undefined;
  const groupChanged =
    type === 'battle' && (battleGroupId || null) !== (instance?.battle_group_id || null);
  const rawMemberLevels =
    type !== 'battle'
      ? {}
      : hasLevelsInput
        ? normalizeNpcBattleMemberLevels(
            body.battle_member_levels ?? body.battle_member_levels_json
          )
        : groupChanged
          ? {}
          : normalizeNpcBattleMemberLevels(instance?.battle_member_levels_json);
  const allowedSlots = await loadBattleGroupSlotIndexes(c.env.DB, battleGroupId);
  const battleMemberLevels = filterNpcBattleMemberLevels(rawMemberLevels, allowedSlots);

  const dialoguePackageId =
    type === 'dialogue'
      ? (body.dialogue_package_id !== undefined ? String(body.dialogue_package_id || '').trim() || null : instance?.dialogue_package_id || null)
      : null;
  const dialogueRootNodeId =
    type === 'dialogue'
      ? (body.dialogue_root_node_id !== undefined ? String(body.dialogue_root_node_id || '').trim() || null : instance?.dialogue_root_node_id || null)
      : null;

  await c.env.DB.prepare(
    `UPDATE npc_instances SET
       scene_id = ?, key = ?, name = ?, badge = ?, title = ?, avatar = ?, type = ?,
       quote = ?, gossip = ?, dialogue_package_id = ?, dialogue_root_node_id = ?,
       template_id = ?, battle_group_id = ?, battle_level = ?,
       battle_member_levels_json = ?,
       battle_reward_json = ?, respawn_seconds = ?, once_flag = ?, skills_json = ?, updated_at = CURRENT_TIMESTAMP
     WHERE npc_id = ? AND instance_type = 'WORLD'`
  ).bind(
    sceneId,
    nextKey,
    name,
    badge,
    title,
    avatar,
    type,
    quote,
    gossip,
    dialoguePackageId,
    dialogueRootNodeId,
    templateId,
    type === 'battle' ? battleGroupId : null,
    battleLevel,
    JSON.stringify(type === 'battle' ? battleMemberLevels : {}),
    type === 'battle' ? reward.json || '{}' : '{}',
    type === 'battle' ? respawnSeconds : 0,
    type === 'battle' ? onceFlag : null,
    skillsJson,
    id
  ).run();

  return c.json({
    success: true,
    message: `NPC [${name}] 更新成功`,
    data: { id, scene_id: sceneId, name, type, template_id: templateId },
  });
});

/**
 * 删除地图 NPC 实例（仍有对话节点时阻断）
 * DELETE /api/admin/npcs/:id
 */
worldNpcsRoutes.delete('/npcs/:id', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未初始化' }, 500);
  const id = c.req.param('id');

  const refs = await c.env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM npc_dialogue_routers WHERE npc_id = ?) AS routers,
       (SELECT COUNT(*) FROM dialogue_nodes WHERE npc_id = ?) AS nodes`
  )
    .bind(id, id)
    .first<any>();

  if ((Number(refs?.routers) || 0) > 0 || (Number(refs?.nodes) || 0) > 0) {
    return c.json(
      { error: `该 NPC 仍有 ${Number(refs?.routers) || 0} 条对话路由 / ${Number(refs?.nodes) || 0} 个对话节点，请先清理剧情再删除` },
      400
    );
  }

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM player_encounter_state WHERE npc_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM npc_dialogue_routers WHERE npc_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM npc_instances WHERE npc_id = ?').bind(id),
  ]);

  return c.json({ success: true, message: 'NPC 已删除' });
});

