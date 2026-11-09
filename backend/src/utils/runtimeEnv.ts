import type { Env } from '../models/env';

/**
 * 当前 Worker 运行时环境绑定。
 *
 * 说明：
 * - Cloudflare Worker 同一 isolate 内所有请求共享同一组 env 绑定；
 * - 经验服务可能被 HTTP 路由、Durable Object、队列消费者等多个入口调用，
 *   为避免把 Env 逐层透传到所有业务函数，这里保存一份 isolate 级引用；
 * - 该引用只用于"事件落库后尽力推送 WebSocket 通知"这类非关键路径，
 *   核心邮件奖励始终通过 D1 持久化，不依赖此引用。
 */
let runtimeEnv: Env | null = null;

export function bindRuntimeEnv(env: Env | null | undefined): void {
  runtimeEnv = env || null;
}

export function getRuntimeEnv(): Env | null {
  return runtimeEnv;
}
