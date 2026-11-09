import { createAdminRouter } from './types';
import { SceneRecord } from '../../models/types';

export const ROOT_SCENE_ID = 'scene_jiuzhou_world';

export const scenesRoutes = createAdminRouter();

/**
 * 获取所有地图场景列表
 * GET /api/admin/scenes
 */
scenesRoutes.get('/scenes', async (c) => {
  if (!c.env.DB) {
    return c.json({ error: '数据库未连接' }, 500);
  }

  try {
    const { results } = await c.env.DB.prepare(
      `SELECT id, zone_id, name, region, level, parent_id, icon, coord_x, coord_y, 
              status_desc, tag, subtitle, thumb, background_url, description, feature, cost_desc, btn_text, 
              created_at, updated_at 
       FROM scenes 
       WHERE id != ?
       ORDER BY level ASC, coord_x ASC`
    ).bind(ROOT_SCENE_ID).all<SceneRecord>();

    return c.json({ scenes: results || [] });
  } catch (err: any) {
    console.error('[adminRoutes] 获取场景列表异常:', err);
    return c.json({ error: err.message || '获取场景列表失败' }, 500);
  }
});

/**
 * 新增场景
 * POST /api/admin/scenes
 */
scenesRoutes.post('/scenes', async (c) => {
  if (!c.env.DB) {
    return c.json({ error: '数据库未连接' }, 500);
  }

  try {
    const body = await c.req.json().catch(() => ({}));
    let id = (body.id || '').trim();
    const name = (body.name || '').trim();
    const region = (body.region || '天衡州').trim();
    const backgroundUrl = (body.background_url || '').trim();

    if (!name) {
      return c.json({ error: '场景名称不能为空' }, 400);
    }
    if (!backgroundUrl) {
      return c.json({ error: '场景地图底图 background_url 不能为空，请先通过 Stitch 生成或指定底图' }, 400);
    }

    // 系统自动生成唯一场景 ID (若前端未传递或为空)
    if (!id) {
      id = `scene_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    }

    // 检查是否已存在
    const existing = await c.env.DB.prepare('SELECT id FROM scenes WHERE id = ?').bind(id).first();
    if (existing) {
      return c.json({ error: `场景 ID [${id}] 已存在，请更换` }, 409);
    }

    const zoneId = (body.zone_id || 'changle_city').trim();
    const level = Number(body.level) || 2;
    // 如果没有指定父场景且当前不是根场景本身，默认归属于系统根场景 ROOT_SCENE_ID
    const parentId = body.parent_id?.trim() || (id === ROOT_SCENE_ID ? null : ROOT_SCENE_ID);
    const icon = body.icon || (level === 1 ? 'fort' : level === 2 ? 'castle' : 'flag');
    const coordX = Math.max(0, Math.min(512, Number(body.coord_x) || 128));
    const coordY = Math.max(0, Math.min(512, Number(body.coord_y) || 256));
    const statusDesc = body.status_desc || '繁盛市井 · 安全区';
    const tag = body.tag || '';
    const subtitle = body.subtitle || '';
    const thumb = body.thumb || '';
    const description = body.description || '';
    const feature = body.feature || '';
    const costDesc = body.cost_desc || '行步耗时：无';
    const btnText = body.btn_text || '前往';

    await c.env.DB.prepare(
      `INSERT INTO scenes (
        id, zone_id, name, region, level, parent_id, icon, coord_x, coord_y, 
        status_desc, tag, subtitle, thumb, background_url, description, feature, cost_desc, btn_text
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        zoneId,
        name,
        region,
        level,
        parentId,
        icon,
        coordX,
        coordY,
        statusDesc,
        tag,
        subtitle,
        thumb,
        backgroundUrl,
        description,
        feature,
        costDesc,
        btnText
      )
      .run();

    return c.json({ success: true, message: '场景添加成功', id });
  } catch (err: any) {
    console.error('[adminRoutes] 新增场景异常:', err);
    return c.json({ error: err.message || '新增场景失败' }, 500);
  }
});

/**
 * 更新地图场景
 * PUT /api/admin/scenes/:id
 */
scenesRoutes.put('/scenes/:id', async (c) => {
  if (!c.env.DB) {
    return c.json({ error: '数据库未连接' }, 500);
  }

  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  try {
    if (body.background_url !== undefined && !String(body.background_url).trim()) {
      return c.json({ error: '场景地图底图 background_url 不能为空' }, 400);
    }
    const existing = await c.env.DB.prepare('SELECT id FROM scenes WHERE id = ?').bind(id).first();
    if (!existing) {
      return c.json({ error: `场景 [${id}] 不存在` }, 404);
    }

    await c.env.DB.prepare(
      `UPDATE scenes SET
        zone_id = COALESCE(?, zone_id),
        name = COALESCE(?, name),
        region = COALESCE(?, region),
        level = COALESCE(?, level),
        parent_id = ?,
        icon = COALESCE(?, icon),
        coord_x = COALESCE(?, coord_x),
        coord_y = COALESCE(?, coord_y),
        status_desc = COALESCE(?, status_desc),
        tag = COALESCE(?, tag),
        subtitle = COALESCE(?, subtitle),
        thumb = COALESCE(?, thumb),
        background_url = COALESCE(?, background_url),
        description = COALESCE(?, description),
        feature = COALESCE(?, feature),
        cost_desc = COALESCE(?, cost_desc),
        btn_text = COALESCE(?, btn_text),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`
    )
      .bind(
        body.zone_id !== undefined ? String(body.zone_id).trim() : null,
        body.name !== undefined ? String(body.name).trim() : null,
        body.region !== undefined ? String(body.region).trim() : null,
        body.level !== undefined ? Number(body.level) : null,
        body.parent_id !== undefined ? (body.parent_id ? String(body.parent_id).trim() : null) : null,
        body.icon !== undefined ? body.icon : null,
        body.coord_x !== undefined ? Math.max(0, Math.min(512, Number(body.coord_x))) : null,
        body.coord_y !== undefined ? Math.max(0, Math.min(512, Number(body.coord_y))) : null,
        body.status_desc !== undefined ? body.status_desc : null,
        body.tag !== undefined ? body.tag : null,
        body.subtitle !== undefined ? body.subtitle : null,
        body.thumb !== undefined ? body.thumb : null,
        body.background_url !== undefined ? body.background_url : null,
        body.description !== undefined ? body.description : null,
        body.feature !== undefined ? body.feature : null,
        body.cost_desc !== undefined ? body.cost_desc : null,
        body.btn_text !== undefined ? body.btn_text : null,
        id
      )
      .run();

    return c.json({ success: true, message: '场景信息更新成功' });
  } catch (err: any) {
    console.error('[adminRoutes] 更新场景异常:', err);
    return c.json({ error: err.message || '更新场景失败' }, 500);
  }
});

/**
 * 删除场景
 * DELETE /api/admin/scenes/:id
 */
scenesRoutes.delete('/scenes/:id', async (c) => {
  if (!c.env.DB) {
    return c.json({ error: '数据库未连接' }, 500);
  }

  const id = c.req.param('id') || '';
  if (['scene_jiuzhou_world', 'square', 'manor'].includes(id)) {
    return c.json({ error: '系统保留的核心主城/根世界场景不可删除' }, 400);
  }

  try {
    // 1. 将以该场景作为 parent_id 的子场景父节点解除关联，避免悬挂
    await c.env.DB.prepare('UPDATE scenes SET parent_id = NULL WHERE parent_id = ?').bind(id).run();

    // 2. 删除当前场景
    await c.env.DB.prepare('DELETE FROM scenes WHERE id = ?').bind(id).run();

    return c.json({ success: true, message: '场景删除成功' });
  } catch (err: any) {
    console.error('[adminRoutes] 删除场景异常:', err);
    return c.json({ error: err.message || '删除场景失败' }, 500);
  }
});
