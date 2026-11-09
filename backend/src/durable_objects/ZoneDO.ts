import { Env } from '../models/env';
import {
  MessageType,
  WsMessage,
  createWsMessage,
  CombatAction,
  CombatDamagePayload,
  DuelInvitePayload,
  DuelStartPayload,
  DuelRoundPayload,
  DuelActionPayload,
  DuelAbortPayload,
  PveStartRequest,
  PveStartPayload,
  PveActionPayload,
  PveRoundPayload,
  PveAbortPayload,
  NoticeAction,
  NoticePayload,
  MailAction,
  MailNewPayload,
  ChatAction,
  ChatBroadcastPayload,
  SceneAction,
  AreaPlayerInfo,
  ChangeAreaPayload,
} from '../models/ws';
import {
  prepareDuel,
  persistDuelResult,
  toCombatScriptEvents,
  DuelParticipantInfo,
  DuelSetup,
  preparePveDialogue,
  preparePveEncounter,
  persistPveDialogueResult,
  persistPveEncounterResult,
  completeStoryAfterBattle,
  PveSetup,
} from '../db/combatDb';
import { DuelSession, DuelSideAction } from '../services/combat/DuelSession';
import { CombatEngine } from '../services/combat/CombatEngine';
import { Fighter, RoundLog } from '../services/combat/types';
import { CombatFighter, CombatSkillInfo, BattleActionType } from '../models/combat';
import { bindRuntimeEnv } from '../utils/runtimeEnv';

/** 单侧实时切磋状态 */
interface DuelSideState {
  playerId: string;
  name: string;
  info: DuelParticipantInfo;
  fighters: Fighter[];
  view: CombatFighter[];
}

/** 实时回合制切磋会话状态 */
interface ActiveDuelState {
  duelId: string;
  battleId: string;
  session: DuelSession;
  challenger: DuelSideState;
  target: DuelSideState;
  /** unitId -> 本回合指令（每个存活单位各一条） */
  challengerActions: Map<string, DuelSideAction>;
  targetActions: Map<string, DuelSideAction>;
  round: number;
  deadline: number;
  timer: ReturnType<typeof setTimeout> | null;
  logs: RoundLog[];
  finished: boolean;
  resolving: boolean;
  skills: CombatSkillInfo[];
  timeoutMs: number;
}

/** 实时回合制 PvE 会话状态 */
interface ActivePveState {
  battleId: string;
  playerId: string;
  setup: PveSetup;
  session: DuelSession;
  player: {
    fighters: Fighter[];
    view: CombatFighter[];
  };
  enemy: {
    fighters: Fighter[];
    view: CombatFighter[];
  };
  /** unitId -> 本回合指令（每个存活单位各一条） */
  playerActions: Map<string, DuelSideAction>;
  round: number;
  deadline: number;
  timer: ReturnType<typeof setTimeout> | null;
  logs: RoundLog[];
  finished: boolean;
  resolving: boolean;
  timeoutMs: number;
}

/** 每回合出招窗口（毫秒）：需要为多个出战单位逐个下令，适当放长 */
const DUEL_ACTION_TIMEOUT_MS = 45_000;
/** PvE 每回合出招窗口（毫秒） */
const PVE_ACTION_TIMEOUT_MS = 45_000;
/** 切磋最大回合数 */
const DUEL_MAX_ROUNDS = 20;
/** PvE 最大回合数 */
const PVE_MAX_ROUNDS = 20;

/** 交换阵容阵营，用于应战方客户端视角 */
const swapCamp = (team: CombatFighter[]): CombatFighter[] =>
  team.map((f) => ({
    ...f,
    camp: f.camp === 'PLAYER' ? 'ENEMY' : 'PLAYER',
  }));

/**
 * 内存中活跃玩家状态定义
 */
export interface ActivePlayerState {
  id: string;
  name: string;
  areaId: string;
  avatar?: string;
  level?: number;
  realm?: string;
  title?: string;
}

/**
 * WebSocket 连接元数据 (Cloudflare DO serializeAttachment 载荷)
 */
export interface WsAttachment {
  playerId: string;
  areaId: string;
  zoneId: string;
  isAiAgent: boolean;
  joinedAt: number;
  lastActive: number;
}

/**
 * 大区场景状态对象 (ZoneDO)
 *
 * 架构规范：
 * 1. 大区级粒度：每个宏观大区 (如 'changle_city', 'canglan_state') 共用一个单例 ZoneDO 实例。
 * 2. 内存状态驱动：activePlayers = new Map<string, { id, name, areaId, ... }>() 统筹城内所有子区域。
 * 3. 极速同城移动 (CHANGE_AREA)：完全基于内存路由，向原 areaId 广播 PLAYER_LEAVE，向新 areaId 广播 PLAYER_ENTER，零数据库读写。
 * 4. 离线异步持久化：仅在 WebSocket 断开连接 (webSocketClose) 时，调用 ctx.waitUntil() 将最终 area_id 异步存盘至 D1。
 */
export class ZoneDO implements DurableObject {
  state: DurableObjectState;
  env: Env;
  zoneId: string = 'changle_city';

  // 内存状态：大区内所有活跃玩家及常驻修仙者映射 (playerId -> ActivePlayerState)
  activePlayers = new Map<string, ActivePlayerState>();

  // 内存会话映射：玩家与 WebSocket 的双向索引
  private playerSockets = new Map<string, Set<WebSocket>>();
  private allSessions = new Map<string, { ws: WebSocket; playerId: string }>();

  // 内存切磋邀请管理 (duelId -> 切磋元数据)
  private pendingDuels = new Map<
    string,
    {
      duelId: string;
      challengerId: string;
      targetPlayerId: string;
      expiresAt: number;
      challengerInfo: DuelInvitePayload;
    }
  >();

  // 进行中的实时切磋 (duelId -> 回合制会话)
  private activeDuels = new Map<string, ActiveDuelState>();

  // 进行中的实时 PvE 战斗 (battleId -> 回合制会话)
  private activePves = new Map<string, ActivePveState>();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    // Durable Object 的执行上下文同样需要 Env 才能把升级通知推送回长连接
    bindRuntimeEnv(env);
    // this.initResidentCultivators();
  }

  /**
   * 初始化大区各子区域默认常驻道友（原著经典角色分布于广场、演武场、府衙等）
   */
  private initResidentCultivators() {

  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // 1. WebSocket 协议升级握手
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      const playerId =
        url.searchParams.get('playerId') ||
        String(Math.floor(100000 + Math.random() * 900000));
      const isAiAgent =
        url.searchParams.get('agent') === 'true' ||
        url.searchParams.get('isAgent') === 'true';
      this.zoneId =
        url.searchParams.get('zoneId') ||
        url.searchParams.get('mapId') ||
        this.zoneId;

      const initialAreaId = url.searchParams.get('areaId') || undefined;

      await this.handleSession(server, playerId, isAiAgent, initialAreaId);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    // 2. HTTP RPC: 精准点对点私发
    if (url.pathname.endsWith('/sendTo') && request.method === 'POST') {
      const body = await request.json<{ playerId: string; message: WsMessage<any> }>();
      const delivered = this.sendTo(body.playerId, body.message);
      return Response.json({ success: true, delivered });
    }

    // 3. HTTP RPC: 全大区广播
    if (url.pathname.endsWith('/broadcast') && request.method === 'POST') {
      const body = await request.json<{ message: WsMessage<any> }>();
      this.broadcast(body.message);
      return Response.json({ success: true });
    }

    // 4. HTTP API: 状态查询 (大区在线人数与子区域分布)
    if (url.pathname.endsWith('/status')) {
      const areaStats: Record<string, number> = {};
      for (const p of this.activePlayers.values()) {
        areaStats[p.areaId] = (areaStats[p.areaId] || 0) + 1;
      }

      return Response.json({
        zoneId: this.zoneId,
        totalActivePlayers: this.activePlayers.size,
        connectedSockets: this.allSessions.size,
        areaStats,
        onlinePlayerIds: Array.from(this.activePlayers.keys()),
      });
    }

    return new Response(`ZoneDO [${this.zoneId}] Active`, { status: 200 });
  }

  /**
   * 处理 WebSocket 连接生命周期与初始加载
   */
  async handleSession(
    ws: WebSocket,
    playerId: string,
    isAiAgent: boolean,
    requestedAreaId?: string
  ) {
    ws.accept();

    // 1. 从 D1 读取修仙者档案 (初始位置与道号立绘)
    let areaId = requestedAreaId || 'square';
    let name = `散修_${playerId.slice(0, 4)}`;
    let avatar = '';
    // 未知身份时不编造修为数据，等 D1 档案返回后再填充
    let level = 0;
    let realm = '';
    let title = '';

    if (this.env.DB) {
      try {
        const dbPlayer = await this.env.DB
          .prepare(
            'SELECT id, nickname, zone_id, area_id, avatar, level, realm, title FROM players WHERE id = ?'
          )
          .bind(playerId)
          .first<{
            id: string;
            nickname: string;
            zone_id: string;
            area_id: string;
            avatar: string;
            level: number;
            realm: string;
            title: string;
          }>();

        if (dbPlayer) {
          name = dbPlayer.nickname || name;
          areaId = requestedAreaId || dbPlayer.area_id || 'square';
          avatar = dbPlayer.avatar || avatar;
          level = dbPlayer.level || level;
          realm = dbPlayer.realm || realm;
          title = dbPlayer.title || title;
        }
      } catch (err) {
        console.warn(`[ZoneDO] 读取玩家 [${playerId}] 数据库初始状态异常:`, err);
      }
    }

    const playerState: ActivePlayerState = {
      id: playerId,
      name,
      areaId,
      avatar,
      level,
      realm,
      title,
    };

    // 2. 存入内存 activePlayers 状态
    this.activePlayers.set(playerId, playerState);

    // 维护 socket 索引
    if (!this.playerSockets.has(playerId)) {
      this.playerSockets.set(playerId, new Set());
    }
    this.playerSockets.get(playerId)!.add(ws);

    const sessionId = `${playerId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.allSessions.set(sessionId, { ws, playerId });

    const attachment: WsAttachment = {
      playerId,
      areaId,
      zoneId: this.zoneId,
      isAiAgent,
      joinedAt: Date.now(),
      lastActive: Date.now(),
    };
    try {
      ws.serializeAttachment(attachment);
    } catch {}

    // 3. 向新连接的玩家推送当前区域内所有同道列表 (AREA_PLAYERS)
    const currentAreaPlayers = Array.from(this.activePlayers.values()).filter(
      (p) => p.areaId === areaId
    );
    console.log(`[ZoneDO] handleSession player=${playerId} areaId=${areaId} activePlayers=${this.activePlayers.size} sameArea=${currentAreaPlayers.length}`, currentAreaPlayers.map(p => p.id));
    try {
      ws.send(
        JSON.stringify(
          createWsMessage(MessageType.SCENE, SceneAction.AREA_PLAYERS, {
            areaId,
            players: currentAreaPlayers,
          })
        )
      );
    } catch {}

    // 4. 向当前区域其他玩家广播 PLAYER_ENTER
    this.broadcastToArea(
      areaId,
      createWsMessage(MessageType.SCENE, SceneAction.PLAYER_ENTER, {
        player: playerState,
        areaId,
      }),
      playerId
    );

    // 5. 监听上行消息
    ws.addEventListener('message', async (event) => {
      try {
        const rawText =
          typeof event.data === 'string'
            ? event.data
            : new TextDecoder().decode(event.data as ArrayBuffer);
        const data = JSON.parse(rawText);

        attachment.lastActive = Date.now();
        try {
          ws.serializeAttachment(attachment);
        } catch {}

        await this.handleIncomingMessage(data, ws, attachment);
      } catch (err) {
        console.error('[ZoneDO] 消息解析或处理异常:', err);
      }
    });

    // 6. 监听断开事件
    const closeHandler = () => {
      this.handlePlayerDisconnect(playerId, ws, sessionId);
    };

    ws.addEventListener('close', closeHandler);
    ws.addEventListener('error', closeHandler);
  }

  /**
   * Cloudflare DO Hibernation WebSocket 关闭回调
   */
  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean) {
    const att = ws.deserializeAttachment?.() as WsAttachment | null;
    if (att?.playerId) {
      this.handlePlayerDisconnect(att.playerId, ws);
    }
  }

  /**
   * Cloudflare DO Hibernation WebSocket 接收报文回调
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    try {
      const rawText =
        typeof message === 'string' ? message : new TextDecoder().decode(message);
      const data = JSON.parse(rawText);
      const att = ws.deserializeAttachment?.() as WsAttachment | null;
      if (att) {
        att.lastActive = Date.now();
        try {
          ws.serializeAttachment(att);
        } catch {}
        await this.handleIncomingMessage(data, ws, att);
      }
    } catch (e) {
      console.error('[ZoneDO] Hibernation message 处理异常:', e);
    }
  }

  /**
   * 统一处理客户端上行报文
   */
  private async handleIncomingMessage(
    data: any,
    ws: WebSocket,
    attachment: WsAttachment
  ) {
    const type = data.type;
    const action = data.action;
    const payload = data.payload || data;
    const playerId = attachment.playerId;

    // ------------------------------------------------------------------------
    // 核心业务：同城移动 (WebSocket CHANGE_AREA)
    // ------------------------------------------------------------------------
    if (
      (type === MessageType.SCENE || type === 'SCENE') &&
      (action === SceneAction.CHANGE_AREA || action === 'CHANGE_AREA')
    ) {
      const targetAreaId = payload?.areaId;
      if (!targetAreaId) return;

      let player = this.activePlayers.get(playerId);
      if (!player) {
        let name = `散修_${playerId.slice(0, 4)}`;
        let avatar = '';
        // 未知身份时不编造修为数据，等 D1 档案返回后再填充
        let level = 0;
        let realm = '';
        let title = '';
        if (this.env.DB) {
          try {
            const dbPlayer = await this.env.DB
              .prepare(
                'SELECT id, nickname, zone_id, area_id, avatar, level, realm, title FROM players WHERE id = ?'
              )
              .bind(playerId)
              .first<any>();
            if (dbPlayer) {
              name = dbPlayer.nickname || name;
              avatar = dbPlayer.avatar || avatar;
              level = dbPlayer.level || level;
              realm = dbPlayer.realm || realm;
              title = dbPlayer.title || title;
            }
          } catch {}
        }
        player = { id: playerId, name, areaId: targetAreaId, avatar, level, realm, title };
        this.activePlayers.set(playerId, player);
      }

      const oldAreaId = player.areaId;
      if (oldAreaId === targetAreaId) {
        // 重复点击同一地点，重新推送该区域所有修仙者
        const sameAreaPlayers = Array.from(this.activePlayers.values()).filter(
          (p) => p.areaId === targetAreaId
        );
        console.log(`[ZoneDO] CHANGE_AREA same area player=${playerId} areaId=${targetAreaId} sameAreaCount=${sameAreaPlayers.length}`);
        ws.send(
          JSON.stringify(
            createWsMessage(MessageType.SCENE, SceneAction.AREA_PLAYERS, {
              areaId: targetAreaId,
              players: sameAreaPlayers,
            })
          )
        );
        return;
      }

      // 1. 更新内存中的 areaId，并同步落库
      //    players.area_id 是跨端唯一的位置真源：对话/防作弊/重连都依赖它，
      //    因此同城移动也必须持久化，不能只活在 DO 内存里。
      player.areaId = targetAreaId;
      this.activePlayers.set(playerId, player);

      if (this.env.DB) {
        try {
          await this.env.DB
            .prepare('UPDATE players SET area_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .bind(targetAreaId, playerId)
            .run();
        } catch (err) {
          console.warn(`[ZoneDO] 持久化玩家 [${playerId}] 所在区域失败:`, err);
        }
      }

      attachment.areaId = targetAreaId;
      try {
        ws.serializeAttachment(attachment);
      } catch {}

      // 2. 利用内部的高效路由：向原 areaId 下的其他玩家广播 PLAYER_LEAVE
      this.broadcastToArea(
        oldAreaId,
        createWsMessage(MessageType.SCENE, SceneAction.PLAYER_LEAVE, {
          playerId,
          areaId: oldAreaId,
        }),
        playerId
      );

      // 3. 向新 areaId 下的其他玩家广播 PLAYER_ENTER
      this.broadcastToArea(
        targetAreaId,
        createWsMessage(MessageType.SCENE, SceneAction.PLAYER_ENTER, {
          player,
          areaId: targetAreaId,
        }),
        playerId
      );

      // 4. 向当前移动玩家同步新区域的全部同道列表 (包含自己与所有在该区域的玩家)
      const newAreaPlayers = Array.from(this.activePlayers.values()).filter(
        (p) => p.areaId === targetAreaId
      );
      ws.send(
        JSON.stringify(
          createWsMessage(MessageType.SCENE, SceneAction.AREA_PLAYERS, {
            areaId: targetAreaId,
            players: newAreaPlayers,
          })
        )
      );

      return;
    }

    // 兼容历史老格式指令 (MOVE)
    if (
      (type === MessageType.MAP || type === 'MAP') &&
      (action === 'MOVE' || action === 'CHECK_IN')
    ) {
      if (payload?.areaId) {
        // 自动桥接至 CHANGE_AREA
        await this.handleIncomingMessage(
          {
            type: MessageType.SCENE,
            action: SceneAction.CHANGE_AREA,
            payload: { areaId: payload.areaId },
          },
          ws,
          attachment
        );
      }
      return;
    }

    // 聊天传音处理 (CHAT)
    if (type === MessageType.CHAT || type === 'CHAT') {
      const text = payload?.text || payload?.content;
      if (!text || !text.trim()) return;

      const player = this.activePlayers.get(playerId);
      const speakerName = player?.name || payload?.senderName || '无名散修';
      const channel = payload?.channel || 'local';

      const chatMsg = createWsMessage<ChatBroadcastPayload>(
        MessageType.CHAT,
        ChatAction.CHAT_BROADCAST,
        {
          id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          channel,
          senderId: playerId,
          senderName: speakerName,
          text: text.trim(),
          timestamp: Date.now(),
        }
      );

      // 区域聊天仅在同子区域内广播，世界聊天全大区广播
      if (channel === 'local') {
        this.broadcastToArea(player?.areaId || 'square', chatMsg);
      } else {
        this.broadcast(chatMsg);
      }
      return;
    }

    // 战斗与切磋系统处理 (COMBAT)
    if (type === MessageType.COMBAT || type === 'COMBAT') {
      // 1. 发起切磋邀请
      if (action === CombatAction.DUEL_INVITE || action === 'DUEL_INVITE') {
        const targetPlayerId = payload?.targetPlayerId;
        if (!targetPlayerId) return;

        if (targetPlayerId === playerId) {
          this.sendTo(
            playerId,
            createWsMessage(MessageType.NOTICE, NoticeAction.TOAST, {
              content: '无法向自己发起切磋比试。',
              level: 'warning',
            })
          );
          return;
        }

        const targetSockets = this.playerSockets.get(targetPlayerId);
        if (!targetSockets || targetSockets.size === 0) {
          this.sendTo(
            playerId,
            createWsMessage(MessageType.NOTICE, NoticeAction.TOAST, {
              content: '对方道友当前不在线或已遁入闭关，无法切磋。',
              level: 'warning',
            })
          );
          return;
        }

        // 任一方正在实时 PvE 战斗中，不允许发起切磋
        if (
          this.findActivePveByPlayer(playerId) ||
          this.findActivePveByPlayer(targetPlayerId)
        ) {
          this.sendTo(
            playerId,
            createWsMessage(MessageType.NOTICE, NoticeAction.TOAST, {
              content: '对方道友正在迎战强敌，请稍后再约切磋。',
              level: 'warning',
            })
          );
          return;
        }

        // 清理已过期的邀请
        const now = Date.now();
        for (const [id, duel] of this.pendingDuels.entries()) {
          if (duel.expiresAt <= now) {
            this.pendingDuels.delete(id);
          }
        }

        const challenger = this.activePlayers.get(playerId);
        let combatPower = 1000;
        if (this.env.DB) {
          try {
            const pRow = await this.env.DB
              .prepare('SELECT combat_power FROM players WHERE id = ?')
              .bind(playerId)
              .first<{ combat_power: number }>();
            if (pRow?.combat_power) combatPower = pRow.combat_power;
          } catch {}
        }

        const duelId = `duel_${now}_${Math.random().toString(36).slice(2, 8)}`;
        const expiresAt = now + 30000; // 30秒倒计时

        const invitePayload: DuelInvitePayload = {
          duelId,
          challengerId: playerId,
          challengerName: challenger?.name || '无名道友',
          challengerAvatar: challenger?.avatar,
          challengerLevel: challenger?.level || 1,
          challengerRealm: challenger?.realm || '练气期',
          challengerCombatPower: combatPower,
          targetPlayerId,
          expiresAt,
        };

        this.pendingDuels.set(duelId, {
          duelId,
          challengerId: playerId,
          targetPlayerId,
          expiresAt,
          challengerInfo: invitePayload,
        });

        // 推送切磋弹窗给受邀玩家
        this.sendTo(
          targetPlayerId,
          createWsMessage(MessageType.COMBAT, CombatAction.DUEL_INVITE, invitePayload)
        );

        // 回执通知发起人：在线状态由服务端校验后给出权威提示
        const targetPlayer = this.activePlayers.get(targetPlayerId);
        this.sendTo(
          playerId,
          createWsMessage(MessageType.NOTICE, NoticeAction.TOAST, {
            content: `已向道友【${targetPlayer?.name || '对方'}】发出切磋邀请，静候应战...`,
            level: 'info',
          })
        );
        return;
      }

      // 2. 拒绝切磋邀请
      if (action === CombatAction.DUEL_REJECT || action === 'DUEL_REJECT') {
        const duelId = payload?.duelId;
        const duel = duelId ? this.pendingDuels.get(duelId) : null;
        if (duel) {
          this.pendingDuels.delete(duelId);
          const rejecter = this.activePlayers.get(playerId);
          const reason = payload?.reason || `道友【${rejecter?.name || '对方'}】婉言谢绝了您的切磋邀请。`;
          this.sendTo(
            duel.challengerId,
            createWsMessage(MessageType.COMBAT, CombatAction.DUEL_REJECT, {
              duelId,
              targetPlayerId: playerId,
              targetName: rejecter?.name || '对方',
              reason,
            })
          );
        }
        return;
      }

      // 3. 接受切磋邀请 -> 建立实时回合制切磋，双方进入战斗视口
      if (action === CombatAction.DUEL_ACCEPT || action === 'DUEL_ACCEPT') {
        const duelId = payload?.duelId;
        const duel = duelId ? this.pendingDuels.get(duelId) : null;
        if (!duel || duel.expiresAt < Date.now()) {
          this.sendTo(
            playerId,
            createWsMessage(MessageType.NOTICE, NoticeAction.TOAST, {
              content: '切磋邀请已过期或已失效。',
              level: 'warning',
            })
          );
          return;
        }

        // 只有被邀请者可以应战
        if (duel.targetPlayerId !== playerId) {
          return;
        }

        if (!this.env.DB) {
          console.error('[ZoneDO] 数据库未就绪，无法开启切磋');
          return;
        }

        // 任意一方已处于另一场切磋或 PvE 战斗中，不允许再开新局
        if (
          this.findActiveDuelByPlayer(duel.challengerId) ||
          this.findActiveDuelByPlayer(duel.targetPlayerId) ||
          this.findActivePveByPlayer(duel.challengerId) ||
          this.findActivePveByPlayer(duel.targetPlayerId)
        ) {
          this.pendingDuels.delete(duelId);
          this.sendTo(
            duel.challengerId,
            createWsMessage(MessageType.NOTICE, NoticeAction.TOAST, {
              content: '对方道友正在战斗中，请稍后再约。',
              level: 'warning',
            })
          );
          this.sendTo(
            playerId,
            createWsMessage(MessageType.NOTICE, NoticeAction.TOAST, {
              content: '你正在战斗中，无法应战。',
              level: 'warning',
            })
          );
          return;
        }

        this.pendingDuels.delete(duelId);

        try {
          // 只构建双方实时阵容，胜负交由双方每回合出招后结算
          const setup = await prepareDuel(
            this.env.DB,
            duel.challengerId,
            duel.targetPlayerId
          );

          // 异步建阵期间可能有一方掉线，避免把离线玩家拉入对局
          if (
            !this.playerSockets.get(duel.challengerId)?.size ||
            !this.playerSockets.get(duel.targetPlayerId)?.size
          ) {
            this.sendTo(
              duel.challengerId,
              createWsMessage(MessageType.NOTICE, NoticeAction.TOAST, {
                content: '对方道友已离线，切磋未能开启。',
                level: 'warning',
              })
            );
            return;
          }

          this.startDuel(duelId, setup);

          // 全大区播报切磋战况
          this.broadcast(
            createWsMessage(MessageType.NOTICE, NoticeAction.MARQUEE, {
              content: `【演武论道】道友【${setup.challenger.info.name}】与【${setup.target.info.name}】拔剑切磋，以武会友，激战正酣！`,
              level: 'broadcast',
            })
          );
        } catch (err: any) {
          console.error('[ZoneDO] 切磋开局异常:', err);
          const errorMsg = `切磋开启失败: ${err.message || '未知异常'}`;
          this.sendTo(
            playerId,
            createWsMessage(MessageType.NOTICE, NoticeAction.TOAST, {
              content: errorMsg,
              level: 'warning',
            })
          );
          this.sendTo(
            duel.challengerId,
            createWsMessage(MessageType.NOTICE, NoticeAction.TOAST, {
              content: errorMsg,
              level: 'warning',
            })
          );
        }
        return;
      }

      // 4. 实时出招：双方主角本回合选择的技能与目标
      if (action === CombatAction.DUEL_ACTION || action === 'DUEL_ACTION') {
        await this.handleDuelAction(playerId, payload);
        return;
      }

      // 5. 实时 PvE：开启战斗 / 提交本回合 / 主动中止
      if (action === CombatAction.PVE_START || action === 'PVE_START') {
        await this.startPve(playerId, payload);
        return;
      }
      if (action === CombatAction.PVE_ACTION || action === 'PVE_ACTION') {
        await this.handlePveAction(playerId, payload);
        return;
      }
      if (action === CombatAction.PVE_ABORT || action === 'PVE_ABORT') {
        this.abortPve(playerId, payload?.battleId, '道友收剑退出，战斗中止。');
        return;
      }

      this.broadcast(data);
      return;
    }

    // 系统公告 (NOTICE)
    if (type === MessageType.NOTICE || type === 'NOTICE') {
      this.broadcast(data);
      return;
    }

    // 邮件通知 (MAIL)
    if (type === MessageType.MAIL || type === 'MAIL') {
      const targetId = payload?.receiverId || payload?.targetPlayerId;
      if (targetId) {
        this.sendTo(targetId, data);
      } else {
        this.broadcast(data);
      }
      return;
    }
  }

  // ---------------------------------------------------------------------------
  // 实时回合制切磋
  // ---------------------------------------------------------------------------

  private findActiveDuelByPlayer(playerId: string): ActiveDuelState | undefined {
    for (const duel of this.activeDuels.values()) {
      if (duel.challenger.playerId === playerId || duel.target.playerId === playerId) {
        return duel;
      }
    }
    return undefined;
  }

  /** 建立实时切磋会话，并向双方下发开局阵容与首回合出招窗口 */
  private startDuel(duelId: string, setup: DuelSetup): void {
    const duel: ActiveDuelState = {
      duelId,
      battleId: setup.battleId,
      session: new DuelSession(
        new CombatEngine(),
        setup.challenger.fighters,
        setup.target.fighters,
        DUEL_MAX_ROUNDS,
        setup.skills
      ),
      challenger: {
        playerId: setup.challenger.info.id,
        name: setup.challenger.info.name,
        info: setup.challenger.info,
        fighters: setup.challenger.fighters,
        view: setup.challenger.view,
      },
      target: {
        playerId: setup.target.info.id,
        name: setup.target.info.name,
        info: setup.target.info,
        fighters: setup.target.fighters,
        view: setup.target.view,
      },
      challengerActions: new Map(),
      targetActions: new Map(),
      round: 1,
      deadline: Date.now() + DUEL_ACTION_TIMEOUT_MS,
      timer: null,
      logs: [],
      finished: false,
      resolving: false,
      skills: setup.skills,
      timeoutMs: DUEL_ACTION_TIMEOUT_MS,
    };

    this.activeDuels.set(duelId, duel);
    this.sendDuelStart(duel);
    this.armDuelTimer(duel);
  }

  private sendDuelStart(duel: ActiveDuelState): void {
    const common = {
      duelId: duel.duelId,
      battleId: duel.battleId,
      mode: 'PVP' as const,
      skills: duel.skills,
      round: duel.round,
      deadline: duel.deadline,
      serverNow: Date.now(),
      timeoutMs: duel.timeoutMs,
    };

    this.sendTo(
      duel.challenger.playerId,
      createWsMessage<DuelStartPayload>(MessageType.COMBAT, CombatAction.DUEL_START, {
        ...common,
        playerTeam: duel.challenger.view,
        enemyTeam: duel.target.view,
        opponent: duel.target.info,
      })
    );

    this.sendTo(
      duel.target.playerId,
      createWsMessage<DuelStartPayload>(MessageType.COMBAT, CombatAction.DUEL_START, {
        ...common,
        playerTeam: swapCamp(duel.target.view),
        enemyTeam: swapCamp(duel.challenger.view),
        opponent: duel.challenger.info,
      })
    );
  }

  /** 启动/重置本回合超时时钟；超时未出招的一方自动普攻 */
  private armDuelTimer(duel: ActiveDuelState): void {
    if (duel.timer) {
      clearTimeout(duel.timer);
      duel.timer = null;
    }

    const remaining = Math.max(0, duel.deadline - Date.now());
    duel.timer = setTimeout(() => {
      const live = this.activeDuels.get(duel.duelId);
      if (!live || live.finished) return;

      // 超时：为双方所有未下令的存活单位补普通攻击
      const fillMissing = (
        side: DuelSideState,
        actions: Map<string, DuelSideAction>
      ) => {
        for (const fighter of side.fighters) {
          if (fighter.hp > 0 && !actions.has(fighter.id)) {
            actions.set(fighter.id, { skillId: 'skill_basic_attack' });
          }
        }
      };
      fillMissing(live.challenger, live.challengerActions);
      fillMissing(live.target, live.targetActions);

      void this.resolveDuelRound(live);
    }, remaining);
  }

  /** 双方所有存活单位都已下令？ */
  private areDuelActionsReady(duel: ActiveDuelState): boolean {
    const allOrdered = (
      side: DuelSideState,
      actions: Map<string, DuelSideAction>
    ) => side.fighters.filter((f) => f.hp > 0).every((f) => actions.has(f.id));
    return (
      allOrdered(duel.challenger, duel.challengerActions) &&
      allOrdered(duel.target, duel.targetActions)
    );
  }

  private async handleDuelAction(
    playerId: string,
    payload: Partial<DuelActionPayload>
  ): Promise<void> {
    const duelId = payload?.duelId;
    if (!duelId) return;

    const duel = this.activeDuels.get(duelId);
    if (!duel || duel.finished) return;

    // 只接受当前回合的出招，避免过期/重复指令打乱节奏
    if (payload.round !== duel.round) return;

    const isChallenger = duel.challenger.playerId === playerId;
    const isTarget = duel.target.playerId === playerId;
    if (!isChallenger && !isTarget) return;

    const incoming = Array.isArray(payload.actions) ? payload.actions : [];
    if (incoming.length === 0) return;

    const side = isChallenger ? duel.challenger : duel.target;
    const actionMap = isChallenger ? duel.challengerActions : duel.targetActions;
    const aliveUnitIds = new Set(
      side.fighters.filter((f) => f.hp > 0).map((f) => f.id)
    );

    for (const action of incoming) {
      const unitId = action?.unitId || action?.actorId;
      if (!unitId || !aliveUnitIds.has(unitId)) continue;
      const actionType =
        action.actionType ||
        (action.itemId
          ? BattleActionType.USE_ITEM
          : action.skillId === 'skill_basic_attack'
          ? BattleActionType.NORMAL_ATTACK
          : BattleActionType.SKILL);
      const skillId = duel.skills.some((skill) => skill.id === action.skillId)
        ? action.skillId
        : actionType === BattleActionType.NORMAL_ATTACK
        ? 'skill_basic_attack'
        : action.skillId;
      actionMap.set(unitId, {
        unitId,
        actorId: unitId,
        actionType,
        skillId,
        itemId: action.itemId,
        targetId: action.targetId,
        targetIds: action.targetIds,
      });
    }

    // 双方所有存活单位均已下令 -> 立即结算本回合
    if (this.areDuelActionsReady(duel)) {
      await this.resolveDuelRound(duel);
    }
  }

  /** 将引擎结算后的气血/内力同步到下发给客户端的阵容 */
  private syncDuelViews(duel: ActiveDuelState): void {
    const sync = (side: DuelSideState) => {
      side.fighters.forEach((fighter, index) => {
        const view = side.view[index];
        if (!view) return;
        view.hp = fighter.hp;
        view.mp = fighter.mp;
        view.isAlive = fighter.hp > 0;
      });
    };
    sync(duel.challenger);
    sync(duel.target);
  }

  /**
   * 结算一回合：由 DuelSession 按身法顺序执行双方已提交的技能，
   * 然后把逐条战报与最新阵容分别下发给双方（各自视角）。
   */
  private async resolveDuelRound(duel: ActiveDuelState): Promise<void> {
    if (duel.finished || duel.resolving) return;
    duel.resolving = true;

    if (duel.timer) {
      clearTimeout(duel.timer);
      duel.timer = null;
    }

    const playedRound = duel.round;
    const result = await duel.session.playRound(
      duel.challengerActions,
      duel.targetActions
    );

    duel.logs.push(...result.events);
    duel.challengerActions = new Map();
    duel.targetActions = new Map();
    duel.round = playedRound + 1;
    this.syncDuelViews(duel);

    const events = toCombatScriptEvents(result.events);
    duel.deadline = Date.now() + duel.timeoutMs;

    const finished = result.finished;
    const challengerOutcome: 'WIN' | 'LOSE' = result.winner === 'ALLY' ? 'WIN' : 'LOSE';
    const targetOutcome: 'WIN' | 'LOSE' = result.winner === 'ALLY' ? 'LOSE' : 'WIN';

    const challengerPayload: DuelRoundPayload = {
      duelId: duel.duelId,
      round: playedRound,
      nextRound: duel.round,
      events,
      playerTeam: duel.challenger.view,
      enemyTeam: duel.target.view,
      finished,
      outcome: finished ? challengerOutcome : undefined,
      deadline: duel.deadline,
      serverNow: Date.now(),
      timeoutMs: duel.timeoutMs,
      roundCount: duel.session.roundsPlayed,
    };

    this.sendTo(
      duel.challenger.playerId,
      createWsMessage<DuelRoundPayload>(
        MessageType.COMBAT,
        CombatAction.DUEL_ROUND,
        challengerPayload
      )
    );

    this.sendTo(
      duel.target.playerId,
      createWsMessage<DuelRoundPayload>(MessageType.COMBAT, CombatAction.DUEL_ROUND, {
        ...challengerPayload,
        playerTeam: swapCamp(duel.target.view),
        enemyTeam: swapCamp(duel.challenger.view),
        outcome: finished ? targetOutcome : undefined,
      })
    );

    if (finished) {
      duel.finished = true;
      this.activeDuels.delete(duel.duelId);

      const winnerName = result.winner === 'ALLY' ? duel.challenger.name : duel.target.name;
      const loserName = result.winner === 'ALLY' ? duel.target.name : duel.challenger.name;

      this.broadcast(
        createWsMessage(MessageType.NOTICE, NoticeAction.MARQUEE, {
          content: `【演武论道】道友【${winnerName}】技高一筹，胜过【${loserName}】，此场切磋圆满落幕！`,
          level: 'broadcast',
        })
      );

      if (this.env.DB) {
        try {
          await persistDuelResult(this.env.DB, {
            battleId: duel.battleId,
            challengerId: duel.challenger.playerId,
            targetPlayerId: duel.target.playerId,
            challengerName: duel.challenger.name,
            targetName: duel.target.name,
            winnerId:
              result.winner === 'ALLY' ? duel.challenger.playerId : duel.target.playerId,
            roundsCount: duel.session.roundsPlayed,
            logs: duel.logs,
          });
        } catch (err) {
          console.error('[ZoneDO] 切磋战报落库失败:', err);
        }
      }
    } else {
      this.armDuelTimer(duel);
    }

    duel.resolving = false;
  }

  /** 中止切磋（掉线/异常），通知双方客户端关闭战斗视口 */
  private abortDuel(duel: ActiveDuelState, reason: string): void {
    if (duel.timer) {
      clearTimeout(duel.timer);
      duel.timer = null;
    }
    this.activeDuels.delete(duel.duelId);

    const payload: DuelAbortPayload = { duelId: duel.duelId, reason };
    this.sendTo(
      duel.challenger.playerId,
      createWsMessage<DuelAbortPayload>(MessageType.COMBAT, CombatAction.DUEL_ABORT, payload)
    );
    this.sendTo(
      duel.target.playerId,
      createWsMessage<DuelAbortPayload>(MessageType.COMBAT, CombatAction.DUEL_ABORT, payload)
    );
  }

  // ---------------------------------------------------------------------------
  // 实时回合制 PvE（剧情战 / 地图 NPC 遭遇）
  // ---------------------------------------------------------------------------

  private findActivePveByPlayer(playerId: string): ActivePveState | undefined {
    for (const pve of this.activePves.values()) {
      if (pve.playerId === playerId) return pve;
    }
    return undefined;
  }

  private notifyToast(
    playerId: string,
    content: string,
    level: 'info' | 'warning' | 'broadcast' | 'urgent' = 'warning'
  ): void {
    this.sendTo(
      playerId,
      createWsMessage(MessageType.NOTICE, NoticeAction.TOAST, { content, level })
    );
  }

  /** 内部奖励结构 -> 客户端展示结构（隐藏 type/quality 等服务端字段） */
  private toPveRewards(
    rewards?: PveSetup['rewards']
  ): PveStartPayload['rewards'] {
    if (!rewards) return undefined;
    return {
      exp: rewards.exp,
      gold: rewards.gold,
      silver: rewards.silver,
      items: rewards.items.map((item) => ({
        id: item.id,
        name: item.name,
        count: item.count,
      })),
    };
  }

  /** 客户端请求开启 PvE：服务端组装阵容后创建实时回合制会话 */
  private async startPve(
    playerId: string,
    payload: Partial<PveStartRequest>
  ): Promise<void> {
    if (!this.env.DB) {
      this.notifyToast(playerId, '数据库未就绪，无法入阵迎敌。');
      return;
    }
    if (this.findActiveDuelByPlayer(playerId)) {
      this.notifyToast(playerId, '道友正在切磋论道中，无法再开战。');
      return;
    }
    if (this.findActivePveByPlayer(playerId)) {
      this.notifyToast(playerId, '道友已在一场战斗中，请先了结当前战局。');
      return;
    }

    const battleType = payload.battleType === 'ENCOUNTER' ? 'ENCOUNTER' : 'DIALOGUE';

    try {
      let setup: PveSetup;
      if (battleType === 'ENCOUNTER') {
        const npcId = typeof payload.npcId === 'string' ? payload.npcId.trim() : '';
        if (!npcId) {
          this.notifyToast(playerId, '缺少强敌标识，无法入阵。');
          return;
        }
        setup = await preparePveEncounter(this.env.DB, playerId, npcId, {
          winNodeId: payload.winNodeId,
          loseNodeId: payload.loseNodeId,
          // 对话战斗选项发起时，玩家不一定站在战斗 NPC 所在地图，需跳过位置校验
          ignoreLocation: Boolean(payload.fromDialogue),
          // 对话选项引用的剧情战斗角色是 STORY_BATTLE，不是地图常驻 NPC
          allowStoryBattle: Boolean(payload.fromDialogue),
          storyContext: payload.storyContext,
        });
      } else {
        const monsterGroupId =
          typeof payload.monsterGroupId === 'string'
            ? payload.monsterGroupId.trim()
            : '';
        if (!monsterGroupId) {
          this.notifyToast(playerId, '缺少怪物组标识，无法入阵。');
          return;
        }
        setup = await preparePveDialogue(
          this.env.DB,
          playerId,
          monsterGroupId,
          payload.winNodeId,
          payload.loseNodeId,
          payload.storyContext
        );
      }

      // 异步建阵期间玩家可能掉线
      if (!this.playerSockets.get(playerId)?.size) return;

      this.startPveSession(playerId, setup);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '战斗准备失败，无法入阵。';
      console.error('[ZoneDO] PvE 开局异常:', err);
      this.notifyToast(playerId, msg);
    }
  }

  private startPveSession(playerId: string, setup: PveSetup): void {
    const pve: ActivePveState = {
      battleId: setup.battleId,
      playerId,
      setup,
      session: new DuelSession(
        new CombatEngine(),
        setup.playerFighters,
        setup.enemyFighters,
        PVE_MAX_ROUNDS,
        setup.skills,
        {
          battleMode: 'PVE',
          battleType: setup.battleType,
          allowEscape: setup.battleType !== 'DIALOGUE',
          findItem: async (_actorId, itemId) => {
            if (!this.env.DB) return null;
            const row = await this.env.DB.prepare(
              'SELECT id, item_id, item_name, count FROM inventory WHERE player_id = ? AND item_id = ? AND is_equipped = 0 LIMIT 1'
            ).bind(playerId, itemId).first<{ id: string; item_id: string; item_name: string; count: number }>();
            if (!row || row.count <= 0) return null;
            return {
              id: row.id,
              itemId: row.item_id,
              itemName: row.item_name,
              count: row.count,
              usable: true,
            };
          },
          deductItem: async (_actorId, itemId, count) => {
            if (!this.env.DB) return false;
            const row = await this.env.DB.prepare(
              'SELECT id, count FROM inventory WHERE player_id = ? AND item_id = ? AND is_equipped = 0 LIMIT 1'
            ).bind(playerId, itemId).first<{ id: string; count: number }>();
            if (!row || row.count < count) return false;
            if (row.count <= count) {
              await this.env.DB.prepare('DELETE FROM inventory WHERE id = ?').bind(row.id).run();
            } else {
              await this.env.DB.prepare(
                'UPDATE inventory SET count = count - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
              ).bind(count, row.id).run();
            }
            return true;
          },
        }
      ),
      player: {
        fighters: setup.playerFighters,
        view: setup.playerTeam,
      },
      enemy: {
        fighters: setup.enemyFighters,
        view: setup.enemyTeam,
      },
      playerActions: new Map(),
      round: 1,
      deadline: Date.now() + PVE_ACTION_TIMEOUT_MS,
      timer: null,
      logs: [],
      finished: false,
      resolving: false,
      timeoutMs: PVE_ACTION_TIMEOUT_MS,
    };

    this.activePves.set(pve.battleId, pve);
    const delivered = this.sendPveStart(pve);
    if (!delivered) {
      this.activePves.delete(pve.battleId);
      return;
    }
    this.armPveTimer(pve);
  }

  private sendPveStart(pve: ActivePveState): boolean {
    const payload: PveStartPayload = {
      battleId: pve.battleId,
      mode: 'PVE',
      battleType: pve.setup.battleType,
      group: pve.setup.group,
      playerTeam: pve.player.view,
      enemyTeam: pve.enemy.view,
      skills: pve.setup.skills,
      round: pve.round,
      deadline: pve.deadline,
      serverNow: Date.now(),
      timeoutMs: pve.timeoutMs,
      winNodeId: pve.setup.winNodeId,
      loseNodeId: pve.setup.loseNodeId,
      npc: pve.setup.npc
        ? {
            id: pve.setup.npc.id,
            name: pve.setup.npc.name,
            title: pve.setup.npc.title,
            avatar: pve.setup.npc.avatar,
            sceneId: pve.setup.npc.sceneId,
            battleLevel: pve.setup.npc.battleLevel,
          }
        : undefined,
      rewards: this.toPveRewards(pve.setup.rewards),
    };

    return this.sendTo(
      pve.playerId,
      createWsMessage<PveStartPayload>(
        MessageType.COMBAT,
        CombatAction.PVE_START,
        payload
      )
    );
  }

  /** 启动/重置 PvE 本回合超时时钟；超时未下令的单位自动普攻 */
  private armPveTimer(pve: ActivePveState): void {
    if (pve.timer) {
      clearTimeout(pve.timer);
      pve.timer = null;
    }

    const remaining = Math.max(0, pve.deadline - Date.now());
    pve.timer = setTimeout(() => {
      const live = this.activePves.get(pve.battleId);
      if (!live || live.finished) return;

      for (const fighter of live.session.allies) {
        if (fighter.hp > 0 && !live.playerActions.has(fighter.id)) {
          live.playerActions.set(fighter.id, { skillId: 'skill_basic_attack' });
        }
      }

      void this.resolvePveRound(live);
    }, remaining);
  }

  private async handlePveAction(
    playerId: string,
    payload: Partial<PveActionPayload>
  ): Promise<void> {
    const battleId = payload?.battleId;
    const pve = battleId ? this.activePves.get(battleId) : null;
    if (!pve || pve.playerId !== playerId || pve.finished) return;

    // 只接受当前回合的出招，避免过期/重复指令打乱节奏
    if (payload.round !== pve.round) return;

    const incoming = Array.isArray(payload.actions) ? payload.actions : [];
    if (incoming.length === 0) return;

    const aliveUnitIds = new Set(
      pve.session.allies.filter((f) => f.hp > 0).map((f) => f.id)
    );

    for (const action of incoming) {
      const unitId = action?.unitId || action?.actorId;
      if (!unitId || !aliveUnitIds.has(unitId)) continue;
      const actionType =
        action.actionType ||
        (action.itemId
          ? BattleActionType.USE_ITEM
          : action.skillId === 'skill_basic_attack'
          ? BattleActionType.NORMAL_ATTACK
          : BattleActionType.SKILL);
      const skillId = pve.setup.skills.some((skill) => skill.id === action.skillId)
        ? action.skillId
        : actionType === BattleActionType.NORMAL_ATTACK
        ? 'skill_basic_attack'
        : action.skillId;
      pve.playerActions.set(unitId, {
        unitId,
        actorId: unitId,
        actionType,
        skillId,
        itemId: action.itemId,
        targetId: action.targetId,
        targetIds: action.targetIds,
      });
    }

    // 未下令的单位补普攻，保证回合一定会推进（与切磋超时托管一致）
    for (const fighter of pve.session.allies) {
      if (fighter.hp > 0 && !pve.playerActions.has(fighter.id)) {
        pve.playerActions.set(fighter.id, { skillId: 'skill_basic_attack' });
      }
    }

    await this.resolvePveRound(pve);
  }

  /** 将引擎结算后的气血/内力同步到客户端展示阵容 */
  private syncPveViews(pve: ActivePveState): void {
    const sync = (fighters: Fighter[], view: CombatFighter[]) => {
      fighters.forEach((fighter, index) => {
        const target = view[index];
        if (!target) return;
        target.hp = fighter.hp;
        target.mp = fighter.mp;
        target.isAlive = fighter.hp > 0;
      });
    };
    sync(pve.session.allies, pve.player.view);
    sync(pve.session.enemies, pve.enemy.view);
  }

  /**
   * 结算一个 PvE 回合：
   * - 玩家指令来自 PVE_ACTION；
   * - 敌方由 DuelSession/CombatEngine 自动 AI 出招；
   * - 结束后按战斗来源落库（剧情 Flag / 遭遇奖励）。
   */
  private async resolvePveRound(pve: ActivePveState): Promise<void> {
    if (pve.finished || pve.resolving) return;
    pve.resolving = true;

    if (pve.timer) {
      clearTimeout(pve.timer);
      pve.timer = null;
    }

    const playedRound = pve.round;
    const result = await pve.session.playRound(pve.playerActions, new Map());
    pve.logs.push(...result.events);
    pve.playerActions = new Map();
    pve.round = playedRound + 1;
    this.syncPveViews(pve);

    const events = toCombatScriptEvents(result.events);
    pve.deadline = Date.now() + pve.timeoutMs;

    const finished = result.finished;
    const outcome: 'WIN' | 'LOSE' = result.winner === 'ALLY' ? 'WIN' : 'LOSE';
    let toasts: string[] = [];
    if (result.escaped) {
      toasts.push('施展遁地神术，已成功脱离战场！');
    }
    let rewards: PveRoundPayload['rewards'];

    if (finished) {
      pve.finished = true;
      this.activePves.delete(pve.battleId);

      try {
        if (this.env.DB) {
          if (pve.setup.battleType === 'ENCOUNTER' && pve.setup.npc) {
            const persisted = await persistPveEncounterResult(this.env.DB, {
              playerId: pve.playerId,
              battleId: pve.battleId,
              result: outcome,
              roundsCount: pve.session.roundsPlayed,
              logs: pve.logs,
              npc: pve.setup.npc,
              rewards: pve.setup.rewards,
              storyContext: pve.setup.storyContext,
            });
            toasts = persisted.toasts;
            rewards = this.toPveRewards(persisted.rewards);
          } else {
            await persistPveDialogueResult(this.env.DB, {
              playerId: pve.playerId,
              monsterGroupId: pve.setup.group.id,
              result: outcome,
              battleId: pve.battleId,
              roundsCount: pve.session.roundsPlayed,
              logs: pve.logs,
              storyContext: pve.setup.storyContext,
            });
          }
        }
      } catch (err) {
        console.error('[ZoneDO] PvE 战报/奖励落库失败:', err);
        toasts = [...toasts, '战报落库异常，请联系天机使核查。'];
      }
    }

    const payload: PveRoundPayload = {
      battleId: pve.battleId,
      round: playedRound,
      nextRound: pve.round,
      events,
      playerTeam: pve.player.view,
      enemyTeam: pve.enemy.view,
      finished,
      outcome: finished ? outcome : undefined,
      deadline: pve.deadline,
      serverNow: Date.now(),
      timeoutMs: pve.timeoutMs,
      roundCount: pve.session.roundsPlayed,
      toasts,
      rewards,
    };

    this.sendTo(
      pve.playerId,
      createWsMessage<PveRoundPayload>(
        MessageType.COMBAT,
        CombatAction.PVE_ROUND,
        payload
      )
    );

    if (!finished) {
      this.armPveTimer(pve);
    }

    pve.resolving = false;
  }

  /** 中止 PvE（主动退出/异常），清理定时器并通知客户端关闭战斗视口 */
  private abortPve(playerId: string, battleId?: string, reason = '战斗中止。'): void {
    const pve = battleId
      ? this.activePves.get(battleId)
      : this.findActivePveByPlayer(playerId);
    if (!pve || pve.playerId !== playerId) return;

    if (pve.setup.storyContext?.completeOnFinish && this.env.DB) {
      void completeStoryAfterBattle(this.env.DB, pve.playerId, pve.setup.storyContext);
    }

    if (pve.timer) {
      clearTimeout(pve.timer);
      pve.timer = null;
    }
    this.activePves.delete(pve.battleId);

    const payload: PveAbortPayload = { battleId: pve.battleId, reason };
    this.sendTo(
      pve.playerId,
      createWsMessage<PveAbortPayload>(
        MessageType.COMBAT,
        CombatAction.PVE_ABORT,
        payload
      )
    );
  }

  /**
   * 玩家长连接断开清理与持久化
   * 持久化时机：仅在玩家 webSocketClose 断开连接时，调用 ctx.waitUntil() 将其最后的 area_id 异步保存至 D1
   */
  private handlePlayerDisconnect(
    playerId: string,
    ws?: WebSocket,
    sessionId?: string
  ) {
    if (sessionId) {
      this.allSessions.delete(sessionId);
    }

    // 清理 playerSockets 映射
    const sockets = this.playerSockets.get(playerId);
    if (sockets && ws) {
      sockets.delete(ws);
      if (sockets.size > 0) {
        // 该玩家仍有其他活跃 Tab 连接，暂不视为彻底离线
        return;
      }
      this.playerSockets.delete(playerId);
    } else {
      this.playerSockets.delete(playerId);
    }

    // 清理该玩家相关的未完成切磋邀请
    for (const [id, duel] of this.pendingDuels.entries()) {
      if (duel.challengerId === playerId || duel.targetPlayerId === playerId) {
        this.pendingDuels.delete(id);
      }
    }

    // 中止该玩家参与中的实时切磋，避免对手无限等待
    for (const duel of Array.from(this.activeDuels.values())) {
      if (duel.challenger.playerId === playerId || duel.target.playerId === playerId) {
        const offlineName = this.activePlayers.get(playerId)?.name || '对方道友';
        this.abortDuel(duel, `道友【${offlineName}】已离线，切磋中止。`);
      }
    }

    // 清理该玩家进行中的 PvE 战斗（离线不结算，避免把半场战报当胜利落库）
    for (const pve of Array.from(this.activePves.values())) {
      if (pve.playerId === playerId) {
        if (pve.timer) {
          clearTimeout(pve.timer);
          pve.timer = null;
        }
        this.activePves.delete(pve.battleId);
      }
    }

    const player = this.activePlayers.get(playerId);
    if (!player) return;

    const lastAreaId = player.areaId;

    // 若不是内置 NPC，从内存活跃列表中移除
    if (!playerId.startsWith('comp_')) {
      this.activePlayers.delete(playerId);
    }

    // 向原区域其他道友广播玩家离开
    this.broadcastToArea(
      lastAreaId,
      createWsMessage(MessageType.SCENE, SceneAction.PLAYER_LEAVE, {
        playerId,
        areaId: lastAreaId,
      })
    );

    // 异步存盘：调用 ctx.waitUntil() 将其最后的 area_id 异步保存至 D1
    if (this.env.DB && !playerId.startsWith('comp_')) {
      const persistPromise = this.env.DB
        .prepare(
          'UPDATE players SET area_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        )
        .bind(lastAreaId, playerId)
        .run()
        .then(() => {
          console.log(
            `[ZoneDO] 修仙者 [${playerId}] 离线，最终驻留区域 [${lastAreaId}] 已异步持久化至 D1`
          );
        })
        .catch((err) => {
          console.error(`[ZoneDO] 异步持久化玩家 [${playerId}] 离线地点失败:`, err);
        });

      if (this.state && typeof this.state.waitUntil === 'function') {
        this.state.waitUntil(persistPromise);
      }
    }
  }

  /**
   * 向指定子区域 (areaId) 广播消息
   */
  public broadcastToArea(
    areaId: string,
    message: WsMessage<any> | Record<string, unknown>,
    excludePlayerId?: string
  ): void {
    const payloadStr =
      typeof message === 'string' ? message : JSON.stringify(message);

    for (const [pId, pState] of this.activePlayers.entries()) {
      if (pState.areaId === areaId && pId !== excludePlayerId) {
        const sockets = this.playerSockets.get(pId);
        if (sockets) {
          for (const ws of sockets) {
            if (ws.readyState === WebSocket.OPEN) {
              try {
                ws.send(payloadStr);
              } catch (e) {
                console.warn(`[ZoneDO] 向道友 [${pId}] 广播异常:`, e);
              }
            }
          }
        }
      }
    }

    // 兜底 Hibernation API
    if (typeof this.state.getWebSockets === 'function') {
      try {
        const doSockets = this.state.getWebSockets();
        for (const ws of doSockets) {
          if (ws.readyState === WebSocket.OPEN) {
            const att = ws.deserializeAttachment?.() as WsAttachment | null;
            if (att && att.areaId === areaId && att.playerId !== excludePlayerId) {
              const sockets = this.playerSockets.get(att.playerId);
              if (!sockets || !sockets.has(ws)) {
                try {
                  ws.send(payloadStr);
                } catch {}
              }
            }
          }
        }
      } catch {}
    }
  }

  /**
   * 全大区 (Zone) 广播辅助函数
   */
  public broadcast(
    message: WsMessage<any> | Record<string, unknown>,
    excludePlayerId?: string
  ): void {
    const payloadStr =
      typeof message === 'string' ? message : JSON.stringify(message);

    for (const [pId, sockets] of this.playerSockets.entries()) {
      if (pId !== excludePlayerId) {
        for (const ws of sockets) {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(payloadStr);
            } catch {}
          }
        }
      }
    }

    // 兜底 Hibernation API
    if (typeof this.state.getWebSockets === 'function') {
      try {
        const doSockets = this.state.getWebSockets();
        for (const ws of doSockets) {
          if (ws.readyState === WebSocket.OPEN) {
            const att = ws.deserializeAttachment?.() as WsAttachment | null;
            if (att && att.playerId !== excludePlayerId) {
              try {
                ws.send(payloadStr);
              } catch {}
            }
          }
        }
      } catch {}
    }
  }

  /**
   * 点对点精准私发
   */
  public sendTo(
    playerId: string,
    message: WsMessage<any> | Record<string, unknown>
  ): boolean {
    const payloadStr =
      typeof message === 'string' ? message : JSON.stringify(message);
    let delivered = false;

    if (playerId === '*' || playerId === 'all') {
      this.broadcast(message);
      return true;
    }

    const sockets = this.playerSockets.get(playerId);
    if (sockets) {
      for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(payloadStr);
            delivered = true;
          } catch {}
        }
      }
    }

    // 兜底 Hibernation API
    if (typeof this.state.getWebSockets === 'function') {
      try {
        const doSockets = this.state.getWebSockets();
        for (const ws of doSockets) {
          if (ws.readyState === WebSocket.OPEN) {
            const att = ws.deserializeAttachment?.() as WsAttachment | null;
            if (att && att.playerId === playerId) {
              try {
                ws.send(payloadStr);
                delivered = true;
              } catch {}
            }
          }
        }
      } catch {}
    }

    return delivered;
  }
}
