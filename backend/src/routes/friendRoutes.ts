import { Hono } from 'hono';
import { Env } from '../models/env';
import { extractAuthPayload } from './authRoutes';
import { friendService } from '../services/friendService';
import { SendFriendRequestSchema, HandleFriendRequestSchema } from '../models/schemas';
import { requireDb } from '../middleware/dbMiddleware';

export const friendRoutes = new Hono<{ Bindings: Env }>();

friendRoutes.use('*', requireDb);

/**
 * 1. 获取当前玩家仙友列表
 * GET /api/friends
 */
friendRoutes.get('/', async (c) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '请先登录后再查阅仙友录' }, 401);
  }

  try {
    const friends = await friendService.getFriends(c.env.DB, playerId);
    return c.json({ friends });
  } catch (err: unknown) {
    console.error('[Friend API] 获取仙友列表失败:', err);
    return c.json(
      { error: '获取仙友录失败: ' + (err instanceof Error ? err.message : String(err)) },
      500
    );
  }
});

/**
 * 2. 获取当前玩家收到的结交申请列表
 * GET /api/friends/requests
 */
friendRoutes.get('/requests', async (c) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '请先登录后再查阅结交名帖' }, 401);
  }

  try {
    const requests = await friendService.getPendingRequests(c.env.DB, playerId);
    return c.json({ requests });
  } catch (err: unknown) {
    console.error('[Friend API] 获取结交申请失败:', err);
    return c.json(
      { error: '获取申请列表失败: ' + (err instanceof Error ? err.message : String(err)) },
      500
    );
  }
});

/**
 * 3. 检查与目标玩家的结交状态
 * GET /api/friends/status/:targetPlayerId
 */
friendRoutes.get('/status/:targetPlayerId', async (c) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '请先登录' }, 401);
  }

  const targetPlayerId = c.req.param('targetPlayerId');
  try {
    const status = await friendService.checkFriendStatus(c.env.DB, playerId, targetPlayerId);
    return c.json(status);
  } catch (err: unknown) {
    return c.json(
      { error: '检测结交关系失败: ' + (err instanceof Error ? err.message : String(err)) },
      500
    );
  }
});

/**
 * 4. 发送结交申请
 * POST /api/friends/request
 */
friendRoutes.post('/request', async (c) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '请先登录后再发送结交名帖' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = SendFriendRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '结交请求参数不合法', details: parsed.error.issues }, 400);
  }

  try {
    const result = await friendService.sendFriendRequest(
      c.env.DB,
      c.env,
      playerId,
      parsed.data.targetPlayerId,
      parsed.data.message
    );
    return c.json(result);
  } catch (err: unknown) {
    return c.json(
      { success: false, message: err instanceof Error ? err.message : '发送结交信帖异常' },
      400
    );
  }
});

/**
 * 5. 同意结交申请 (添加为好友)
 * POST /api/friends/accept
 */
friendRoutes.post('/accept', async (c) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '请先登录后再应允结交' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = HandleFriendRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '应诺参数不合法' }, 400);
  }

  try {
    const result = await friendService.acceptFriendRequest(c.env.DB, c.env, playerId, {
      requestId: parsed.data.requestId,
      senderId: parsed.data.senderId,
      mailId: parsed.data.mailId,
    });
    return c.json(result);
  } catch (err: unknown) {
    return c.json(
      { success: false, message: err instanceof Error ? err.message : '应允结交异常' },
      400
    );
  }
});

/**
 * 6. 婉言谢绝结交申请
 * POST /api/friends/reject
 */
friendRoutes.post('/reject', async (c) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '请先登录' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = HandleFriendRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '谢绝参数不合法' }, 400);
  }

  try {
    const result = await friendService.rejectFriendRequest(c.env.DB, playerId, {
      requestId: parsed.data.requestId,
      senderId: parsed.data.senderId,
      mailId: parsed.data.mailId,
    });
    return c.json(result);
  } catch (err: unknown) {
    return c.json(
      { success: false, message: err instanceof Error ? err.message : '谢绝结交异常' },
      400
    );
  }
});

/**
 * 7. 解除仙友羁绊
 * DELETE /api/friends/:friendId
 */
friendRoutes.delete('/:friendId', async (c) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '请先登录' }, 401);
  }

  const friendId = c.req.param('friendId');
  try {
    const result = await friendService.removeFriend(c.env.DB, playerId, friendId);
    return c.json(result);
  } catch (err: unknown) {
    return c.json(
      { success: false, message: err instanceof Error ? err.message : '解除仙友失败' },
      400
    );
  }
});

/**
 * 8. 寻访同道修士
 * GET /api/friends/search?q=...
 */
friendRoutes.get('/search', async (c) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '请先登录' }, 401);
  }

  const keyword = c.req.query('q') || '';
  if (!keyword.trim()) {
    return c.json({ players: [] });
  }

  try {
    const players = await friendService.searchPlayers(c.env.DB, playerId, keyword);
    return c.json({ players });
  } catch (err: unknown) {
    return c.json(
      { error: '寻访修士异常: ' + (err instanceof Error ? err.message : String(err)) },
      500
    );
  }
});
