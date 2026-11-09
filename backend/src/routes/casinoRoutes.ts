import { Hono } from 'hono';
import { Env } from '../models/env';
import { CasinoBetActionSchema } from '../models/schemas';
import { extractAuthPayload } from './authRoutes';
import { requireDb } from '../middleware/dbMiddleware';
import { casinoService } from '../services/casinoService';

export const casinoRoutes = new Hono<{ Bindings: Env }>();

casinoRoutes.use('*', requireDb);

/**
 * 获取赌场当前期数盘面状态
 * GET /api/casino/status
 */
casinoRoutes.get('/status', async (c) => {
  const res = await casinoService.getStatus(c.env);
  return new Response(res.body, res);
});

/**
 * 玩家下注
 * POST /api/casino/bet
 */
casinoRoutes.post('/bet', async (c) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '请先登录后再于玲珑坊下注' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = CasinoBetActionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '下注参数有误', details: parsed.error.issues }, 400);
  }

  const res = await casinoService.placeBet(
    c.env,
    playerId,
    parsed.data.betType,
    parsed.data.betAmount
  );
  return new Response(res.body, res);
});
