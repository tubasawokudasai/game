import { Env } from '../models/env';
import {
  MessageType,
  WsMessage,
  createWsMessage,
  CombatAction,
  CombatDamagePayload,
  NoticeAction,
  NoticePayload,
  MailAction,
  MailNewPayload,
  MapAction,
  MapSyncPayload,
  ChatAction,
  ChatBroadcastPayload,
  PlayerSyncPayload,
} from '../models/ws';

/**
 * WebSocket 连接元数据 (Cloudflare DO serializeAttachment 载荷)
 */
export interface WsAttachment {
  playerId: string;
  isAiAgent: boolean;
  coordX: number;
  coordY: number;
  joinedAt: number;
  lastActive: number;
}

export interface ConnectedSession {
  ws: WebSocket;
  playerId: string;
  isAiAgent: boolean;
  coordX: number;
  coordY: number;
  joinedAt: number;
  lastActive: number;
}

/**
 * 消息分发上下文
 */
export interface MessageHandlerContext {
  ws: WebSocket;
  attachment: WsAttachment;
  mapDO: MapDO;
}

export type MessageHandler<T = any> = (
  message: WsMessage<T>,
  ctx: MessageHandlerContext
) => Promise<void> | void;

/**
 * 消息路由分发器 (MessageDispatcher)
 * 取代传统巨型 switch-case，支持模块级 (type) 与指令级 (type + action) 的解耦注册与执行
 */
export class MessageDispatcher {
  private typeHandlers = new Map<string, MessageHandler>();
  private actionHandlers = new Map<string, MessageHandler>();
  private defaultHandler?: MessageHandler;

  /**
   * 注册指定 MessageType 的模块处理器
   */
  public register<T = any>(type: MessageType | string, handler: MessageHandler<T>): this {
    this.typeHandlers.set(type, handler);
    return this;
  }

  /**
   * 注册细粒度的子指令处理器 (type + action)
   */
  public registerAction<T = any>(
    type: MessageType | string,
    action: string,
    handler: MessageHandler<T>
  ): this {
    this.actionHandlers.set(`${type}:${action}`, handler);
    return this;
  }

  /**
   * 设置缺省处理器
   */
  public setDefault(handler: MessageHandler): this {
    this.defaultHandler = handler;
    return this;
  }

  /**
   * 调度并分发消息
   */
  public async dispatch(message: WsMessage<any>, ctx: MessageHandlerContext): Promise<void> {
    const actionKey = `${message.type}:${message.action}`;
    const actionHandler = this.actionHandlers.get(actionKey);

    if (actionHandler) {
      await actionHandler(message, ctx);
      return;
    }

    const typeHandler = this.typeHandlers.get(message.type);
    if (typeHandler) {
      await typeHandler(message, ctx);
      return;
    }

    if (this.defaultHandler) {
      await this.defaultHandler(message, ctx);
    } else {
      console.warn(`[MessageDispatcher] 未配置消息处理器: type=${message.type}, action=${message.action}`);
    }
  }
}

/**
 * 地图场景状态对象 (MapDO)
 *
 * 核心特性：
 * 1. 精准身份绑定：在握手升级阶段，使用 ws.serializeAttachment({ playerId, ... }) 将玩家信息直接绑定在长连接上。
 * 2. 消息路由层：使用 MessageDispatcher 彻底剔除巨型 switch-case，实现清晰的业务分发。
 * 3. 广播与精准私发：实现 broadcast(message) 全图广播 与 sendTo(playerId, message) 点对点私发。
 * 4. AI 智能体观测流：同时支持普通人类玩家报文与高密度 AI 环境感知 JSON 流。
 */
export class MapDO implements DurableObject {
  state: DurableObjectState;
  env: Env;
  mapId: string = 'square';
  dispatcher: MessageDispatcher;

  // 内存会话缓存 (sessionId -> ConnectedSession)
  private sessions: Map<string, ConnectedSession> = new Map();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.dispatcher = new MessageDispatcher();
    this.initDispatcher();
  }

  /**
   * 初始化注册各业务模块处理器，杜绝 switch-case
   */
  private initDispatcher() {
    // 1. 聊天模块处理
    this.dispatcher.register<ChatBroadcastPayload>(MessageType.CHAT, (msg, ctx) =>
      this.handleChatMessage(msg, ctx)
    );

    // 2. 地图移动与同步模块
    this.dispatcher.register(MessageType.MAP, (msg, ctx) =>
      this.handleMapMessage(msg, ctx)
    );

    // 3. 战斗系统模块 (飘字、受击、技能)
    this.dispatcher.register<CombatDamagePayload>(MessageType.COMBAT, (msg, ctx) =>
      this.handleCombatMessage(msg, ctx)
    );

    // 4. 系统通知模块 (跑马灯、广播)
    this.dispatcher.register<NoticePayload>(MessageType.NOTICE, (msg, ctx) =>
      this.handleNoticeMessage(msg, ctx)
    );

    // 5. 邮件系统模块 (点对点私信、新邮件推送)
    this.dispatcher.register<MailNewPayload>(MessageType.MAIL, (msg, ctx) =>
      this.handleMailMessage(msg, ctx)
    );

    // 6. AI 专属模块 (观测流订阅)
    this.dispatcher.register(MessageType.AI, (msg, ctx) =>
      this.handleAiMessage(msg, ctx)
    );

    // 缺省兜底处理器
    this.dispatcher.setDefault((msg, ctx) => {
      console.warn(`[MapDO] 收到未处理的指令 [${msg.type}:${msg.action}] 来自 ${ctx.attachment.playerId}`);
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // 1. WebSocket 协议升级入口
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      const playerId =
        url.searchParams.get('playerId') ||
        String(Math.floor(100000 + Math.random() * 900000));
      const isAiAgent = url.searchParams.get('agent') === 'true' || url.searchParams.get('isAgent') === 'true';
      this.mapId = url.searchParams.get('mapId') || this.mapId;

      await this.handleSession(server, playerId, isAiAgent);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    // 2. HTTP RPC: 点对点私发接口 (供外部 Worker / 邮件服务直接调用)
    if (url.pathname.endsWith('/sendTo') && request.method === 'POST') {
      const body = await request.json<{ playerId: string; message: WsMessage<any> }>();
      const delivered = this.sendTo(body.playerId, body.message);
      return Response.json({ success: true, delivered });
    }

    // 3. HTTP RPC: 全地图广播接口
    if (url.pathname.endsWith('/broadcast') && request.method === 'POST') {
      const body = await request.json<{ message: WsMessage<any> }>();
      this.broadcast(body.message);
      return Response.json({ success: true });
    }

    // 4. HTTP API: 获取当前地图状态与在线统计
    if (url.pathname.endsWith('/status')) {
      const activeSessions = Array.from(this.sessions.values()).filter(
        (s) => s.ws.readyState === WebSocket.OPEN
      );

      return Response.json({
        mapId: this.mapId,
        onlineCount: activeSessions.length,
        humansCount: activeSessions.filter((s) => !s.isAiAgent).length,
        agentsCount: activeSessions.filter((s) => s.isAiAgent).length,
        onlinePlayerIds: activeSessions.map((s) => s.playerId),
      });
    }

    return new Response('MapDO Active', { status: 200 });
  }

  /**
   * 处理 WebSocket 连接生命周期与精准绑定
   */
  async handleSession(ws: WebSocket, playerId: string, isAiAgent: boolean) {
    ws.accept();

    // 核心设计：精准身份绑定，将修仙者身份与位置写入 WebSocket Attachment
    const attachment: WsAttachment = {
      playerId,
      isAiAgent,
      coordX: 128,
      coordY: 256,
      joinedAt: Date.now(),
      lastActive: Date.now(),
    };
    try {
      ws.serializeAttachment(attachment);
    } catch {
      // 容错处理
    }

    const sessionId = `${playerId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const session: ConnectedSession = {
      ws,
      playerId,
      isAiAgent,
      coordX: 128,
      coordY: 256,
      joinedAt: Date.now(),
      lastActive: Date.now(),
    };
    this.sessions.set(sessionId, session);

    // 广播场景在线人数变更
    this.broadcastSceneSync();

    // 监听客户端上行消息
    ws.addEventListener('message', async (event) => {
      try {
        const rawText =
          typeof event.data === 'string'
            ? event.data
            : new TextDecoder().decode(event.data as ArrayBuffer);
        const data = JSON.parse(rawText);

        session.lastActive = Date.now();
        const currentAttachment = (ws.deserializeAttachment?.() as WsAttachment) || attachment;
        currentAttachment.lastActive = Date.now();
        try {
          ws.serializeAttachment(currentAttachment);
        } catch {
          // 容错
        }

        // 统一规整为 WsMessage 协议格式 (兼容遗留上行报文)
        const normalizedMsg = this.normalizeIncomingMessage(data);

        // 调用 MessageDispatcher 进行解耦路由分发
        await this.dispatcher.dispatch(normalizedMsg, {
          ws,
          attachment: currentAttachment,
          mapDO: this,
        });
      } catch (err) {
        console.error('[MapDO] 消息解析或调度异常:', err);
        ws.send(
          JSON.stringify(
            createWsMessage(MessageType.SYSTEM, 'ERROR', {
              error: '无效的消息报文或调度失败',
              details: err instanceof Error ? err.message : String(err),
            })
          )
        );
      }
    });

    const closeHandler = () => {
      this.sessions.delete(sessionId);
      this.broadcastSceneSync();
    };

    ws.addEventListener('close', closeHandler);
    ws.addEventListener('error', closeHandler);
  }

  /**
   * 全地图广播辅助函数
   * @param message 统一消息报文
   * @param filter 可选过滤器，例如只广播给人类玩家或指定范围
   */
  broadcast(
    message: WsMessage<any> | Record<string, unknown>,
    filter?: (attachment: WsAttachment | null, ws: WebSocket) => boolean
  ): void {
    const payloadStr = typeof message === 'string' ? message : JSON.stringify(message);

    for (const session of this.sessions.values()) {
      if (session.ws.readyState === WebSocket.OPEN) {
        const att: WsAttachment = {
          playerId: session.playerId,
          isAiAgent: session.isAiAgent,
          coordX: session.coordX,
          coordY: session.coordY,
          joinedAt: session.joinedAt,
          lastActive: session.lastActive,
        };
        if (!filter || filter(att, session.ws)) {
          try {
            session.ws.send(payloadStr);
          } catch (e) {
            console.warn('[MapDO] 广播发送异常:', e);
          }
        }
      }
    }
  }

  /**
   * 点对点私发辅助函数 (精准推送)
   * 支持指定目标 playerId、或通配符 '*' / 'all' 进行全场景送达
   * @param playerId 目标玩家 ID 或 '*'
   * @param message 统一消息报文
   * @returns 是否成功投递给至少一个活跃长连接
   */
  sendTo(playerId: string, message: WsMessage<any> | Record<string, unknown>): boolean {
    const payloadStr = typeof message === 'string' ? message : JSON.stringify(message);
    let delivered = false;

    // 1. 优先从内存 sessions 检索，双重匹配 playerId 与 attachment
    for (const session of this.sessions.values()) {
      if (session.ws.readyState === WebSocket.OPEN) {
        const att = session.ws.deserializeAttachment?.() as WsAttachment | null;
        const isMatch =
          playerId === '*' ||
          playerId === 'all' ||
          session.playerId === playerId ||
          att?.playerId === playerId;

        if (isMatch) {
          try {
            session.ws.send(payloadStr);
            delivered = true;
          } catch (e) {
            console.warn(`[MapDO] 私发玩家 ${playerId} 异常:`, e);
          }
        }
      }
    }

    // 2. 补充检查 Cloudflare DO Hibernation state.getWebSockets
    if (typeof this.state.getWebSockets === 'function') {
      try {
        const doSockets = this.state.getWebSockets();
        for (const ws of doSockets) {
          if (ws.readyState === WebSocket.OPEN) {
            const att = ws.deserializeAttachment?.() as WsAttachment | null;
            if (att && (playerId === '*' || playerId === 'all' || att.playerId === playerId)) {
              try {
                ws.send(payloadStr);
                delivered = true;
              } catch (e) {
                console.warn('[MapDO] Hibernation socket 私发异常:', e);
              }
            }
          }
        }
      } catch {
        // 忽略
      }
    }

    return delivered;
  }

  /**
   * 获取当前活跃的 WebSocket 集合 (结合 DO state 与本地 sessions 缓存)
   */
  private getActiveSockets(): WebSocket[] {
    if (typeof this.state.getWebSockets === 'function') {
      try {
        const doSockets = this.state.getWebSockets();
        if (doSockets && doSockets.length > 0) {
          return doSockets;
        }
      } catch {
        // 忽略
      }
    }
    return Array.from(this.sessions.values())
      .map((s) => s.ws)
      .filter((ws) => ws.readyState === WebSocket.OPEN);
  }

  /**
   * 规整外部上行报文为规范的 WsMessage
   */
  private normalizeIncomingMessage(data: any): WsMessage<any> {
    if (data && data.type && data.action) {
      return {
        type: data.type,
        action: data.action,
        payload: data.payload ?? data,
        timestamp: data.timestamp || Date.now(),
      };
    }

    // 兼容历史老格式: { action: 'CHAT', content: '...' }
    if (data && data.action) {
      switch (data.action) {
        case 'CHAT':
          return createWsMessage(MessageType.CHAT, ChatAction.CHAT_SEND, {
            text: data.content || data.text,
            channel: data.channel || 'local',
          });
        case 'CHECK_IN':
        case 'MOVE':
          return createWsMessage(MessageType.MAP, MapAction.MOVE, {
            coordX: data.coordX,
            coordY: data.coordY,
          });
        case 'SUBSCRIBE_AI_STREAM':
          return createWsMessage(MessageType.AI, 'SUBSCRIBE_AI_STREAM', {});
        default:
          return {
            type: MessageType.SYSTEM,
            action: data.action,
            payload: data,
            timestamp: Date.now(),
          };
      }
    }

    return {
      type: MessageType.SYSTEM,
      action: 'UNKNOWN',
      payload: data,
      timestamp: Date.now(),
    };
  }

  // ================= 具体的 Handler 业务实现 =================

  /**
   * 聊天消息处理：向人类广播富 UI 报文，向 AI 发送精炼环境感知流
   */
  private async handleChatMessage(
    message: WsMessage<any>,
    ctx: MessageHandlerContext
  ) {
    const text = message.payload?.text || message.payload?.content;
    const channel = message.payload?.channel || 'local';
    if (!text || !text.trim()) return;

    const sender = ctx.attachment;
    // 显示名与境界只取自上行报文；缺失时仅使用通用匿名道号，绝不写死具体角色
    const speakerName =
      message.payload?.senderName || `修士_${sender.playerId.slice(0, 4)}`;
    const speakerRealm = message.payload?.senderRealm;

    // 1. 人类玩家标准 WsMessage 广播
    const clientMsg = createWsMessage<ChatBroadcastPayload>(
      MessageType.CHAT,
      ChatAction.CHAT_BROADCAST,
      {
        id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        channel,
        senderId: sender.playerId,
        senderName: speakerName,
        text: text.trim(),
        timestamp: Date.now(),
      }
    );

    // 2. AI 智能体专属高密度感知流
    const aiContextStream = JSON.stringify({
      stream_type: 'llm_scene_observation',
      event: 'player_speech',
      scene: this.mapId,
      speaker: {
        id: sender.playerId,
        name: speakerName,
        realm: speakerRealm,
        coordinates: [sender.coordX, sender.coordY],
      },
      content: text.trim(),
      channel,
      timestamp: Date.now(),
    });

    // 分流广播
    const sockets = this.getActiveSockets();
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        const att = ws.deserializeAttachment() as WsAttachment | null;
        if (att?.isAiAgent) {
          ws.send(aiContextStream);
        } else {
          ws.send(JSON.stringify(clientMsg));
        }
      }
    }
  }

  /**
   * 地图移动处理
   */
  private async handleMapMessage(
    message: WsMessage<any>,
    ctx: MessageHandlerContext
  ) {
    const sender = ctx.attachment;
    const newX = Number(message.payload?.coordX ?? message.payload?.coords?.[0]);
    const newY = Number(message.payload?.coordY ?? message.payload?.coords?.[1]);

    if (!isNaN(newX) && !isNaN(newY)) {
      sender.coordX = newX;
      sender.coordY = newY;
      ctx.ws.serializeAttachment(sender);
    }

    // 广播移动同步报文
    const moveMsg = createWsMessage(MessageType.MAP, MapAction.PLAYER_MOVED, {
      playerId: sender.playerId,
      coords: [sender.coordX, sender.coordY],
    });

    // 针对 AI 广播环境感知移动事件
    const aiMoveStream = JSON.stringify({
      stream_type: 'llm_scene_observation',
      event: 'player_movement',
      scene: this.mapId,
      player_id: sender.playerId,
      new_coordinates: [sender.coordX, sender.coordY],
      timestamp: Date.now(),
    });

    const sockets = this.getActiveSockets();
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        const att = ws.deserializeAttachment() as WsAttachment | null;
        if (att?.isAiAgent) {
          ws.send(aiMoveStream);
        } else {
          ws.send(JSON.stringify(moveMsg));
        }
      }
    }
  }

  /**
   * 战斗事件处理 (如技能释放、伤害飘字计算、广播战况)
   */
  private async handleCombatMessage(
    message: WsMessage<CombatDamagePayload>,
    ctx: MessageHandlerContext
  ) {
    const payload = message.payload;
    if (!payload) return;

    // 构造战斗伤害/效果标准消息
    const combatMsg = createWsMessage<CombatDamagePayload>(
      MessageType.COMBAT,
      message.action || CombatAction.COMBAT_DAMAGE,
      {
        attackerId: payload.attackerId || ctx.attachment.playerId,
        attackerName: payload.attackerName || '未知修士',
        targetId: payload.targetId,
        targetName: payload.targetName,
        damage: payload.damage || 0,
        isCrit: Boolean(payload.isCrit),
        skillName: payload.skillName,
        remainingHp: payload.remainingHp,
      }
    );

    // 场景全图广播战斗动向，使所有在场修仙者视口可见飘字
    this.broadcast(combatMsg);

    // 若受到致命伤害或重击，精准私发给被击中者专属警示
    if (payload.targetId) {
      this.sendTo(
        payload.targetId,
        createWsMessage(MessageType.NOTICE, NoticeAction.TOAST, {
          content: `你受到了来自【${payload.attackerName || '敌方'}】的 ${payload.damage} 点伤害！`,
          level: 'warning',
        })
      );
    }
  }

  /**
   * 系统通知与跑马灯处理
   */
  private async handleNoticeMessage(
    message: WsMessage<NoticePayload>,
    _ctx: MessageHandlerContext
  ) {
    // 全场景广播系统公告
    this.broadcast(message);
  }

  /**
   * 邮件模块消息处理 (精准私发通知)
   */
  private async handleMailMessage(
    message: WsMessage<MailNewPayload>,
    _ctx: MessageHandlerContext
  ) {
    const targetPlayerId = (message.payload as any)?.receiverId || (message.payload as any)?.targetPlayerId;

    if (targetPlayerId) {
      // 精准私发给该玩家
      this.sendTo(targetPlayerId, message);
    } else {
      // 缺省全图广播邮件统计同步
      this.broadcast(message);
    }
  }

  /**
   * AI 订阅流处理
   */
  private async handleAiMessage(
    _message: WsMessage<any>,
    ctx: MessageHandlerContext
  ) {
    ctx.attachment.isAiAgent = true;
    ctx.ws.serializeAttachment(ctx.attachment);

    ctx.ws.send(
      JSON.stringify(
        createWsMessage(MessageType.AI, 'AI_SUBSCRIPTION_SUCCESS', {
          mapId: this.mapId,
          message: 'AI环境观测极简流已激活，实时接收结构化环境感知数据。',
        })
      )
    );
  }

  /**
   * 场景人数同步广播
   */
  private broadcastSceneSync() {
    const sockets = this.getActiveSockets();
    const attachments = sockets.map((ws) => ws.deserializeAttachment() as WsAttachment | null);

    const syncMsg = createWsMessage<MapSyncPayload>(
      MessageType.MAP,
      MapAction.MAP_SYNC,
      {
        mapId: this.mapId,
        onlineCount: sockets.length,
        humansCount: attachments.filter((a) => a && !a.isAiAgent).length,
        agentsCount: attachments.filter((a) => a && a.isAiAgent).length,
      }
    );

    this.broadcast(syncMsg);
  }
}
