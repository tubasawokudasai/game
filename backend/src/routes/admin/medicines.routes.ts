import { createAdminRouter, toNumber, toNullableInt, safeParseJson } from './types';

export const medicinesRoutes = createAdminRouter();

/**
 * 获取道具字典列表（用于配置战利品掉落、奖励、信物）
 * GET /api/admin/items
 */
medicinesRoutes.get('/items', async (c) => {
  if (!c.env.DB) {
    return c.json({ error: '数据库未初始化' }, 500);
  }

  const { results } = await c.env.DB.prepare(
    'SELECT id, name, type, quality, description FROM item_templates ORDER BY id ASC'
  ).all<any>();

  return c.json({ success: true, data: results || [] });
});

const VALID_MEDICINE_QUALITIES = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'] as const;

/**
 * 格式化/自动生成药效描述文本
 */
function buildDefaultEffectDesc(params: {
  hp_restore: number;
  mp_restore: number;
  exp_restore: number;
  max_hp_bonus: number;
  max_mp_bonus: number;
  effect_desc?: string;
}): string {
  if (params.effect_desc && params.effect_desc.trim()) {
    return params.effect_desc.trim();
  }
  const parts: string[] = [];
  if (params.hp_restore > 0) parts.push(`恢复 ${params.hp_restore} 点气血`);
  if (params.mp_restore > 0) parts.push(`恢复 ${params.mp_restore} 点真气`);
  if (params.exp_restore > 0) parts.push(`增加 ${params.exp_restore} 点修为`);
  if (params.max_hp_bonus > 0) parts.push(`气血上限永久 +${params.max_hp_bonus}`);
  if (params.max_mp_bonus > 0) parts.push(`内力上限永久 +${params.max_mp_bonus}`);
  return parts.length > 0 ? `服用${parts.join('，')}` : '服用调养身心，平复内伤';
}

/**
 * 获取药品列表 (支持 search 搜索、quality 品质过滤、status 上架状态过滤、分页)
 * GET /api/admin/medicines
 */
medicinesRoutes.get('/medicines', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未连接' }, 500);

  const search = (c.req.query('search') || '').trim();
  const quality = (c.req.query('quality') || '').trim().toUpperCase();
  const statusStr = c.req.query('status');
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10) || 1);
  const pageSize = Math.max(1, Math.min(200, parseInt(c.req.query('pageSize') || '50', 10) || 50));
  const offset = (page - 1) * pageSize;

  let baseSql = 'FROM medicines WHERE 1=1';
  const binds: any[] = [];

  if (search) {
    baseSql += ' AND (id LIKE ? OR name LIKE ? OR effect_desc LIKE ? OR description LIKE ?)';
    const q = `%${search}%`;
    binds.push(q, q, q, q);
  }

  if (quality && quality !== 'ALL') {
    baseSql += ' AND quality = ?';
    binds.push(quality);
  }

  if (statusStr !== undefined && statusStr !== '' && statusStr !== 'all') {
    baseSql += ' AND status = ?';
    binds.push(parseInt(statusStr, 10) === 1 ? 1 : 0);
  }

  try {
    const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total ${baseSql}`)
      .bind(...binds)
      .first<{ total: number }>();
    const total = countRow?.total || 0;

    const listSql = `SELECT * ${baseSql} ORDER BY created_at DESC, id ASC LIMIT ? OFFSET ?`;
    const { results } = await c.env.DB.prepare(listSql)
      .bind(...binds, pageSize, offset)
      .all<any>();

    return c.json({
      success: true,
      data: results || [],
      total,
      page,
      pageSize,
    });
  } catch (err: any) {
    return c.json({ error: err.message || '查询药品列表失败' }, 500);
  }
});

/**
 * 获取单个药品详情
 * GET /api/admin/medicines/:id
 */
medicinesRoutes.get('/medicines/:id', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未连接' }, 500);
  const id = c.req.param('id');

  try {
    const medicine = await c.env.DB.prepare('SELECT * FROM medicines WHERE id = ?')
      .bind(id)
      .first<any>();

    if (!medicine) {
      return c.json({ error: '未找到指定丹药档案' }, 404);
    }

    return c.json({ success: true, data: medicine });
  } catch (err: any) {
    return c.json({ error: err.message || '查询药品详情失败' }, 500);
  }
});

/**
 * 新增药品
 * POST /api/admin/medicines
 */
medicinesRoutes.post('/medicines', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未连接' }, 500);

  const body = await c.req.json().catch(() => ({}));

  let id = (body.id || '').trim();
  if (!id) {
    id = `item_med_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  }

  if (!/^[a-zA-Z0-9_-]{2,64}$/.test(id)) {
    return c.json(
      { error: '药品标识格式不合法，仅限2-64位英文字母、数字、下划线及横杠' },
      400
    );
  }

  const name = (body.name || '').trim();
  if (!name || name.length > 32) {
    return c.json({ error: '药品名称必填且长度须在1至32个字符之间' }, 400);
  }

  const quality = VALID_MEDICINE_QUALITIES.includes(body.quality) ? body.quality : 'COMMON';
  const type = 'CONSUMABLE';
  const priceCopper = Math.max(0, Math.floor(Number(body.price_copper) || 0));
  const hpRestore = Math.max(0, Math.floor(Number(body.hp_restore) || 0));
  const mpRestore = Math.max(0, Math.floor(Number(body.mp_restore) || 0));
  const expRestore = Math.max(0, Math.floor(Number(body.exp_restore) || 0));
  const maxHpBonus = Math.max(0, Math.floor(Number(body.max_hp_bonus) || 0));
  const maxMpBonus = Math.max(0, Math.floor(Number(body.max_mp_bonus) || 0));
  const status = body.status === 0 || body.status === '0' || body.status === false ? 0 : 1;
  const icon = (body.icon || 'medication').trim();
  const description = (body.description || '').trim();
  const effectDesc = buildDefaultEffectDesc({
    hp_restore: hpRestore,
    mp_restore: mpRestore,
    exp_restore: expRestore,
    max_hp_bonus: maxHpBonus,
    max_mp_bonus: maxMpBonus,
    effect_desc: body.effect_desc,
  });

  // 检查标识是否重复
  const existing = await c.env.DB.prepare('SELECT id FROM medicines WHERE id = ?')
    .bind(id)
    .first<any>();
  if (existing) {
    return c.json({ error: `药品标识【${id}】已存在，请换一个标识` }, 400);
  }

  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO medicines (
          id, name, quality, type, price_copper, effect_desc, description, icon,
          hp_restore, mp_restore, exp_restore, max_hp_bonus, max_mp_bonus, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        name,
        quality,
        type,
        priceCopper,
        effectDesc,
        description,
        icon,
        hpRestore,
        mpRestore,
        expRestore,
        maxHpBonus,
        maxMpBonus,
        status
      ),
      c.env.DB.prepare(
        `INSERT OR REPLACE INTO item_templates (id, name, type, quality, description)
         VALUES (?, ?, 'CONSUMABLE', ?, ?)`
      ).bind(id, name, quality, description || effectDesc),
    ]);

    const created = await c.env.DB.prepare('SELECT * FROM medicines WHERE id = ?')
      .bind(id)
      .first<any>();

    return c.json({
      success: true,
      data: created,
      message: `成功炼制录入仙丹【${name}】！`,
    });
  } catch (err: any) {
    return c.json({ error: err.message || '新增药品失败' }, 500);
  }
});

/**
 * 编辑/更新药品
 * PUT /api/admin/medicines/:id
 */
medicinesRoutes.put('/medicines/:id', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未连接' }, 500);
  const id = c.req.param('id');

  const existing = await c.env.DB.prepare('SELECT * FROM medicines WHERE id = ?')
    .bind(id)
    .first<any>();
  if (!existing) {
    return c.json({ error: '未找到欲修改的药品' }, 404);
  }

  const body = await c.req.json().catch(() => ({}));

  const name = body.name !== undefined ? (body.name || '').trim() : existing.name;
  if (!name || name.length > 32) {
    return c.json({ error: '药品名称不能为空且不可超过32字' }, 400);
  }

  const quality =
    body.quality !== undefined && VALID_MEDICINE_QUALITIES.includes(body.quality)
      ? body.quality
      : existing.quality;
  const priceCopper =
    body.price_copper !== undefined
      ? Math.max(0, Math.floor(Number(body.price_copper) || 0))
      : existing.price_copper;
  const hpRestore =
    body.hp_restore !== undefined
      ? Math.max(0, Math.floor(Number(body.hp_restore) || 0))
      : existing.hp_restore;
  const mpRestore =
    body.mp_restore !== undefined
      ? Math.max(0, Math.floor(Number(body.mp_restore) || 0))
      : existing.mp_restore;
  const expRestore =
    body.exp_restore !== undefined
      ? Math.max(0, Math.floor(Number(body.exp_restore) || 0))
      : existing.exp_restore;
  const maxHpBonus =
    body.max_hp_bonus !== undefined
      ? Math.max(0, Math.floor(Number(body.max_hp_bonus) || 0))
      : existing.max_hp_bonus;
  const maxMpBonus =
    body.max_mp_bonus !== undefined
      ? Math.max(0, Math.floor(Number(body.max_mp_bonus) || 0))
      : existing.max_mp_bonus;
  const status =
    body.status !== undefined
      ? body.status === 0 || body.status === '0' || body.status === false
        ? 0
        : 1
      : existing.status;
  const icon = body.icon !== undefined ? (body.icon || 'medication').trim() : existing.icon;
  const description =
    body.description !== undefined ? (body.description || '').trim() : existing.description;
  const effectDesc =
    body.effect_desc !== undefined
      ? buildDefaultEffectDesc({
          hp_restore: hpRestore,
          mp_restore: mpRestore,
          exp_restore: expRestore,
          max_hp_bonus: maxHpBonus,
          max_mp_bonus: maxMpBonus,
          effect_desc: body.effect_desc,
        })
      : existing.effect_desc;

  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE medicines
         SET name = ?, quality = ?, price_copper = ?, effect_desc = ?, description = ?,
             icon = ?, hp_restore = ?, mp_restore = ?, exp_restore = ?, max_hp_bonus = ?,
             max_mp_bonus = ?, status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).bind(
        name,
        quality,
        priceCopper,
        effectDesc,
        description,
        icon,
        hpRestore,
        mpRestore,
        expRestore,
        maxHpBonus,
        maxMpBonus,
        status,
        id
      ),
      c.env.DB.prepare(
        `INSERT OR REPLACE INTO item_templates (id, name, type, quality, description)
         VALUES (?, ?, 'CONSUMABLE', ?, ?)`
      ).bind(id, name, quality, description || effectDesc),
    ]);

    const updated = await c.env.DB.prepare('SELECT * FROM medicines WHERE id = ?')
      .bind(id)
      .first<any>();

    return c.json({
      success: true,
      data: updated,
      message: `仙丹【${name}】档案已成功修缮！`,
    });
  } catch (err: any) {
    return c.json({ error: err.message || '更新药品失败' }, 500);
  }
});

/**
 * 快速上架 / 下架药品
 * PATCH /api/admin/medicines/:id/status
 */
medicinesRoutes.patch('/medicines/:id/status', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未连接' }, 500);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const existing = await c.env.DB.prepare('SELECT id, name, status FROM medicines WHERE id = ?')
    .bind(id)
    .first<any>();
  if (!existing) {
    return c.json({ error: '未找到指定丹药' }, 404);
  }

  const nextStatus =
    body.status !== undefined
      ? body.status === 1 || body.status === '1' || body.status === true
        ? 1
        : 0
      : existing.status === 1
        ? 0
        : 1;

  try {
    await c.env.DB.prepare(
      'UPDATE medicines SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    )
      .bind(nextStatus, id)
      .run();

    return c.json({
      success: true,
      status: nextStatus,
      message: `仙丹【${existing.name}】已${nextStatus === 1 ? '上架并在悬壶药阁开售' : '下架停售'}`,
    });
  } catch (err: any) {
    return c.json({ error: err.message || '更新在售状态失败' }, 500);
  }
});

/**
 * 删除药品
 * DELETE /api/admin/medicines/:id
 */
medicinesRoutes.delete('/medicines/:id', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未连接' }, 500);
  const id = c.req.param('id');

  const existing = await c.env.DB.prepare('SELECT id, name FROM medicines WHERE id = ?')
    .bind(id)
    .first<any>();
  if (!existing) {
    return c.json({ error: '未找到指定丹药，可能已删除' }, 404);
  }

  try {
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM medicines WHERE id = ?').bind(id),
      c.env.DB.prepare("DELETE FROM item_templates WHERE id = ? AND type = 'CONSUMABLE'").bind(id),
    ]);

    return c.json({
      success: true,
      message: `仙丹【${existing.name}】已从丹房与道具名录中彻底销毁除名`,
    });
  } catch (err: any) {
    return c.json({ error: err.message || '删除药品失败' }, 500);
  }
});

