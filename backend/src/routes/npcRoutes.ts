import { Hono } from 'hono';
import { Env } from '../models/env';
import { extractAuthPayload } from './authRoutes';
import { requireDb } from '../middleware/dbMiddleware';
import { dialogueService } from '../services/npc/dialogueService';

export const npcRoutes = new Hono<{ Bindings: Env }>();

npcRoutes.use('*', requireDb);

/**
 * 阶段一：开启 NPC 有向图对话
 * POST /api/npc/dialogue/start
 */
npcRoutes.post('/dialogue/start', async (c) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '神识未定，请先完成仙籍登录' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const npcId = body.npcId || body.npcKey;
  const nodeId = body.nodeId;

  if (!npcId && !nodeId) {
    return c.json({ error: '缺少目标 NPC 标识 (npcId 或 npcKey) 或节点标识 (nodeId)' }, 400);
  }

  try {
    const result = await dialogueService.startDialogue(c.env, playerId, npcId, nodeId);
    return c.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '对话开启失败';
    return c.json({ error: msg }, 400);
  }
});

/**
 * 阶段一·续：无分支直连推进
 * POST /api/npc/dialogue/advance
 */
npcRoutes.post('/dialogue/advance', async (c) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '神识未定，请先完成仙籍登录' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const currentNodeId = String(body.currentNodeId || '').trim();
  if (!currentNodeId) {
    return c.json({ error: '缺少当前对话节点 ID (currentNodeId)' }, 400);
  }

  try {
    const result = await dialogueService.advanceDialogue(c.env, playerId, currentNodeId);
    return c.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '对话推进失败';
    return c.json({ error: msg }, 400);
  }
});

/**
 * 阶段二：选择 NPC 对话选项
 * POST /api/npc/dialogue/select
 */
npcRoutes.post('/dialogue/select', async (c) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '神识未定，请先完成仙籍登录' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const { currentNodeId, optionId } = body;

  if (!currentNodeId || !optionId) {
    return c.json({ error: '缺少当前对话节点 ID (currentNodeId) 或选项 ID (optionId)' }, 400);
  }

  try {
    const result = await dialogueService.selectOption(c.env, playerId, currentNodeId, optionId);
    return c.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '神识抉择执行失败';
    return c.json({ error: msg }, 400);
  }
});
