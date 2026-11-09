import { useEffect, useRef, useCallback, useState } from 'react';
import {
  MessageType,
  WsMessage,
  createWsMessage,
  MailAction,
  MailNewPayload,
  MapAction,
  MapSyncPayload,
  ChatAction,
  ChatBroadcastPayload,
  SceneAction,
} from '../types/ws';
import { usePlayerStore } from '../store/usePlayerStore';
import { useChatStore } from '../store/useChatStore';
import { useMapStore } from '../store/useMapStore';
import { useSceneStore } from '../store/sceneStore';
import { ChatMessage } from '../types/game';

export type WsEventCallback<T = any> = (payload: T, message: WsMessage<T>) => void;

interface ConnectOptions {
  zoneId?: string;
  mapId?: string;
  areaId?: string;
  playerId: string;
}

/**
 * 前端响应式 WebSocket 单例管理器 (WebSocketManager)
 *
 * 核心特性：
 * 1. 单例维护：确保全局仅维持一条活跃的长连接通道，防止 React StrictMode 下重复并联。
 * 2. 状态同步：内置 Zustand Store 自动化双向绑定，如收到 MAIL_NEW 立即响应并点亮红点徽标。
 * 3. 事件总线 (Event Bus)：提供细粒度 Pub/Sub 订阅能力，让独立的战斗、公告、跑马灯等组件实现绝对解耦。
 */
export class WebSocketManager {
  private static instance: WebSocketManager | null = null;
  private ws: WebSocket | null = null;
  private currentAreaId: string | null = null;
  private currentMapId: string | null = null;
  private currentPlayerId: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private isExplicitlyClosed = false;

  // 事件总线注册字典: key -> Set<WsEventCallback>
  // key 可以为 `${type}:${action}` 或 `${type}:*` 或 `*:*`
  private listeners = new Map<string, Set<WsEventCallback>>();
  private statusListeners = new Set<(connected: boolean) => void>();

  private constructor() {
    // 单例模式私有构造器
  }

  private notifyStatus(connected: boolean) {
    this.statusListeners.forEach((cb) => {
      try {
        cb(connected);
      } catch (err) {
        console.error('[WebSocketManager] 状态监听异常:', err);
      }
    });
  }

  public getCurrentAreaId(): string | null {
    return this.currentAreaId;
  }

  public onStatus(callback: (connected: boolean) => void): () => void {
    this.statusListeners.add(callback);
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  public static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  /**
   * 建立/切换 WebSocket 连接 (全服统一单连接，仅基于 areaId 区分当前区域)
   */
  public connect({ mapId, areaId, playerId }: ConnectOptions) {
    if (!playerId) return;

    const resolvedArea = areaId || mapId || 'square';

    // 若当前连接已建立且可用，仅通知服务端切换区域 CHANGE_AREA 即可，无需断开重连
    if (
      this.currentPlayerId === playerId &&
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      if (this.currentAreaId !== resolvedArea) {
        this.currentAreaId = resolvedArea;
        this.currentMapId = resolvedArea;
        this.send({
          type: MessageType.SCENE,
          action: SceneAction.CHANGE_AREA,
          payload: { areaId: resolvedArea },
        });
      }
      return;
    }

    this.currentAreaId = resolvedArea;
    this.currentMapId = resolvedArea;
    this.currentPlayerId = playerId;
    this.isExplicitlyClosed = false;

    // 清理既有连接
    this.cleanupSocket();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws/zone?areaId=${encodeURIComponent(
      resolvedArea
    )}&playerId=${encodeURIComponent(playerId)}`;

    try {
      const socket = new WebSocket(wsUrl);
      this.ws = socket;

      socket.onopen = () => {
        if (this.ws !== socket) return;
        this.reconnectAttempts = 0;
        this.notifyStatus(true);
        console.log(`[WebSocketManager] 成功连通九州天地，区域 [${resolvedArea}]，修仙者 [${playerId}] 已就位`);

        if (typeof window !== 'undefined') {
          (window as any).__myPlayerId = playerId;
          (window as any).__sendTestMail = (title = '测试天道密函', silver = 8888) => {
            return fetch('/api/mails/admin-send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                receiverId: playerId,
                title,
                content: '控制台直接触发的飞鸽传书实时测试！',
                attachedSilver: silver,
              }),
            })
              .then((r) => r.json())
              .then((data) => {
                console.log('[WebSocketManager] 测试发信回执:', data);
                return data;
              });
          };
        }
      };

      socket.onmessage = (event) => {
        if (this.ws !== socket) return;
        try {
          const raw = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
          const rawObj = JSON.parse(raw);

          // 规范化消息结构
          const message: WsMessage<any> = this.normalizeMessage(rawObj);
          console.log(`[WebSocketManager] 收到下行消息 [${message.type}:${message.action}]`, message.payload);

          // 1. 核心状态响应：驱动全局 Zustand Store
          this.syncGlobalStores(message);

          // 2. 触发事件总线广播：通知所有 useWsEvent 订阅者
          this.emit(message);
        } catch (err) {
          console.warn('[WebSocketManager] 接收与分发消息异常:', err);
        }
      };

      socket.onclose = () => {
        if (this.ws !== socket) return;
        this.ws = null;
        this.notifyStatus(false);
        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect();
        }
      };

      socket.onerror = () => {
        if (this.ws !== socket) return;
        if (socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
      };
    } catch (err) {
      console.error('[WebSocketManager] 创建 WebSocket 实例失败:', err);
      this.scheduleReconnect();
    }
  }

  /**
   * 自动指数退避重连机制
   */
  private scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.isExplicitlyClosed || !this.currentMapId || !this.currentPlayerId) {
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 8000) + Math.random() * 500;

    this.reconnectTimer = setTimeout(() => {
      if (!this.isExplicitlyClosed && this.currentMapId && this.currentPlayerId) {
        console.log(`[WebSocketManager] 尝试第 ${this.reconnectAttempts} 次重新归位聚灵连接...`);
        this.connect({
          mapId: this.currentMapId,
          playerId: this.currentPlayerId,
        });
      }
    }, delay);
  }

  /**
   * 将异构或老格式报文规整为标准 WsMessage
   */
  private normalizeMessage(raw: any): WsMessage<any> {
    if (raw && raw.type && raw.action) {
      return {
        type: raw.type,
        action: raw.action,
        payload: raw.payload ?? raw,
        timestamp: raw.timestamp || Date.now(),
      };
    }

    // 兼容历史直接发 type 的旧报文
    if (raw && raw.type) {
      switch (raw.type) {
        case 'CHAT_BROADCAST':
          return createWsMessage(MessageType.CHAT, ChatAction.CHAT_BROADCAST, raw);
        case 'MAP_SYNC':
          return createWsMessage(MessageType.MAP, MapAction.MAP_SYNC, raw);
        case 'PLAYER_SYNC':
          return createWsMessage(MessageType.PLAYER, 'PLAYER_SYNC', raw);
        case 'PLAYER_MOVED':
          return createWsMessage(MessageType.MAP, MapAction.PLAYER_MOVED, raw);
        case 'PLAYER_ENTER':
          return createWsMessage(MessageType.SCENE, SceneAction.PLAYER_ENTER, raw);
        case 'PLAYER_LEAVE':
          return createWsMessage(MessageType.SCENE, SceneAction.PLAYER_LEAVE, raw);
        case 'AREA_PLAYERS':
        case 'SYNC_AREA':
          return createWsMessage(MessageType.SCENE, SceneAction.AREA_PLAYERS, raw);
        default:
          return {
            type: raw.type,
            action: raw.action || raw.type,
            payload: raw,
            timestamp: raw.timestamp || Date.now(),
          };
      }
    }

    return {
      type: MessageType.SYSTEM,
      action: 'UNKNOWN',
      payload: raw,
      timestamp: Date.now(),
    };
  }

  /**
   * 核心状态同步：收到特定事件后，直接调用 Zustand store 的 action 更新全局状态
   */
  private syncGlobalStores(message: WsMessage<any>) {
    const { type, action, payload } = message;

    // 1. 邮件模块：当收到 MAIL_NEW 时直接刷新未读数 (点亮红点徽标)
    if (type === MessageType.MAIL) {
      if (action === MailAction.MAIL_NEW || action === 'MAIL_NEW') {
        const mailData = payload as MailNewPayload;
        const currentCount = usePlayerStore.getState().unreadMailCount;
        const nextCount = typeof mailData.unreadCount === 'number' ? mailData.unreadCount : currentCount + 1;
        usePlayerStore.getState().setUnreadMailCount(nextCount);
        if (mailData?.title?.includes('结交')) {
          usePlayerStore.getState().fetchFriendRequests().catch(() => {});
        }
      } else if (action === MailAction.MAIL_COUNT_SYNC || action === 'MAIL_COUNT_SYNC') {
        if (typeof payload?.unreadCount === 'number') {
          usePlayerStore.getState().setUnreadMailCount(payload.unreadCount);
        }
      }
    }

    // 2. 社交模块：结交申请或结交成功时同步刷新好友与申请列表
    if (type === MessageType.SOCIAL || (type as string) === 'SOCIAL') {
      usePlayerStore.getState().fetchFriendRequests().catch(() => {});
      usePlayerStore.getState().fetchFriends().catch(() => {});
    }

    // 2. 聊天模块：收到全服/区域广播时，推入聊天 Store
    if (type === MessageType.CHAT) {
      if (action === ChatAction.CHAT_BROADCAST || action === 'CHAT_BROADCAST') {
        const chatData = payload as ChatBroadcastPayload;
        const chatMsg: ChatMessage = {
          id: chatData.id || `ws_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          channel: (chatData.channel as any) || 'world',
          senderId: chatData.senderId,
          senderName: chatData.senderName || '未知修士',
          text: chatData.text,
          timestamp: chatData.timestamp || Date.now(),
          timeFormatted: '刚刚',
        };
        useChatStore.getState().addMessage(chatMsg);
      }
    }

    // 3. 地图模块：收到场景人数变更时，同步更新地图状态
    if (type === MessageType.MAP) {
      if (action === MapAction.MAP_SYNC || action === 'MAP_SYNC') {
        const mapData = payload as MapSyncPayload;
        if (mapData.onlineCount !== undefined) {
          useMapStore.getState().updateScene({
            onlineCount: mapData.onlineCount,
          });
        }
      }
    }

    // 4. 玩家模块：属性变动强同步
    if (type === MessageType.PLAYER) {
      if (payload?.player) {
        usePlayerStore.getState().setPlayer(payload.player);
      } else if (payload?.changes) {
        usePlayerStore.getState().setPlayer(payload.changes);
      }
    }

    // 5. MUD 场景与区域同道模块：极简状态同步
    if (
      type === MessageType.SCENE ||
      (type as string) === 'SCENE' ||
      type === MessageType.MAP ||
      (type as string) === 'MAP'
    ) {
      if (
        action === SceneAction.AREA_PLAYERS ||
        action === 'AREA_PLAYERS' ||
        action === 'SYNC_AREA'
      ) {
        // 必须以服务器返回的 areaId 为权威来源，不能用本地 currentAreaId 兜底
        const areaId = payload?.areaId;
        if (!areaId) {
          console.warn('[WS] AREA_PLAYERS 收到但 payload.areaId 为空，忽略', payload);
          return;
        }
        const playersList = Array.isArray(payload?.players)
          ? payload.players
          : Array.isArray(payload)
          ? payload
          : [];
        console.log(`[WS] AREA_PLAYERS areaId=${areaId} players=`, playersList.map((p: any) => p.id || p.playerId));
        const normalized = playersList.map((p: any) => ({
          id: p.id || p.playerId,
          name: p.name || p.nickname || '同道道友',
          areaId: p.areaId || p.currentMap || areaId,
          avatar: p.avatar,
          level: p.level,
          realm: p.realm,
          title: p.title,
        }));
        useSceneStore.getState().setAreaPlayers(areaId, normalized);
      } else if (
        action === SceneAction.PLAYER_ENTER ||
        action === 'PLAYER_ENTER' ||
        action === 'PLAYER_JOIN'
      ) {
        const rawPlayer = payload?.player || payload;
        if (rawPlayer && (rawPlayer.id || rawPlayer.playerId)) {
          const areaId =
            rawPlayer.areaId ||
            rawPlayer.currentMap ||
            payload?.areaId ||
            useSceneStore.getState().currentAreaId;
          console.log(`[WS] PLAYER_ENTER id=${rawPlayer.id || rawPlayer.playerId} areaId=${areaId}`);
          useSceneStore.getState().addPlayer({
            id: rawPlayer.id || rawPlayer.playerId,
            name: rawPlayer.name || rawPlayer.nickname || '同道道友',
            areaId,
            avatar: rawPlayer.avatar,
            level: rawPlayer.level,
            realm: rawPlayer.realm,
            title: rawPlayer.title,
          });
        }
      } else if (
        action === SceneAction.PLAYER_LEAVE ||
        action === 'PLAYER_LEAVE'
      ) {
        const playerId = payload?.playerId || payload?.id;
        if (playerId) {
          useSceneStore.getState().removePlayer(playerId);
        }
      } else if (action === MapAction.PLAYER_MOVED || action === 'PLAYER_MOVED') {
        const pId = payload?.playerId || payload?.id;
        const targetArea = payload?.areaId || payload?.mapId;
        if (pId && targetArea) {
          const existing = useSceneStore.getState().players.find((p) => p.id === pId);
          if (existing) {
            useSceneStore.getState().addPlayer({ ...existing, areaId: targetArea });
          }
        }
      }
    }
  }

  /**
   * 事件总线：将消息分发给特定订阅回调
   */
  private emit(message: WsMessage<any>) {
    const { type, action, payload } = message;

    const specificKey = `${type}:${action}`;
    const moduleWildcardKey = `${type}:*`;
    const allWildcardKey = '*:*';

    const triggerSet = (key: string) => {
      const set = this.listeners.get(key);
      if (set) {
        set.forEach((cb) => {
          try {
            cb(payload, message);
          } catch (e) {
            console.error(`[WebSocketManager] 事件监听执行异常 [${key}]:`, e);
          }
        });
      }
    };

    triggerSet(specificKey);
    triggerSet(moduleWildcardKey);
    triggerSet(allWildcardKey);
  }

  /**
   * 注册事件订阅
   * @param type 主模块类型 (如 COMBAT, NOTICE, MAIL) 或 '*'
   * @param action 子指令动作 (如 COMBAT_DAMAGE, SYSTEM_ANNOUNCEMENT) 或 '*'
   * @param callback 回调函数
   * @returns 取消订阅函数
   */
  public on<T = any>(
    type: MessageType | string,
    action: string,
    callback: WsEventCallback<T>
  ): () => void {
    const key = `${type}:${action}`;
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(callback as WsEventCallback);

    return () => {
      const set = this.listeners.get(key);
      if (set) {
        set.delete(callback as WsEventCallback);
        if (set.size === 0) {
          this.listeners.delete(key);
        }
      }
    };
  }

  /**
   * 发送标准统一消息包
   */
  public sendMessage<T = any>(type: MessageType | string, action: string, payload: T): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const msg = createWsMessage(type as MessageType, action, payload);
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  /**
   * 发送动作请求 (兼容历史 sendAction)
   */
  public send(data: any): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(typeof data === 'string' ? data : JSON.stringify(data));
      return true;
    }
    return false;
  }

  public sendAction(action: string, payload: Record<string, unknown> = {}): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          action,
          ...payload,
          timestamp: Date.now(),
        })
      );
      return true;
    }
    return false;
  }

  /**
   * 断开长连接与释放
   */
  public disconnect() {
    this.isExplicitlyClosed = true;
    this.cleanupSocket();
    this.currentMapId = null;
    this.currentPlayerId = null;
  }

  private cleanupSocket() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      const s = this.ws;
      s.onopen = null;
      s.onmessage = null;
      s.onerror = null;
      s.onclose = null;
      if (s.readyState === WebSocket.OPEN) {
        s.close();
      } else if (s.readyState === WebSocket.CONNECTING) {
        s.onopen = () => s.close();
      }
      this.ws = null;
      this.notifyStatus(false);
    }
  }

  public isConnected(): boolean {
    return Boolean(this.ws && this.ws.readyState === WebSocket.OPEN);
  }
}

// 导出单例对象
export const wsManager = WebSocketManager.getInstance();

/**
 * 订阅当前 WebSocket 连接就绪状态
 */
export function useWsStatus(): boolean {
  const [connected, setConnected] = useState<boolean>(() => wsManager.isConnected());

  useEffect(() => {
    setConnected(wsManager.isConnected());
    return wsManager.onStatus(setConnected);
  }, []);

  return connected;
}

/**
 * 自定义 Hook: 订阅 WebSocket 事件流 (Event Bus Hook)
 * 允许独立组件 (如战斗飘字、系统跑马灯) 订阅特定类型的 WebSocket 事件，实现 UI 深度解耦。
 *
 * @param type 模块类型 (MessageType.COMBAT, MessageType.NOTICE, MessageType.MAIL, etc.)
 * @param action 子动作类型 (如 COMBAT_DAMAGE, SYSTEM_ANNOUNCEMENT)
 * @param callback 接收到事件时的响应回调
 */
export function useWsEvent<T = any>(
  type: MessageType | string,
  action: string,
  callback: (payload: T, message: WsMessage<T>) => void
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const unsubscribe = wsManager.on<T>(type, action, (payload, message) => {
      callbackRef.current(payload, message);
    });
    return unsubscribe;
  }, [type, action]);
}

interface UseWebSocketOptions {
  zoneId?: string;
  mapId?: string;
  areaId?: string;
  enabled?: boolean;
}

/**
 * 根级 WebSocket 连接挂载 Hook
 */
export const useWebSocket = ({
  zoneId,
  mapId,
  areaId,
  enabled = true,
}: UseWebSocketOptions) => {
  const player = usePlayerStore((s) => s.player);

  useEffect(() => {
    if (!enabled || !player?.id) return;

    wsManager.connect({
      zoneId: zoneId || player.zoneId,
      areaId: areaId || player.areaId || player.currentMap,
      mapId,
      playerId: player.id,
    });
  }, [
    enabled,
    zoneId,
    mapId,
    areaId,
    player?.id,
    player?.zoneId,
    player?.areaId,
    player?.currentMap,
  ]);

  const sendAction = useCallback((actionType: string, payload: Record<string, unknown> = {}) => {
    wsManager.sendAction(actionType, payload);
  }, []);

  const sendMessage = useCallback(<T = any>(type: MessageType | string, action: string, payload: T) => {
    return wsManager.sendMessage(type, action, payload);
  }, []);

  return {
    sendAction,
    sendMessage,
    wsManager,
  };
};
