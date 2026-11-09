import { Hono } from 'hono';
import { Env } from '../models/env';
import { LLM_GAME_TOOLS_METADATA } from '../models/schemas';

export const aiToolsRoutes = new Hono<{ Bindings: Env }>();

/**
 * 导出面向大模型 (LLM) Function Calling 的工具元数据清单
 * GET /api/ai/tools
 */
aiToolsRoutes.get('/tools', (c) => {
  return c.json({
    description: '九州修仙世界 AI Agent 交互工具清单',
    version: '1.0.0',
    tools: LLM_GAME_TOOLS_METADATA,
  });
});
