/**
 * Cloudflare Worker 环境配置与资源绑定定义
 * 与 wrangler.toml 严格对应
 */
export interface Env {
  // 1. Cloudflare D1 关系型数据库绑定 (SQLite at Edge)
  DB: D1Database;

  // 2. Durable Objects 命名空间绑定 (强状态层)
  ZONE_DO: DurableObjectNamespace;
  MAP_DO: DurableObjectNamespace;
  CASINO_DO: DurableObjectNamespace;
  WORLD_CHAT_DO: DurableObjectNamespace;

  // 3. KV 高速键值缓存
  GAME_KV: KVNamespace;

  // 4. Queues 异步消息队列
  GAME_EVENT_QUEUE: Queue;

  // 5. 环境变量
  ENVIRONMENT: string;
  JWT_SECRET: string;
  AI_GATEWAY_URL: string;
  CORS_ORIGIN?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
}
