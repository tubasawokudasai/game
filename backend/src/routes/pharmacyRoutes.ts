import { Hono } from 'hono';
import { Env } from '../models/env';
import { extractAuthPayload } from './authRoutes';
import { pharmacyService } from '../services/pharmacyService';
import { requireDb } from '../middleware/dbMiddleware';

export const pharmacyRoutes = new Hono<{ Bindings: Env }>();

pharmacyRoutes.use('*', requireDb);

/**
 * 悬壶馆全貌信息接口
 * GET /api/pharmacy/info
 */
pharmacyRoutes.get('/info', async (c) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '请先登录后再步入悬壶馆' }, 401);
  }

  try {
    const info = await pharmacyService.getInfo(c.env.DB, playerId);
    return c.json(info);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : '获取悬壶馆信息失败' }, 400);
  }
});

/**
 * 药王孙真人 · 全队回春疗伤
 * POST /api/pharmacy/heal
 */
pharmacyRoutes.post('/heal', async (c) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '请先登录后再请药王医治' }, 401);
  }

  try {
    const result = await pharmacyService.healParty(c.env.DB, playerId);
    return c.json(result);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : '回春疗伤失败' }, 400);
  }
});

/**
 * 悬壶药阁 · 购药
 * POST /api/pharmacy/buy
 * Body: { itemId: string, count?: number }
 */
pharmacyRoutes.post('/buy', async (c) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '请先登录后再选购丹药' }, 401);
  }

  const body = await c.req.json<{ itemId?: string; count?: number }>().catch(
    () => ({} as { itemId?: string; count?: number })
  );
  if (!body.itemId) {
    return c.json({ error: '请指明欲选购的药丹品类' }, 400);
  }

  try {
    const result = await pharmacyService.buyMedicine(
      c.env.DB,
      playerId,
      body.itemId,
      body.count ?? 1
    );
    return c.json(result);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : '选购丹药失败' }, 400);
  }
});

/**
 * 神农药鼎 · 丹药炼制
 * POST /api/pharmacy/craft
 * Body: { recipeId: string, count?: number }
 */
pharmacyRoutes.post('/craft', async (c) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '请先登录后再开炉炼丹' }, 401);
  }

  const body = await c.req.json<{ recipeId?: string; count?: number }>().catch(
    () => ({} as { recipeId?: string; count?: number })
  );
  if (!body.recipeId) {
    return c.json({ error: '请指定开炉炼制的丹方' }, 400);
  }

  try {
    const result = await pharmacyService.craftMedicine(
      c.env.DB,
      playerId,
      body.recipeId,
      body.count ?? 1
    );
    return c.json(result);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : '开炉炼制失败' }, 400);
  }
});
