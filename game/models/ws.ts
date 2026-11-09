/**
 * WebSocket 统一协议与消息规范
 * 跨端 (Frontend / Backend) 共享类型定义
 */

import type {
  CombatFighter,
  CombatScriptEvent,
  CombatSkillInfo,
  CombatUnitAction,
} from './combat';

/**
 * WebSocket 主业务模块枚举
 */
export enum MessageType {
  // 战斗系统 (伤害、受击、技能、BUFF、切磋)
  COMBAT = 'COMBAT',

  // 系统公告与通知 (全服跑马灯、弹窗提醒、红点广播)
  NOTICE = 'NOTICE',

  // 邮件系统 (新邮件通知、附件状态流转)
  MAIL = 'MAIL',

  // 聊天传音 (区域、世界、门派、千里传音)
  CHAT = 'CHAT',

  // 社交系统 (道友私聊、传音、组队、结拜)
  SOCIAL = 'SOCIAL',

  // 场景与移动 (位置广播、地图切换、场景同步)
  MAP = 'MAP',

  // 场景大区与区域 (MUD离散区域移动、同道同步)
  SCENE = 'SCENE',

  // 玩家状态 (修为突破、灵石消耗、属性变更)
  PLAYER = 'PLAYER',

  // 长乐坊娱乐 (骰宝下注、开盘、结算)
  CASINO = 'CASINO',

  // AI 智能体 (环境观测极简流、NPC 行为推理订阅)
  AI = 'AI',

  // 系统与控制 (握手、心跳 PING/PONG、错误回执)
  SYSTEM = 'SYSTEM',
}

/**
 * 统一 WebSocket 消息包结构
 */
export interface WsMessage<T = unknown> {
  type: MessageType | keyof typeof MessageType;
  action: string;
  payload: T;
  timestamp: number;
}

/**
 * 战斗模块子指令与负载类型
 */
export const CombatAction = {
  COMBAT_START: 'COMBAT_START',
  COMBAT_DAMAGE: 'COMBAT_DAMAGE',
  COMBAT_HEAL: 'COMBAT_HEAL',
  COMBAT_SKILL: 'COMBAT_SKILL',
  COMBAT_END: 'COMBAT_END',

  // 玩家切磋比试协议
  DUEL_INVITE: 'DUEL_INVITE',
  DUEL_ACCEPT: 'DUEL_ACCEPT',
  DUEL_REJECT: 'DUEL_REJECT',
  DUEL_START: 'DUEL_START',
  /** 客户端提交本回合出招 */
  DUEL_ACTION: 'DUEL_ACTION',
  /** 服务端下发本回合双方出手战报 */
  DUEL_ROUND: 'DUEL_ROUND',
  /** 切磋中止（掉线/异常） */
  DUEL_ABORT: 'DUEL_ABORT',
  DUEL_CANCEL: 'DUEL_CANCEL',

  // 实时回合制 PvE 协议（NPC / 野怪 / 剧情战）
  /** 客户端请求开启实时 PvE 战斗 */
  PVE_START: 'PVE_START',
  /** 客户端提交本回合出招 */
  PVE_ACTION: 'PVE_ACTION',
  /** 服务端下发本回合战报 */
  PVE_ROUND: 'PVE_ROUND',
  /** PvE 中止（掉线/异常/主动退出） */
  PVE_ABORT: 'PVE_ABORT',
} as const;

export interface CombatDamagePayload {
  attackerId: string;
  attackerName: string;
  targetId: string;
  targetName: string;
  damage: number;
  isCrit?: boolean;
  skillName?: string;
  remainingHp?: number;
}

export interface CombatHealPayload {
  targetId: string;
  amount: number;
  sourceName?: string;
}

/** 切磋邀请载荷 */
export interface DuelInvitePayload {
  duelId: string;
  challengerId: string;
  challengerName: string;
  challengerAvatar?: string;
  challengerLevel: number;
  challengerRealm?: string;
  challengerCombatPower: number;
  targetPlayerId: string;
  expiresAt: number;
}

/** 切磋应答载荷 */
export interface DuelResponsePayload {
  duelId: string;
  challengerId: string;
  targetPlayerId: string;
  accept: boolean;
  reason?: string;
}

/** 切磋开始下发载荷（实时回合制） */
export interface DuelStartPayload {
  duelId: string;
  battleId: string;
  /** 实时回合制切磋 */
  mode: 'PVP';
  playerTeam: CombatFighter[];
  enemyTeam: CombatFighter[];
  /** 本场可操作技能清单 */
  skills: CombatSkillInfo[];
  round: number;
  /** 本回合出招截止时间（服务端时间戳，毫秒） */
  deadline: number;
  /** 服务端当前时间戳，用于客户端校正倒计时偏差 */
  serverNow: number;
  /** 每回合出招窗口（毫秒） */
  timeoutMs: number;
  opponent: {
    id: string;
    name: string;
    avatar?: string;
    level: number;
    realm?: string;
    combatPower: number;
  };
  /** 兼容旧字段（实时模式下不再使用） */
  script?: CombatScriptEvent[];
  outcome?: 'WIN' | 'LOSE';
}

/** 切磋出招指令载荷（每个存活单位一条，可整批提交） */
export interface DuelActionPayload {
  duelId: string;
  round: number;
  actions: CombatUnitAction[];
}

/** 切磋单回合战报载荷（服务端结算后同时下发给双方） */
export interface DuelRoundPayload {
  duelId: string;
  /** 本回合序号 */
  round: number;
  /** 下一回合序号（已结束时可忽略） */
  nextRound: number;
  events: CombatScriptEvent[];
  /** 客户端视角的己方阵容（含最新气血/内力） */
  playerTeam: CombatFighter[];
  /** 客户端视角的对方阵容 */
  enemyTeam: CombatFighter[];
  finished: boolean;
  /** 仅 finished=true 时下发，客户端视角的胜负 */
  outcome?: 'WIN' | 'LOSE';
  /** 下一回合出招截止时间（服务端时间戳，毫秒） */
  deadline: number;
  /** 服务端当前时间戳，用于客户端校正倒计时偏差 */
  serverNow: number;
  timeoutMs: number;
  /** 已进行回合数 */
  roundCount: number;
}

/** 切磋中止载荷（掉线、异常等） */
export interface DuelAbortPayload {
  duelId: string;
  reason: string;
}

/** PvE 战斗来源：剧情对话触发 / 地图 NPC 遭遇 */
export type PveBattleType = 'DIALOGUE' | 'ENCOUNTER';

/** PvE 胜利奖励（展示与最终下发共用的稳定结构） */
export interface PveRewards {
  exp: number;
  gold: number;
  silver: number;
  items: Array<{ id: string; name: string; count: number }>;
}

/** PvE 战场单位信息（地图强敌/剧情首领） */
export interface PveNpcInfo {
  id: string;
  name: string;
  title: string;
  avatar: string;
  sceneId: string;
  battleLevel: number;
}

/** 客户端请求开启 PvE 战斗（服务端据此组装阵容并下发 PveStartPayload） */
export interface PveStartRequest {
  battleType: PveBattleType;
  monsterGroupId?: string;
  npcId?: string;
  winNodeId?: string;
  loseNodeId?: string;
  /** 由对话战斗选项发起：跳过位置校验，并允许剧情战斗角色 STORY_BATTLE 参战 */
  fromDialogue?: boolean;
  /** 来源剧情节点；战斗结束没有胜/败节点时用于完成剧情 */
  storyContext?: {
    packageId: string;
    nodeId: string;
    completeOnFinish: boolean;
  };
}

/**
 * PvE 战斗开局下发载荷。
 * 与切磋共用同一套实时回合制操作面板，但只由当前玩家提交指令，
 * 敌方由服务端 AI 自动出招。
 */
export interface PveStartPayload {
  battleId: string;
  mode: 'PVE';
  battleType: PveBattleType;
  group: { id: string; name: string };
  playerTeam: CombatFighter[];
  enemyTeam: CombatFighter[];
  /** 本场可操作技能清单（与切磋同源：combat_skills / DUEL_SKILLS） */
  skills: CombatSkillInfo[];
  round: number;
  deadline: number;
  serverNow: number;
  timeoutMs: number;
  /** 剧情战胜利/失败后要打开的有向图节点 */
  winNodeId?: string;
  loseNodeId?: string;
  npc?: PveNpcInfo;
  /** 战前展示的胜利奖励；实际发放以服务端最终结算为准 */
  rewards?: PveRewards;
}

/** PvE 本回合出招载荷 */
export interface PveActionPayload {
  battleId: string;
  round: number;
  actions: CombatUnitAction[];
}

/** PvE 单回合战报载荷 */
export interface PveRoundPayload {
  battleId: string;
  /** 本回合序号 */
  round: number;
  /** 下一回合序号（已结束时可忽略） */
  nextRound: number;
  events: CombatScriptEvent[];
  playerTeam: CombatFighter[];
  enemyTeam: CombatFighter[];
  finished: boolean;
  /** 仅 finished=true 时下发 */
  outcome?: 'WIN' | 'LOSE';
  deadline: number;
  serverNow: number;
  timeoutMs: number;
  roundCount: number;
  /** 战斗结束时服务端下发的奖励/状态提示 */
  toasts?: string[];
  rewards?: PveRewards;
}

/** PvE 中止载荷 */
export interface PveAbortPayload {
  battleId: string;
  reason: string;
}

/**
 * 系统公告模块子指令与负载类型
 */
export const NoticeAction = {
  SYSTEM_ANNOUNCEMENT: 'SYSTEM_ANNOUNCEMENT',
  MARQUEE: 'MARQUEE',
  TOAST: 'TOAST',
  BADGE_UPDATE: 'BADGE_UPDATE',
} as const;

export interface NoticePayload {
  id?: string;
  /** 通知标题（玩家升级通知等业务可携带，轻量 Toast 会优先展示） */
  title?: string;
  content: string;
  level?: 'info' | 'warning' | 'broadcast' | 'urgent';
  duration?: number;
}

/**
 * 邮件模块子指令与负载类型
 */
export const MailAction = {
  MAIL_NEW: 'MAIL_NEW',
  MAIL_READ: 'MAIL_READ',
  MAIL_CLAIMED: 'MAIL_CLAIMED',
  MAIL_COUNT_SYNC: 'MAIL_COUNT_SYNC',
} as const;

export interface MailNewPayload {
  mailId: string;
  title: string;
  senderName: string;
  hasAttachment: boolean;
  unreadCount?: number;
  expireAt?: number;
}

export interface MailCountSyncPayload {
  unreadCount: number;
}

/**
 * 场景移动模块子指令与负载类型
 */
export const MapAction = {
  CHECK_IN: 'CHECK_IN',
  MOVE: 'MOVE',
  PLAYER_MOVED: 'PLAYER_MOVED',
  MAP_SYNC: 'MAP_SYNC',
} as const;

export interface MapSyncPayload {
  mapId: string;
  onlineCount: number;
  humansCount?: number;
  agentsCount?: number;
}

export interface PlayerMovedPayload {
  playerId: string;
  coords: [number, number];
}

/**
 * MUD 离散区域场景模块子指令与负载类型 (ZoneDO)
 */
export const SceneAction = {
  CHANGE_AREA: 'CHANGE_AREA',
  PLAYER_ENTER: 'PLAYER_ENTER',
  PLAYER_LEAVE: 'PLAYER_LEAVE',
  AREA_PLAYERS: 'AREA_PLAYERS',
  SYNC_AREA: 'SYNC_AREA',
} as const;

export interface ChangeAreaPayload {
  areaId: string;
}

export interface AreaPlayerInfo {
  id: string;
  name: string;
  areaId: string;
  avatar?: string;
  level?: number;
  realm?: string;
  title?: string;
}

export interface PlayerEnterPayload {
  player: AreaPlayerInfo;
  areaId: string;
}

export interface PlayerLeavePayload {
  playerId: string;
  areaId: string;
}

export interface AreaPlayersPayload {
  areaId: string;
  players: AreaPlayerInfo[];
}

/**
 * 聊天传音模块子指令与负载类型
 */
export const ChatAction = {
  CHAT_SEND: 'CHAT_SEND',
  CHAT_BROADCAST: 'CHAT_BROADCAST',
  CHAT_WHISPER: 'CHAT_WHISPER',
} as const;

export interface ChatBroadcastPayload {
  id?: string;
  channel: 'world' | 'local' | 'sect' | 'trade' | 'system';
  senderId?: string;
  senderName: string;
  text: string;
  timestamp: number;
}

/**
 * 玩家状态同步负载
 */
export interface PlayerSyncPayload {
  playerId: string;
  changes: Record<string, unknown>;
}

/**
 * 工厂函数：构建统一的 WsMessage
 */
export function createWsMessage<T>(
  type: MessageType,
  action: string,
  payload: T,
  timestamp: number = Date.now()
): WsMessage<T> {
  return {
    type,
    action,
    payload,
    timestamp,
  };
}
