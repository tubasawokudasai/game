import { createAdminRouter, toNumber, toNullableInt, toNullableNumber, normalizeQuality, normalizeGrowthTemplate } from './types';
import { calculateNpcAttributesFromRows } from '../../services/npc/attributes';

export const npcInstancesRoutes = createAdminRouter();

/**
 * NPC 实例列表（全量，可按类型/状态/来源/归属玩家/关键字筛选）
 * GET /api/admin/npc-instances?page=1&pageSize=50&instanceType=&status=&source=&ownerPlayerId=&keyword=
 */
npcInstancesRoutes.get('/npc-instances', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未初始化' }, 500);

  try {
    const page = Math.max(1, Number(c.req.query('page') || 1));
    const pageSize = Math.min(200, Math.max(1, Number(c.req.query('pageSize') || 50)));
    const keyword = (c.req.query('keyword') || '').trim();
    const instanceType = (c.req.query('instanceType') || '').trim();
    const status = (c.req.query('status') || '').trim();
    const source = (c.req.query('source') || '').trim();
    const ownerPlayerId = (c.req.query('ownerPlayerId') || '').trim();

    const where: string[] = ['1 = 1'];
    const bindings: any[] = [];

    if (instanceType) {
      where.push('i.instance_type = ?');
      bindings.push(instanceType);
    }
    if (status) {
      where.push('i.status = ?');
      bindings.push(status);
    }
    if (source) {
      where.push('i.source = ?');
      bindings.push(source);
    }
    if (ownerPlayerId) {
      where.push('i.owner_player_id = ?');
      bindings.push(ownerPlayerId);
    }
    if (keyword) {
      where.push('(i.npc_id LIKE ? OR i.name LIKE ? OR i.key LIKE ? OR i.owner_player_id LIKE ? OR p.nickname LIKE ? OR t.name LIKE ?)');
      const like = `%${keyword}%`;
      bindings.push(like, like, like, like, like, like);
    }

    const whereSql = where.join(' AND ');
    const countStmt = c.env.DB.prepare(
      `SELECT COUNT(*) AS total
       FROM npc_instances i
       LEFT JOIN npc_templates t ON t.id = i.template_id
       LEFT JOIN players p ON p.id = i.owner_player_id
       WHERE ${whereSql}`
    );
    const countRes = bindings.length > 0
      ? await countStmt.bind(...bindings).first<{ total: number }>()
      : await countStmt.first<{ total: number }>();
    const total = Number(countRes?.total) || 0;

    const offset = (page - 1) * pageSize;
    const listStmt = c.env.DB.prepare(
      `SELECT i.*,
              t.name AS template_name, t.key AS template_key, t.skills_json AS template_skills_json,
              p.nickname AS owner_name,
              s.name AS scene_name
       FROM npc_instances i
       LEFT JOIN npc_templates t ON t.id = i.template_id
       LEFT JOIN players p ON p.id = i.owner_player_id
       LEFT JOIN scenes s ON s.id = i.scene_id
       WHERE ${whereSql}
       ORDER BY i.created_at DESC, i.npc_id ASC
       LIMIT ? OFFSET ?`
    );
    const { results } = bindings.length > 0
      ? await listStmt.bind(...bindings, pageSize, offset).all<any>()
      : await listStmt.bind(pageSize, offset).all<any>();

    return c.json({
      success: true,
      data: results || [],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err: any) {
    console.error('[adminRoutes] 查询 NPC 实例失败:', err);
    return c.json({ error: err.message || '查询 NPC 实例失败' }, 500);
  }
});

/**
 * 更新 NPC 实例的可管理字段（名称/等级/状态）
 * PATCH /api/admin/npc-instances/:id
 */
npcInstancesRoutes.patch('/npc-instances/:id', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未初始化' }, 500);
  const id = c.req.param('id') || '';
  const body = await c.req.json().catch(() => ({}));

  const existing = await c.env.DB.prepare('SELECT * FROM npc_instances WHERE npc_id = ?')
    .bind(id)
    .first<any>();
  if (!existing) return c.json({ error: 'NPC 实例不存在' }, 404);

  const name = String(body.name ?? existing.name).trim() || existing.name;
  const level = Math.max(1, Math.round(toNumber(body.level ?? existing.level, 1)));
  const status = ['ACTIVE', 'PENDING', 'MERGED', 'DISABLED'].includes(String(body.status))
    ? String(body.status)
    : existing.status;

  const quality = body.quality !== undefined
    ? normalizeQuality(body.quality)
    : (existing.quality || null);
  const growthTemplate = body.growth_template !== undefined
    ? normalizeGrowthTemplate(body.growth_template)
    : (existing.growth_template || null);
  const realm = body.realm !== undefined
    ? (String(body.realm || '').trim() || null)
    : (existing.realm || null);
  const bonusJson = typeof body.bonus_json === 'string'
    ? body.bonus_json
    : (existing.bonus_json || '{}');
  const skillsJson = body.skills_json !== undefined
    ? (typeof body.skills_json === 'string'
        ? (body.skills_json.trim() === '' ? null : body.skills_json)
        : (Array.isArray(body.skills) || Array.isArray(body.skills_json) ? JSON.stringify(body.skills || body.skills_json) : null))
    : existing.skills_json;

  await c.env.DB.prepare(
    `UPDATE npc_instances
     SET name = ?, level = ?, realm = ?, status = ?, quality = ?, growth_template = ?, bonus_json = ?, skills_json = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE npc_id = ?`
  )
    .bind(name, level, realm, status, quality, growthTemplate, bonusJson, skillsJson, id)
    .run();

  // 若被禁用，同时把对应出征伙伴下阵，避免仍占用出战席位
  if (status === 'DISABLED') {
    await c.env.DB.prepare(
      `UPDATE party_members SET is_active = 0, updated_at = CURRENT_TIMESTAMP
       WHERE member_key = ?`
    )
      .bind(id)
      .run();
  }

  return c.json({ success: true, message: `NPC 实例 [${name}] 已更新` });
});

/**
 * 删除 NPC 实例
 * DELETE /api/admin/npc-instances/:id
 * 如果是地图 WORLD 实例，且存在未清理的剧情路由/对话节点，会予以拦截。
 */
npcInstancesRoutes.delete('/npc-instances/:id', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未初始化' }, 500);
  const id = c.req.param('id') || '';

  const existing = await c.env.DB.prepare('SELECT * FROM npc_instances WHERE npc_id = ?')
    .bind(id)
    .first<any>();
  if (!existing) return c.json({ error: 'NPC 实例不存在' }, 404);

  if (existing.instance_type === 'WORLD') {
    const refs = await c.env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM npc_dialogue_routers WHERE npc_id = ?) AS routers,
         (SELECT COUNT(*) FROM dialogue_nodes WHERE npc_id = ?) AS nodes`
    )
      .bind(id, id)
      .first<any>();

    if ((Number(refs?.routers) || 0) > 0 || (Number(refs?.nodes) || 0) > 0) {
      return c.json(
        { error: `该地图 NPC 仍有 ${Number(refs?.routers) || 0} 条对话路由 / ${Number(refs?.nodes) || 0} 个对话节点，请先在剧情管理中清理后再删除` },
        400
      );
    }
  }

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM party_members WHERE member_key = ?').bind(id),
    c.env.DB.prepare('DELETE FROM monster_group_members WHERE npc_instance_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM player_encounter_state WHERE npc_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM npc_dialogue_routers WHERE npc_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM npc_instances WHERE npc_id = ?').bind(id),
  ]);

  return c.json({ success: true, message: 'NPC 实例已删除' });
});

