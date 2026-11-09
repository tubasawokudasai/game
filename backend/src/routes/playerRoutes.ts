import { Hono, Context } from 'hono';
import { Env } from '../models/env';
import { extractAuthPayload } from './authRoutes';
import { requireDb } from '../middleware/dbMiddleware';
import { playerService, PlayerServiceError } from '../services/playerService';
import { inventoryService } from '../services/inventoryService';

export const playerRoutes = new Hono<{ Bindings: Env }>();

playerRoutes.use('*', requireDb);

/**
 * 获取当前登录玩家全息资料
 * GET /api/player/me
 */
playerRoutes.get('/me', async (c) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '请先登录后再查阅修仙玉牒' }, 401);
  }

  try {
    const res = await playerService.getMe(c.env.DB, playerId);
    return c.json(res);
  } catch (err: unknown) {
    if (err instanceof PlayerServiceError) {
      return c.json({ error: err.message }, err.status as any);
    }
    console.error('[Player API] D1 查询 players 异常:', err);
    return c.json(
      { error: '数据库查询异常: ' + (err instanceof Error ? err.message : String(err)) },
      500
    );
  }
});

/**
 * 获取玩家进行中的任务
 * GET /api/player/story/active
 */
playerRoutes.get('/story/active', async (c) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '请先登录后再查看仙途剧情' }, 401);
  }

  try {
    const res = await playerService.getActiveStory(c.env.DB, playerId);
    return c.json(res);
  } catch (err: unknown) {
    console.error('[Story API] 查询进行中剧情异常:', err);
    return c.json(
      { error: '数据库查询异常: ' + (err instanceof Error ? err.message : String(err)) },
      500
    );
  }
});

/**
 * 获取玩家乾坤行囊与装备
 * GET /api/player/inventory
 */
const handleGetInventory = async (c: Context<{ Bindings: Env }>) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '请先登录后再查看乾坤行囊' }, 401);
  }

  try {
    const category = c.req.query('category') || c.req.query('type');
    const equipped = c.req.query('equipped') as 'all' | 'true' | 'false' | undefined;
    const bag = await inventoryService.getQiankunBag(c.env.DB, playerId, category, equipped);
    return c.json(bag);
  } catch (err: unknown) {
    console.error('[Inventory API] 查询乾坤行囊异常:', err);
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
};

playerRoutes.get('/inventory', handleGetInventory);

/**
 * 服用/使用行囊中的丹药或消耗品
 * POST /api/player/inventory/use
 */
const handleUseItem = async (c: Context<{ Bindings: Env }>) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '请先登录后再使用法宝丹药' }, 401);
  }

  try {
    const body = await c.req.json<{ inventoryId?: string; count?: number }>().catch(() => ({} as { inventoryId?: string; count?: number }));
    const inventoryId = body?.inventoryId;
    const count = Math.max(1, Number(body?.count) || 1);
    if (!inventoryId) {
      return c.json({ error: '缺少物品实例 ID (inventoryId)' }, 400);
    }
    const result = await inventoryService.useItem(c.env.DB, playerId, inventoryId, count);
    return c.json(result);
  } catch (err: unknown) {
    console.error('[Inventory API] 使用物品异常:', err);
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
};

playerRoutes.post('/inventory/use', handleUseItem);

/**
 * 穿戴行囊中的神兵装备
 * POST /api/player/inventory/equip
 */
const handleEquipItem = async (c: Context<{ Bindings: Env }>) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '请先登录后再穿戴神兵' }, 401);
  }

  try {
    const body = await c.req.json<{ inventoryId?: string }>().catch(() => ({} as { inventoryId?: string }));
    const inventoryId = body?.inventoryId;
    if (!inventoryId) {
      return c.json({ error: '缺少装备实例 ID (inventoryId)' }, 400);
    }
    const result = await inventoryService.equipItem(c.env.DB, playerId, inventoryId);
    return c.json(result);
  } catch (err: unknown) {
    console.error('[Inventory API] 佩戴装备异常:', err);
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
};

playerRoutes.post('/inventory/equip', handleEquipItem);

/**
 * 卸下身上穿戴的神兵存回行囊
 * POST /api/player/inventory/unequip
 */
const handleUnequipItem = async (c: Context<{ Bindings: Env }>) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '请先登录后再卸下装备' }, 401);
  }

  try {
    const body = await c.req.json<{ inventoryId?: string }>().catch(() => ({} as { inventoryId?: string }));
    const inventoryId = body?.inventoryId;
    if (!inventoryId) {
      return c.json({ error: '缺少装备实例 ID (inventoryId)' }, 400);
    }
    const result = await inventoryService.unequipItem(c.env.DB, playerId, inventoryId);
    return c.json(result);
  } catch (err: unknown) {
    console.error('[Inventory API] 卸下装备异常:', err);
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
};

playerRoutes.post('/inventory/unequip', handleUnequipItem);

/**
 * 整理归拢乾坤行囊
 * POST /api/player/inventory/tidy
 */
const handleTidyBag = async (c: Context<{ Bindings: Env }>) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '请先登录后再规整行囊' }, 401);
  }

  try {
    const result = await inventoryService.tidyBag(c.env.DB, playerId);
    return c.json(result);
  } catch (err: unknown) {
    console.error('[Inventory API] 整理行囊异常:', err);
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
};

playerRoutes.post('/inventory/tidy', handleTidyBag);

/**
 * 丢弃行囊中的物品
 * POST /api/player/inventory/discard
 */
const handleDiscardItem = async (c: Context<{ Bindings: Env }>) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '请先登录后再舍弃物品' }, 401);
  }

  try {
    const body = await c.req.json<{ inventoryId?: string; count?: number }>().catch(() => ({} as { inventoryId?: string; count?: number }));
    const inventoryId = body?.inventoryId;
    const count = Math.max(1, Number(body?.count) || 1);
    if (!inventoryId) {
      return c.json({ error: '缺少物品实例 ID (inventoryId)' }, 400);
    }
    const result = await inventoryService.discardItem(c.env.DB, playerId, inventoryId, count);
    return c.json(result);
  } catch (err: unknown) {
    console.error('[Inventory API] 舍弃物品异常:', err);
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
};

playerRoutes.post('/inventory/discard', handleDiscardItem);

/**
 * 获取玩家自己的同道小队列表
 * GET /api/player/party
 */
playerRoutes.get('/party', async (c) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '请先登录后再查看同道小队' }, 401);
  }

  try {
    const res = await playerService.getParty(c.env.DB, playerId);
    return c.json(res);
  } catch (err: unknown) {
    if (err instanceof PlayerServiceError) {
      return c.json({ error: err.message }, err.status as any);
    }
    console.error('[Party API] D1 查询队伍成员异常:', err);
    return c.json(
      { error: '数据库查询异常: ' + (err instanceof Error ? err.message : String(err)) },
      500
    );
  }
});

/**
 * 切换伙伴出战 / 休息状态
 * PATCH /api/player/party/:memberKey
 */
playerRoutes.patch('/party/:memberKey', async (c) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '请先登录后再整备同道小队' }, 401);
  }

  const memberKey = c.req.param('memberKey');
  const body = await c.req.json().catch(() => ({}) as { isActive?: unknown });
  const isActive = (body as { isActive?: unknown }).isActive;

  if (typeof isActive !== 'boolean') {
    return c.json({ error: 'isActive 必须为布尔值' }, 400);
  }

  try {
    const res = await playerService.switchPartyMemberActive(c.env.DB, playerId, memberKey, isActive);
    return c.json(res);
  } catch (err: unknown) {
    if (err instanceof PlayerServiceError) {
      return c.json({ error: err.message }, err.status as any);
    }
    console.error('[Party API] D1 更新队伍出战状态异常:', err);
    return c.json(
      { error: '数据库更新异常: ' + (err instanceof Error ? err.message : String(err)) },
      500
    );
  }
});

/**
 * 内容预设：头像立绘目录 + 道号取名库
 * GET /api/player/presets
 */
playerRoutes.get('/presets', async (c) => {
  try {
    const presets = await playerService.getPresets(c.env.DB);
    return c.json(presets);
  } catch (err) {
    console.error('[playerRoutes] 读取内容预设失败:', err);
    return c.json({ error: '读取内容预设失败' }, 500);
  }
});

/**
 * 修改当前玩家资料
 * PUT /api/player/profile
 * POST /api/player/profile
 */
const handleUpdateProfile = async (c: Context<{ Bindings: Env }>) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '请先登录后再修改修仙玉牒' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : undefined;
  const avatar = typeof body.avatar === 'string' ? body.avatar.trim() : undefined;
  const signature = typeof body.signature === 'string' ? body.signature.trim() : undefined;

  try {
    const res = await playerService.updateProfile(c.env.DB, playerId, { nickname, avatar, signature });
    return c.json(res);
  } catch (err: unknown) {
    if (err instanceof PlayerServiceError) {
      return c.json({ error: err.message }, err.status as any);
    }
    console.error('[Player Profile Update API] 异常:', err);
    return c.json(
      { error: '更新修仙玉牒失败: ' + (err instanceof Error ? err.message : String(err)) },
      500
    );
  }
};

playerRoutes.put('/profile', handleUpdateProfile);
playerRoutes.post('/profile', handleUpdateProfile);

/**
 * 获取指定道友全息档案
 * GET /api/player/profile/:id
 */
playerRoutes.get('/profile/:id', async (c) => {
  const targetId = c.req.param('id');
  const authPayload = await extractAuthPayload(c);
  const requesterId = authPayload?.sub;

  try {
    const res = await playerService.getProfileDetail(c.env.DB, targetId, requesterId);
    return c.json(res);
  } catch (err: unknown) {
    if (err instanceof PlayerServiceError) {
      return c.json({ error: err.message }, err.status as any);
    }
    console.error('[Player Profile API] 查询异常:', err);
    return c.json(
      { error: '数据库查询异常: ' + (err instanceof Error ? err.message : String(err)) },
      500
    );
  }
});

/**
 * 为指定道友赞叹/点赞
 * POST /api/player/:id/like
 */
playerRoutes.post('/:id/like', async (c) => {
  const targetId = c.req.param('id');
  const authPayload = await extractAuthPayload(c);
  const requesterId = authPayload?.sub;

  if (!requesterId) {
    return c.json({ error: '请先登录后再为道友点赞' }, 401);
  }

  try {
    const res = await playerService.likePlayer(c.env.DB, targetId, requesterId);
    return c.json(res);
  } catch (err: unknown) {
    if (err instanceof PlayerServiceError) {
      return c.json({ error: err.message }, err.status as any);
    }
    console.error('[Player Like API] 异常:', err);
    return c.json(
      { error: '点赞异常: ' + (err instanceof Error ? err.message : String(err)) },
      500
    );
  }
});
