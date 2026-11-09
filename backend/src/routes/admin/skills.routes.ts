import { createAdminRouter, toNumber } from './types';
import { CombatSkillTargetType, CombatSkillKind } from '../../models/combat';

export const skillsRoutes = createAdminRouter();

const VALID_TARGET_TYPES: CombatSkillTargetType[] = [
  'SINGLE_ENEMY',
  'SINGLE_ALLY',
  'SELF',
  'ALL_ENEMIES',
  'ALL_ALLIES',
];

const VALID_SKILL_KINDS: CombatSkillKind[] = ['DAMAGE', 'HEAL', 'BUFF', 'DEBUFF'];

interface CombatSkillRecord {
  skill_key: string;
  name: string;
  description: string | null;
  cost_mp: number;
  target_type: string;
  skill_kind: string;
  power: number | null;
  icon: string | null;
  sort_order: number;
  is_enabled: number;
  created_at?: string;
}

/**
 * 获取技能列表 (支持 search 搜索、targetType/kind 筛选、status 过滤、分页)
 * GET /api/admin/skills
 */
skillsRoutes.get('/skills', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未连接' }, 500);

  const search = (c.req.query('search') || '').trim();
  const targetType = (c.req.query('targetType') || '').trim();
  const skillKind = (c.req.query('skillKind') || '').trim().toUpperCase();
  const statusStr = c.req.query('status');
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10) || 1);
  const pageSize = Math.max(1, Math.min(200, parseInt(c.req.query('pageSize') || '50', 10) || 50));
  const offset = (page - 1) * pageSize;

  let baseSql = 'FROM combat_skills WHERE 1=1';
  const conditions: string[] = [];
  const params: any[] = [];

  if (search) {
    conditions.push('(skill_key LIKE ? OR name LIKE ? OR description LIKE ?)');
    const wildcard = `%${search}%`;
    params.push(wildcard, wildcard, wildcard);
  }

  if (targetType && targetType !== 'ALL') {
    conditions.push('target_type = ?');
    params.push(targetType);
  }

  if (skillKind && skillKind !== 'ALL') {
    conditions.push('skill_kind = ?');
    params.push(skillKind);
  }

  if (statusStr !== undefined && statusStr !== '' && statusStr !== 'ALL') {
    const isEnabled = parseInt(statusStr, 10);
    if (!isNaN(isEnabled)) {
      conditions.push('is_enabled = ?');
      params.push(isEnabled);
    }
  }

  const whereClause = conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : '';

  try {
    const countSql = `SELECT COUNT(*) as total ${baseSql}${whereClause}`;
    const countResult = await c.env.DB.prepare(countSql).bind(...params).first<{ total: number }>();
    const total = countResult?.total || 0;

    const listSql = `SELECT skill_key, name, description, cost_mp, target_type, skill_kind, power, icon, sort_order, is_enabled, created_at
      ${baseSql}${whereClause}
      ORDER BY sort_order ASC, skill_key ASC
      LIMIT ? OFFSET ?`;

    const { results } = await c.env.DB.prepare(listSql)
      .bind(...params, pageSize, offset)
      .all<CombatSkillRecord>();

    return c.json({
      success: true,
      data: results || [],
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
    });
  } catch (err: any) {
    console.error('[adminRoutes] 查询技能列表失败:', err);
    return c.json({ error: err.message || '查询技能列表失败' }, 500);
  }
});

/**
 * 获取单个技能详情
 * GET /api/admin/skills/:skillKey
 */
skillsRoutes.get('/skills/:skillKey', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未连接' }, 500);

  const skillKey = c.req.param('skillKey');
  try {
    const skill = await c.env.DB.prepare(
      `SELECT skill_key, name, description, cost_mp, target_type, skill_kind, power, icon, sort_order, is_enabled, created_at
       FROM combat_skills
       WHERE skill_key = ?`
    ).bind(skillKey).first<CombatSkillRecord>();

    if (!skill) {
      return c.json({ error: '技能不存在' }, 404);
    }

    return c.json({ success: true, data: skill });
  } catch (err: any) {
    console.error('[adminRoutes] 获取技能详情失败:', err);
    return c.json({ error: err.message || '获取技能详情失败' }, 500);
  }
});

/**
 * 新增技能
 * POST /api/admin/skills
 */
skillsRoutes.post('/skills', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未连接' }, 500);

  try {
    const body = await c.req.json().catch(() => ({}));
    let skillKey = (body.skill_key || body.id || '').trim();
    const name = (body.name || '').trim();
    const description = (body.description || '').trim();
    const costMp = Math.max(0, toNumber(body.cost_mp !== undefined ? body.cost_mp : body.costMp, 0));
    const targetType = (body.target_type || body.targetType || 'SINGLE_ENEMY').trim();
    const skillKind = (body.skill_kind || body.skillKind || 'DAMAGE').trim().toUpperCase();
    const power = body.power !== undefined && body.power !== null && body.power !== '' ? Number(body.power) : null;
    const icon = (body.icon || '').trim() || null;
    const sortOrder = toNumber(body.sort_order !== undefined ? body.sort_order : body.sortOrder, 0);
    const isEnabled = body.is_enabled !== undefined ? (Number(body.is_enabled) ? 1 : 0) : 1;

    if (!name) {
      return c.json({ error: '技能名称不能为空' }, 400);
    }

    if (!VALID_TARGET_TYPES.includes(targetType as CombatSkillTargetType)) {
      return c.json({ error: `目标类型非法，支持: ${VALID_TARGET_TYPES.join(', ')}` }, 400);
    }

    if (!VALID_SKILL_KINDS.includes(skillKind as CombatSkillKind)) {
      return c.json({ error: `技能类型非法，支持: ${VALID_SKILL_KINDS.join(', ')}` }, 400);
    }

    if (!skillKey) {
      skillKey = `skill_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    }

    // 检查 skill_key 唯一性
    const existing = await c.env.DB.prepare(
      'SELECT skill_key FROM combat_skills WHERE skill_key = ?'
    ).bind(skillKey).first();

    if (existing) {
      return c.json({ error: `技能键标识 ${skillKey} 已存在，不可重复` }, 400);
    }

    await c.env.DB.prepare(
      `INSERT INTO combat_skills (
        skill_key, name, description, cost_mp, target_type, skill_kind, power, icon, sort_order, is_enabled
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      skillKey,
      name,
      description,
      costMp,
      targetType,
      skillKind,
      power,
      icon,
      sortOrder,
      isEnabled
    ).run();

    return c.json({
      success: true,
      message: '技能创建成功',
      data: {
        skill_key: skillKey,
        name,
        description,
        cost_mp: costMp,
        target_type: targetType,
        skill_kind: skillKind,
        power,
        icon,
        sort_order: sortOrder,
        is_enabled: isEnabled,
      },
    }, 201);
  } catch (err: any) {
    console.error('[adminRoutes] 新增技能异常:', err);
    return c.json({ error: err.message || '新增技能失败' }, 500);
  }
});

/**
 * 修改技能
 * PUT /api/admin/skills/:skillKey
 */
skillsRoutes.put('/skills/:skillKey', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未连接' }, 500);

  const skillKey = c.req.param('skillKey');
  try {
    const existing = await c.env.DB.prepare(
      'SELECT * FROM combat_skills WHERE skill_key = ?'
    ).bind(skillKey).first<CombatSkillRecord>();

    if (!existing) {
      return c.json({ error: '技能不存在' }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const name = body.name !== undefined ? String(body.name).trim() : existing.name;
    const description = body.description !== undefined ? String(body.description).trim() : existing.description;
    const costMp = body.cost_mp !== undefined || body.costMp !== undefined
      ? Math.max(0, toNumber(body.cost_mp !== undefined ? body.cost_mp : body.costMp, 0))
      : existing.cost_mp;
    const targetType = body.target_type !== undefined || body.targetType !== undefined
      ? String(body.target_type || body.targetType).trim()
      : existing.target_type;
    const skillKind = body.skill_kind !== undefined || body.skillKind !== undefined
      ? String(body.skill_kind || body.skillKind).trim().toUpperCase()
      : existing.skill_kind;
    const power = body.power !== undefined
      ? (body.power !== null && body.power !== '' ? Number(body.power) : null)
      : existing.power;
    const icon = body.icon !== undefined ? (String(body.icon).trim() || null) : existing.icon;
    const sortOrder = body.sort_order !== undefined || body.sortOrder !== undefined
      ? toNumber(body.sort_order !== undefined ? body.sort_order : body.sortOrder, existing.sort_order)
      : existing.sort_order;
    const isEnabled = body.is_enabled !== undefined
      ? (Number(body.is_enabled) ? 1 : 0)
      : existing.is_enabled;

    if (!name) {
      return c.json({ error: '技能名称不能为空' }, 400);
    }

    if (!VALID_TARGET_TYPES.includes(targetType as CombatSkillTargetType)) {
      return c.json({ error: `目标类型非法，支持: ${VALID_TARGET_TYPES.join(', ')}` }, 400);
    }

    if (!VALID_SKILL_KINDS.includes(skillKind as CombatSkillKind)) {
      return c.json({ error: `技能类型非法，支持: ${VALID_SKILL_KINDS.join(', ')}` }, 400);
    }

    await c.env.DB.prepare(
      `UPDATE combat_skills SET
        name = ?,
        description = ?,
        cost_mp = ?,
        target_type = ?,
        skill_kind = ?,
        power = ?,
        icon = ?,
        sort_order = ?,
        is_enabled = ?
       WHERE skill_key = ?`
    ).bind(
      name,
      description,
      costMp,
      targetType,
      skillKind,
      power,
      icon,
      sortOrder,
      isEnabled,
      skillKey
    ).run();

    return c.json({
      success: true,
      message: '技能更新成功',
      data: {
        skill_key: skillKey,
        name,
        description,
        cost_mp: costMp,
        target_type: targetType,
        skill_kind: skillKind,
        power,
        icon,
        sort_order: sortOrder,
        is_enabled: isEnabled,
      },
    });
  } catch (err: any) {
    console.error('[adminRoutes] 修改技能异常:', err);
    return c.json({ error: err.message || '修改技能失败' }, 500);
  }
});

/**
 * 切换技能启用状态
 * PATCH /api/admin/skills/:skillKey/status
 */
skillsRoutes.patch('/skills/:skillKey/status', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未连接' }, 500);

  const skillKey = c.req.param('skillKey');
  try {
    const existing = await c.env.DB.prepare(
      'SELECT skill_key, is_enabled FROM combat_skills WHERE skill_key = ?'
    ).bind(skillKey).first<CombatSkillRecord>();

    if (!existing) {
      return c.json({ error: '技能不存在' }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    let nextStatus = existing.is_enabled === 1 ? 0 : 1;
    if (body.is_enabled !== undefined) {
      nextStatus = Number(body.is_enabled) ? 1 : 0;
    }

    await c.env.DB.prepare(
      'UPDATE combat_skills SET is_enabled = ? WHERE skill_key = ?'
    ).bind(nextStatus, skillKey).run();

    return c.json({
      success: true,
      message: `技能已${nextStatus === 1 ? '启用' : '禁用'}`,
      is_enabled: nextStatus,
    });
  } catch (err: any) {
    console.error('[adminRoutes] 切换技能状态异常:', err);
    return c.json({ error: err.message || '切换技能状态失败' }, 500);
  }
});

/**
 * 删除技能
 * DELETE /api/admin/skills/:skillKey
 */
skillsRoutes.delete('/skills/:skillKey', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未连接' }, 500);

  const skillKey = c.req.param('skillKey');
  try {
    const existing = await c.env.DB.prepare(
      'SELECT skill_key FROM combat_skills WHERE skill_key = ?'
    ).bind(skillKey).first<CombatSkillRecord>();

    if (!existing) {
      return c.json({ error: '技能不存在' }, 404);
    }

    await c.env.DB.prepare(
      'DELETE FROM combat_skills WHERE skill_key = ?'
    ).bind(skillKey).run();

    return c.json({ success: true, message: '技能已成功删除' });
  } catch (err: any) {
    console.error('[adminRoutes] 删除技能异常:', err);
    return c.json({ error: err.message || '删除技能失败' }, 500);
  }
});
