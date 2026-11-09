import { Hono } from 'hono';
import { Env } from '../models/env';
import { extractAuthPayload } from './authRoutes';
import { requireDb } from '../middleware/dbMiddleware';
import { travelService, TravelError } from '../services/travelService';

export const travelRoutes = new Hono<{ Bindings: Env }>();

travelRoutes.use('*', requireDb);

/**
 * 跨城/跨州传送接口
 * POST /api/travel/teleport
 */
travelRoutes.post('/teleport', async (c) => {
  const authPayload = await extractAuthPayload(c);
  if (!authPayload?.sub) {
    return c.json({ error: '请先登录后再启用跨州神行大阵' }, 401);
  }

  const body = await c.req.json<{
    targetZoneId: string;
    targetAreaId?: string;
  }>().catch(() => ({}) as any);

  const targetKey =
    typeof body.targetZoneId === 'string' ? body.targetZoneId.trim().toLowerCase() : '';
  if (!targetKey) {
    return c.json({ error: '请指明要前往的场景或州域标识' }, 400);
  }

  try {
    const res = await travelService.teleport(c.env.DB, authPayload.sub, targetKey, body.targetAreaId);
    return c.json(res);
  } catch (err) {
    if (err instanceof TravelError) {
      return c.json({ error: err.message }, err.status as any);
    }
    throw err;
  }
});
