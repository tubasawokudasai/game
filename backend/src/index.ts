import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { swaggerUI } from '@hono/swagger-ui';
import { Env } from './models/env';
import { openApiSpec } from './docs/openapiSpec';

// 路由模块导入
import { authRoutes } from './routes/authRoutes';
import { playerRoutes } from './routes/playerRoutes';
import { mapRoutes } from './routes/mapRoutes';
import { npcRoutes } from './routes/npcRoutes';
import { combatRoutes } from './routes/combatRoutes';
import { mailRoutes } from './routes/mailRoutes';
import { casinoRoutes } from './routes/casinoRoutes';
import { aiToolsRoutes } from './routes/aiToolsRoutes';
import { travelRoutes } from './routes/travel';
import { adminRoutes } from './routes/adminRoutes';
import { adminGrantRoutes } from './routes/adminGrantRoutes';
import { adminNotificationRoutes } from './routes/adminNotificationRoutes';
import { friendRoutes } from './routes/friendRoutes';
import { pharmacyRoutes } from './routes/pharmacyRoutes';
import { processLevelUpEvents } from './services/levelUpNotificationService';
import { bindRuntimeEnv } from './utils/runtimeEnv';

// 导出 Durable Objects 类供 Cloudflare 运行时识别绑定
export { ZoneDO, ZoneDO as MapDO } from './durable_objects/ZoneDO';
export { CasinoDO } from './durable_objects/CasinoDO';
export { WorldChatDO } from './durable_objects/WorldChatDO';

const app = new Hono<{ Bindings: Env }>();

// 0. 绑定当前 isolate 的运行时 Env，供经验服务等深层业务做非关键路径推送
app.use('*', async (c, next) => {
  bindRuntimeEnv(c.env);
  await next();
});

// 1. 全局 CORS 跨域支持
app.use(
  '*',
  cors({
    origin: (origin) => origin || '*',
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'Upgrade'],
  })
);

// 2. 根探测入口与文档
app.get('/', (c) => {
  return c.text('九州仙途 Serverless 游戏引擎已启动运行！接口文档请访问 /ui 或 /doc 查看。');
});

// 2.1 OpenAPI 规范与 Swagger UI
app.get('/doc', (c) => c.json(openApiSpec));
app.get('/ui', swaggerUI({ url: '/doc' }));

// 3. 挂载 HTTP API 路由
app.route('/api/auth', authRoutes);
app.route('/api/player', playerRoutes);
app.route('/api/map', mapRoutes);
app.route('/api/npc', npcRoutes);
app.route('/api/combat', combatRoutes);
app.route('/api/mails', mailRoutes);
app.route('/api/friends', friendRoutes);
app.route('/api/casino', casinoRoutes);
app.route('/api/ai', aiToolsRoutes);
app.route('/api/travel', travelRoutes);
// 后台子路由优先于 admin 主路由挂载，避免 /api/admin 前缀先行匹配
app.route('/api/admin/grants', adminGrantRoutes);
app.route('/api/admin/notifications', adminNotificationRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/pharmacy', pharmacyRoutes);

// 4. WebSocket 网关代理：全局统一场景会话 (基于单一 global_scene DO 统管所有 areaId)
const handleZoneWs = async (c: any) => {
  const doNamespace = c.env.ZONE_DO || c.env.MAP_DO;
  // 全局唯一单例，不受宏观大区切割限制，所有玩家基于同一个 DO 路由
  const doId = doNamespace.idFromName('global_game_world');
  const zoneStub = doNamespace.get(doId);

  return zoneStub.fetch(c.req.raw);
};

app.get('/api/ws/zone', handleZoneWs);
app.get('/api/ws/map', handleZoneWs);

// 5. WebSocket 网关代理：转发至世界传音 WorldChatDO
app.get('/api/ws/chat', async (c) => {
  const doId = c.env.WORLD_CHAT_DO.idFromName('global_world_chat');
  const chatStub = c.env.WORLD_CHAT_DO.get(doId);

  return chatStub.fetch(c.req.raw);
});

// 全局统一错误兜底
app.onError((err, c) => {
  console.error('[App Error]', err);
  return c.json({ error: err.message || '服务器内部错误' }, 500);
});

// 6. Cloudflare Queues 异步队列消费者 (处理重型结算战报与 AI 事件流水)
export default {
  fetch: app.fetch,

  async queue(batch: MessageBatch<any>, env: Env): Promise<void> {
    // 队列消费者在独立执行上下文中运行，重新绑定 Env 供通知推送使用
    bindRuntimeEnv(env);
    console.log(`[Queue] 收到异步事件批次: ${batch.messages.length} 条`);

    for (const msg of batch.messages) {
      try {
        const body = msg.body as any;

        // 玩家升级通知：Outbox 事件重试（邮件幂等，可安全重复消费）
        if (body?.type === 'PLAYER_LEVEL_UP' && Array.isArray(body.eventIds)) {
          await processLevelUpEvents(env.DB, body.eventIds, {
            env,
            throwOnError: true,
          });
          msg.ack();
          continue;
        }

        console.log('[Queue] 异步消费事件:', msg.body);
        msg.ack();
      } catch (err) {
        console.error('[Queue] 消费失败:', err);
        msg.retry();
      }
    }
  },
};
