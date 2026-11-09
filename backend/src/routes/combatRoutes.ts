import { Hono } from 'hono';
import { Env } from '../models/env';
import { extractAuthPayload } from './authRoutes';
import { requireDb } from '../middleware/dbMiddleware';
import { combatService } from '../services/combatService';

export const combatRoutes = new Hono<{ Bindings: Env }>();

combatRoutes.use('*', requireDb);

/**
 * 战前准备：按当前玩家的出战队伍与怪物组模版组装双方阵容
 * POST /api/combat/prepare
 */
combatRoutes.post('/prepare', async (c) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '请先登录后再入阵迎敌' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const monsterGroupId = typeof body.monsterGroupId === 'string' ? body.monsterGroupId.trim() : '';
  if (!monsterGroupId) {
    return c.json({ error: '缺少怪物组标识 monsterGroupId' }, 400);
  }

  try {
    const prepared = await combatService.prepareCombat(c.env.DB, playerId, monsterGroupId);
    return c.json(prepared);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '战前准备失败';
    return c.json({ error: msg }, 400);
  }
});

/**
 * 战斗结算：服务端按真实阵容跑完整场对决，落库并返回胜负与后续剧情节点
 * POST /api/combat/settle
 */
combatRoutes.post('/settle', async (c) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '请先登录后再结算战斗' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const monsterGroupId = typeof body.monsterGroupId === 'string' ? body.monsterGroupId.trim() : '';
  if (!monsterGroupId) {
    return c.json({ error: '缺少怪物组标识 monsterGroupId' }, 400);
  }

  try {
    const settled = await combatService.settleCombat(
      c.env.DB,
      playerId,
      monsterGroupId,
      typeof body.winNodeId === 'string' ? body.winNodeId : undefined,
      typeof body.loseNodeId === 'string' ? body.loseNodeId : undefined
    );
    return c.json(settled);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '战斗结算失败';
    return c.json({ error: msg }, 400);
  }
});

/**
 * 地图 NPC 野怪遭遇战前准备
 * POST /api/combat/encounter/prepare
 */
combatRoutes.post('/encounter/prepare', async (c) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '请先登录后再入阵迎敌' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const npcId = typeof body.npcId === 'string' ? body.npcId.trim() : '';
  if (!npcId) {
    return c.json({ error: '缺少强敌标识 npcId' }, 400);
  }

  try {
    const prepared = await combatService.prepareEncounterCombat(c.env.DB, playerId, npcId);
    return c.json(prepared);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '遭遇战准备失败';
    return c.json({ error: msg }, 400);
  }
});

/**
 * 地图 NPC 野怪直战结算
 * POST /api/combat/encounter/settle
 */
combatRoutes.post('/encounter/settle', async (c) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '请先登录后再结算遭遇战' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const npcId = typeof body.npcId === 'string' ? body.npcId.trim() : '';
  if (!npcId) {
    return c.json({ error: '缺少强敌标识 npcId' }, 400);
  }

  try {
    const settled = await combatService.settleEncounterCombat(c.env.DB, playerId, npcId);
    return c.json(settled);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '遭遇战结算失败';
    return c.json({ error: msg }, 400);
  }
});
