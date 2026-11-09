import { Env } from '../models/env';

/**
 * 世界传音状态对象 (WorldChatDO)
 * 维护全服千里传音的跨场景会话广播与历史暂存
 */
export class WorldChatDO implements DurableObject {
  state: DurableObjectState;
  env: Env;
  subscribers: Set<WebSocket> = new Set();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      server.accept();
      this.subscribers.add(server);

      server.addEventListener('message', async (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.text) {
            this.broadcast(msg);
          }
        } catch {
          // 忽略畸变格式
        }
      });

      const cleanup = () => this.subscribers.delete(server);
      server.addEventListener('close', cleanup);
      server.addEventListener('error', cleanup);

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('WorldChatDO Active', { status: 200 });
  }

  private broadcast(message: Record<string, unknown>) {
    const data = JSON.stringify({
      ...message,
      timestamp: Date.now(),
    });

    for (const ws of this.subscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }
}
