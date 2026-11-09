import { createAdminRouter } from './types';
import { experienceService } from '../../services/experienceService';
import { inventoryService } from '../../services/inventoryService';

export const playersRoutes = createAdminRouter();

/**
 * 分页检索玩家列表
 * GET /api/admin/players?page=1&pageSize=20&keyword=
 */
playersRoutes.get('/players', async (c) => {
  if (!c.env.DB) {
    return c.json({ error: '数据库未连接' }, 500);
  }

  try {
    const page = Math.max(1, Number(c.req.query('page') || 1));
    const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') || 20)));
    const keyword = (c.req.query('keyword') || '').trim();
    const zoneId = (c.req.query('zoneId') || '').trim();
    const status = (c.req.query('status') || '').trim();

    let whereClauses: string[] = [];
    let bindings: any[] = [];

    if (keyword) {
      whereClauses.push('(id LIKE ? OR nickname LIKE ? OR username LIKE ?)');
      bindings.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    if (zoneId) {
      whereClauses.push('zone_id = ?');
      bindings.push(zoneId);
    }

    if (status) {
      whereClauses.push('status = ?');
      bindings.push(status);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // 1. 获取总记录数
    const countStmt = c.env.DB.prepare(`SELECT COUNT(*) as total FROM players ${whereSql}`);
    const countRes = bindings.length > 0
      ? await countStmt.bind(...bindings).first<{ total: number }>()
      : await countStmt.first<{ total: number }>();

    const total = countRes?.total || 0;

    // 2. 获取分页数据 (采用 SELECT * 容错未迁移字段，并在前端脱敏 password_hash)
    const offset = (page - 1) * pageSize;
    const listQuery = `
      SELECT *
      FROM players
      ${whereSql}
      ORDER BY updated_at DESC, created_at DESC
      LIMIT ? OFFSET ?
    `;

    const listStmt = c.env.DB.prepare(listQuery);
    const { results: rawList } = bindings.length > 0
      ? await listStmt.bind(...bindings, pageSize, offset).all()
      : await listStmt.bind(pageSize, offset).all();

    const sanitizedList = (rawList || []).map((row: any) => {
      const { password_hash, ...rest } = row;
      return {
        ...rest,
        combat_model_key: rest.combat_model_key || 'player_default',
      };
    });

    return c.json({
      list: sanitizedList,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err: any) {
    console.error('[adminRoutes] 查询玩家列表失败:', err);
    return c.json({ error: err.message || '查询玩家列表失败' }, 500);
  }
});

/**
 * 获取玩家详情
 * GET /api/admin/players/:id
 */
playersRoutes.get('/players/:id', async (c) => {
  if (!c.env.DB) {
    return c.json({ error: '数据库未连接' }, 500);
  }

  const id = c.req.param('id');
  try {
    const player = await c.env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(id).first<any>();

    if (!player) {
      return c.json({ error: '未找到该玩家' }, 404);
    }

    delete player.password_hash;
    player.combat_model_key = player.combat_model_key || 'player_default';

    return c.json({ player });
  } catch (err: any) {
    console.error('[adminRoutes] 获取玩家详情失败:', err);
    return c.json({ error: err.message || '获取玩家详情失败' }, 500);
  }
});

/**
 * 修改玩家信息 (属性、财富、境界、坐标等)
 * PUT /api/admin/players/:id
 */
playersRoutes.put('/players/:id', async (c) => {
  if (!c.env.DB) {
    return c.json({ error: '数据库未连接' }, 500);
  }

  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  try {
    const existing = await c.env.DB.prepare('SELECT id FROM players WHERE id = ?').bind(id).first();
    if (!existing) {
      return c.json({ error: '玩家不存在' }, 404);
    }

    // 动态构建更新 SQL
    const updatableFields = [
      'nickname',
      'sect',
      'sect_position',
      'realm',
      'level',
      'exp',
      'hp',
      'max_hp',
      'mp',
      'max_mp',
      'combat_power',
      'silver',
      'ingot',
      'copper',
      'zone_id',
      'area_id',
      'status',
      'vip_level',
      'signature',
      'combat_model_key',
    ];

    const setClauses: string[] = [];
    const setValues: any[] = [];

    for (const field of updatableFields) {
      if (body[field] !== undefined) {
        setClauses.push(`${field} = ?`);
        setValues.push(body[field]);
      }
    }

    if (setClauses.length === 0) {
      return c.json({ error: '未提供任何需要更新的字段' }, 400);
    }

    setClauses.push('updated_at = CURRENT_TIMESTAMP');
    setValues.push(id);

    const updateSql = `UPDATE players SET ${setClauses.join(', ')} WHERE id = ?`;
    await c.env.DB.prepare(updateSql).bind(...setValues).run();

    // 如果修改了等级或大境界，自动调用计算系统重算综合战力与气血/法力上限，保证属性计算逻辑闭环
    if (body.level !== undefined || body.realm !== undefined) {
      try {
        await inventoryService.recalculatePlayerCombatPower(c.env.DB, id, { updateHpMp: true });
      } catch (calcErr) {
        console.warn('[adminRoutes] 更新玩家后重算战力与属性异常:', calcErr);
      }
    }

    return c.json({ success: true, message: '玩家信息已成功修改' });
  } catch (err: any) {
    console.error('[adminRoutes] 修改玩家信息失败:', err);
    return c.json({ error: err.message || '修改玩家信息失败' }, 500);
  }
});

/**
 * 删除玩家 (级联清除玩家相关所有记录与关联资产)
 * DELETE /api/admin/players/:id
 */
playersRoutes.delete('/players/:id', async (c) => {
  if (!c.env.DB) {
    return c.json({ error: '数据库未连接' }, 500);
  }

  const id = c.req.param('id');
  if (!id) {
    return c.json({ error: '玩家 ID 不能为空' }, 400);
  }

  try {
    const player = await c.env.DB.prepare('SELECT id, nickname, username FROM players WHERE id = ?')
      .bind(id)
      .first<{ id: string; nickname: string; username: string }>();

    if (!player) {
      return c.json({ error: '玩家不存在或已被删除' }, 404);
    }

    // 执行事务批处理，级联删除玩家的所有关联数据及主记录
    const statements = [
      // 1. 背包与物品
      c.env.DB.prepare('DELETE FROM inventory WHERE player_id = ?').bind(id),
      // 2. 邮件系统 (作为收件人或发件人)
      c.env.DB.prepare('DELETE FROM mails WHERE receiver_id = ? OR sender_id = ?').bind(id, id),
      // 3. 赌场下注记录
      c.env.DB.prepare('DELETE FROM casino_bets WHERE player_id = ?').bind(id),
      // 4. 野怪遭遇与战斗进度
      c.env.DB.prepare('DELETE FROM player_encounter_state WHERE player_id = ?').bind(id),
      // 5. 编年大事纪
      c.env.DB.prepare('DELETE FROM player_chronicles WHERE player_id = ?').bind(id),
      // 6. 赞叹记录 (作为被赞人或点赞人)
      c.env.DB.prepare('DELETE FROM player_likes WHERE player_id = ? OR liker_id = ?').bind(id, id),
      // 7. 任务与进度
      c.env.DB.prepare('DELETE FROM player_quests WHERE player_id = ?').bind(id),
      // 8. 剧情对话标记与主线剧情进度
      c.env.DB.prepare('DELETE FROM player_dialogue_flags WHERE player_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM player_story_progress WHERE player_id = ?').bind(id),
      // 9. 出战与编队伙伴
      c.env.DB.prepare('DELETE FROM party_members WHERE player_id = ?').bind(id),
      // 10. 玩家所属 NPC 实例
      c.env.DB.prepare('DELETE FROM npc_instances WHERE owner_player_id = ?').bind(id),
      // 11. 好友系统 (好友关系与好友申请)
      c.env.DB.prepare('DELETE FROM friends WHERE player_id = ? OR friend_id = ?').bind(id, id),
      c.env.DB.prepare('DELETE FROM friend_requests WHERE sender_id = ? OR receiver_id = ?').bind(id, id),
      // 12. 升级事件推送
      c.env.DB.prepare('DELETE FROM level_up_events WHERE player_id = ?').bind(id),
      // 13. 玩家主表记录
      c.env.DB.prepare('DELETE FROM players WHERE id = ?').bind(id),
    ];

    await c.env.DB.batch(statements);

    return c.json({
      success: true,
      message: `玩家【${player.nickname || player.username || id}】档案及相关数据已成功删除`,
    });
  } catch (err: any) {
    console.error('[adminRoutes] 删除玩家失败:', err);
    return c.json({ error: err.message || '删除玩家失败' }, 500);
  }
});

/**
 * 玩家快捷运维指令 (GM 快捷操作)
 * POST /api/admin/players/:id/quick-action
 */
playersRoutes.post('/players/:id/quick-action', async (c) => {
  if (!c.env.DB) {
    return c.json({ error: '数据库未连接' }, 500);
  }

  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const action = body.action;

  const player = await c.env.DB.prepare(
    'SELECT id, max_hp, max_mp, silver, ingot, copper FROM players WHERE id = ?'
  )
    .bind(id)
    .first<any>();

  if (!player) {
    return c.json({ error: '玩家不存在' }, 404);
  }

  if (action === 'full_restore') {
    // 满血满蓝
    await c.env.DB.prepare(
      'UPDATE players SET hp = max_hp, mp = max_mp, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    )
      .bind(id)
      .run();
    return c.json({ success: true, message: '气血内力已恢复至全满状态' });
  }

  if (action === 'teleport_home') {
    // 强制传送回主城广场
    await c.env.DB.prepare(
      "UPDATE players SET zone_id = 'changle_city', area_id = 'square', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    )
      .bind(id)
      .run();
    return c.json({ success: true, message: '已将玩家安全传送回长乐城主广场' });
  }

  if (action === 'grant_currency') {
    // 发放灵石元宝
    const addSilver = Number(body.silver) || 0;
    const addIngot = Number(body.ingot) || 0;
    const addCopper = Number(body.copper) || 0;

    await c.env.DB.prepare(
      `UPDATE players SET 
        silver = MAX(0, silver + ?), 
        ingot = MAX(0, ingot + ?), 
        copper = MAX(0, copper + ?), 
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?`
    )
      .bind(addSilver, addIngot, addCopper, id)
      .run();

    return c.json({ success: true, message: `已成功补发货币` });
  }

  if (action === 'grant_exp') {
    // 发放修仙经验并触发升级与属性重算
    const addExp = Number(body.exp) || 0;
    if (addExp <= 0) {
      return c.json({ error: '经验值必须为大于0的正数' }, 400);
    }
    const expResult = await experienceService.addExperience(c.env.DB, id!, addExp);
    return c.json({
      success: true,
      message: `已成功发放经验 +${addExp}`,
      result: expResult,
    });
  }

  if (action === 'set_status') {
    // 修改状态 (如 ONLINE / OFFLINE / BANNED)
    const status = body.status || 'OFFLINE';
    await c.env.DB.prepare(
      'UPDATE players SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    )
      .bind(status, id)
      .run();

    return c.json({ success: true, message: `玩家状态已置为 ${status}` });
  }

  return c.json({ error: '不支持的快捷操作' }, 400);
});

