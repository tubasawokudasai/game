import { PlayerProfile, InventoryItem, PartyMember, NpcEntity, MapSceneInfo, MailItem, FullPlayerDetail, QiankunBagResponse, FriendItem, FriendRequestItem, FriendStatus, ActiveStoryItem } from '../types/game';
import { DialogueRenderPayload, DialogueInteractResult } from '../types/dialogue';
import type { CombatFighter, CombatScriptEvent } from '../types/combat';
import type {
  PharmacyInfoResponse,
  PharmacyHealResponse,
  PharmacyBuyResponse,
  PharmacyCraftResponse,
} from '../types/pharmacy';

const API_BASE = '/api';

/**
 * 获取本地存储的认证 Token
 */
export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('game_token');
}

/**
 * 严格的网络 JSON 请求封装：
 * 1. 自动携带当前玩家 JWT Bearer Token (从 localStorage 中读取)
 * 2. 绝不使用任何代码层 Mock 假数据
 * 3. 若后端返回 HTTP 4xx / 5xx 或非 JSON 响应，直接抛出严格异常
 */
async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string>),
  };

  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    throw new Error(`服务响应异常 (HTTP ${res.status}): ${text.slice(0, 100)}`);
  }

  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401 || (res.status === 404 && url.includes('/player/'))) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('game_token');
      }
    }
    const errMsg =
      (data as { error?: string; message?: string }).error ||
      (data as { message?: string }).message ||
      `请求失败 (HTTP ${res.status})`;
    throw new Error(errMsg);
  }

  return data as T;
}

/**
 * 游戏客户端 API 服务层
 */
export const gameApi = {
  // ============================================================================
  // 1. 认证与账号体系 API (免登录、转正升级、账号合并)
  // ============================================================================

  /**
   * 匿名游客免登录：提交设备 ID 换取 JWT Token
   */
  async guestLogin(deviceId: string): Promise<{
    token: string;
    isNewGuest: boolean;
    player: PlayerProfile;
  }> {
    return await fetchJson(`${API_BASE}/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId }),
    });
  },

  /**
   * 账号升级 (原地转正)：将当前匿名游客转为正式账号
   */
  async registerFormal(
    username: string,
    password: string
  ): Promise<{
    success: boolean;
    token: string;
    player: PlayerProfile;
    message: string;
  }> {
    return await fetchJson(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  },

  /**
   * 现有账号合并：将当前匿名游客的资产与背包数据合并至已有老账号
   */
  async mergeAccount(
    username: string,
    password: string
  ): Promise<{
    success: boolean;
    token: string;
    player: PlayerProfile;
    message: string;
    mergeSummary: {
      mergedSilver: number;
      mergedCopper: number;
      mergedIngot: number;
      movedItemCount: number;
      movedMailCount: number;
    };
  }> {
    return await fetchJson(`${API_BASE}/auth/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  },

  /**
   * 正式账号直接登录 (不进行合并)
   */
  async loginFormal(
    username: string,
    password: string
  ): Promise<{
    success: boolean;
    token: string;
    player: PlayerProfile;
  }> {
    return await fetchJson(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  },

  // ============================================================================
  // 2. 玩家与背包 API
  // ============================================================================

  /**
   * 获取当前已登录玩家全息资料 (优先从 JWT 解析，亦支持指定 playerId)
   */
  async getCurrentPlayer(playerId?: string): Promise<PlayerProfile> {
    const url = playerId
      ? `${API_BASE}/player/me?playerId=${encodeURIComponent(playerId)}`
      : `${API_BASE}/player/me`;
    const data = await fetchJson<{ player: PlayerProfile }>(url);
    return data.player;
  },

  /**
   * 修改当前玩家基本资料 (名称、头像、个性签名)
   */
  async updateProfile(params: {
    nickname?: string;
    avatar?: string;
    signature?: string;
  }): Promise<{
    success: boolean;
    message: string;
    player: PlayerProfile;
  }> {
    return await fetchJson<{
      success: boolean;
      message: string;
      player: PlayerProfile;
    }>(`${API_BASE}/player/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  },

  /**
   * 获取玩家背包装备列表
   */
  async getInventory(playerId?: string): Promise<InventoryItem[]> {
    const url = playerId
      ? `${API_BASE}/player/inventory?playerId=${encodeURIComponent(playerId)}`
      : `${API_BASE}/player/inventory`;
    const data = await fetchJson<{ items: InventoryItem[] }>(url);
    return data.items || [];
  },

  /**
   * 获取乾坤行囊完整数据（包含容量、动态分类列表与物品全量富属性）
   */
  async getQiankunBag(category?: string, equipped?: 'all' | 'true' | 'false'): Promise<QiankunBagResponse> {
    const params = new URLSearchParams();
    if (category && category !== 'ALL') params.append('category', category);
    if (equipped) params.append('equipped', equipped);
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    return await fetchJson<QiankunBagResponse>(`${API_BASE}/player/inventory${queryStr}`);
  },

  /**
   * 服用/使用行囊丹药消耗品
   */
  async useInventoryItem(inventoryId: string, count: number = 1): Promise<{
    success: boolean;
    message: string;
    usedItem: { id: string; itemName: string; usedCount: number; remainingCount: number };
    effects: Record<string, any>;
    player: Partial<PlayerProfile>;
  }> {
    return await fetchJson(`${API_BASE}/player/inventory/use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inventoryId, count }),
    });
  },

  /**
   * 穿戴行囊中的神兵装备
   */
  async equipInventoryItem(inventoryId: string): Promise<{
    success: boolean;
    message: string;
    equippedItem: { id: string; itemName: string; slot?: string };
    replacedItem?: { id: string; itemName: string; slot?: string } | null;
    newCombatPower: number;
  }> {
    return await fetchJson(`${API_BASE}/player/inventory/equip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inventoryId }),
    });
  },

  /**
   * 卸下已穿戴的神兵存回行囊
   */
  async unequipInventoryItem(inventoryId: string): Promise<{
    success: boolean;
    message: string;
    unequippedItem: { id: string; itemName: string; slot?: string };
    newCombatPower: number;
  }> {
    return await fetchJson(`${API_BASE}/player/inventory/unequip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inventoryId }),
    });
  },

  /**
   * 规整理顺乾坤行囊
   */
  async tidyInventory(): Promise<{ success: boolean; message: string; mergedCount: number }> {
    return await fetchJson(`${API_BASE}/player/inventory/tidy`, {
      method: 'POST',
    });
  },

  /**
   * 丢弃行囊物品
   */
  async discardInventoryItem(inventoryId: string, count: number = 1): Promise<{ success: boolean; message: string }> {
    return await fetchJson(`${API_BASE}/player/inventory/discard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inventoryId, count }),
    });
  },

  /**
   * 获取任意道友全息档案 (含真实穿戴神兵、江湖生平纪事、点赞状态与是否为自身)
   */
  async getPlayerProfile(playerId: string): Promise<FullPlayerDetail> {
    return await fetchJson<FullPlayerDetail>(`${API_BASE}/player/profile/${encodeURIComponent(playerId)}`);
  },

  /**
   * 为道友赞叹/点赞
   */
  async likePlayer(playerId: string): Promise<{ success: boolean; likesCount: number; hasLiked: boolean; message: string }> {
    return await fetchJson<{ success: boolean; likesCount: number; hasLiked: boolean; message: string }>(
      `${API_BASE}/player/${encodeURIComponent(playerId)}/like`,
      { method: 'POST' }
    );
  },

  /**
   * 获取同道小队成员列表
   */
  async getPartyMembers(playerId?: string): Promise<PartyMember[]> {
    const url = playerId
      ? `${API_BASE}/player/party?playerId=${encodeURIComponent(playerId)}`
      : `${API_BASE}/player/party`;
    const data = await fetchJson<{ members: PartyMember[] }>(url);
    return data.members || [];
  },

  /**
   * 切换队伍成员的出战 / 休息状态
   * PATCH /api/player/party/:memberKey
   */
  async updatePartyMemberStatus(
    memberKey: string,
    isActive: boolean
  ): Promise<{ success: boolean; message: string; members: PartyMember[] }> {
    return await fetchJson<{ success: boolean; message: string; members: PartyMember[] }>(
      `${API_BASE}/player/party/${encodeURIComponent(memberKey)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      }
    );
  },

  /**
   * 跨州/跨大区神行传送
   * POST /api/travel/teleport
   */
  async teleport(
    targetZoneId: string,
    targetAreaId?: string
  ): Promise<{
    success: boolean;
    message: string;
    zoneId: string;
    areaId: string;
    costSummary: string;
  }> {
    return await fetchJson(`${API_BASE}/travel/teleport`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetZoneId, targetAreaId }),
    });
  },

  /**
   * 获取全九州所有场景元数据列表
   */
  async getAllMaps(): Promise<MapSceneInfo[]> {
    const res = await fetchJson<{ scenes: MapSceneInfo[] }>(`${API_BASE}/map`);
    return res.scenes || [];
  },

  /**
   * 获取当前场景地图详情及常驻 NPC 列表
   */
  async getMapDetails(mapId: string): Promise<{ scene: MapSceneInfo; npcs: NpcEntity[] }> {
    return await fetchJson<{ scene: MapSceneInfo; npcs: NpcEntity[] }>(
      `${API_BASE}/map/${encodeURIComponent(mapId)}`
    );
  },

  /**
   * 获取玩家进行中的任务（/features 任务入口）
   */
  async getActiveStory(): Promise<ActiveStoryItem[]> {
    const res = await fetchJson<{ success: boolean; data: ActiveStoryItem[] }>(
      `${API_BASE}/player/story/active`
    );
    return res.data || [];
  },

  /**
   * 启动 NPC 有向图树对话
   * 玩家身份由请求头中的 JWT 决定，不接受前端传入 playerId
   */
  async startDialogue(
    npcIdOrKey?: string,
    nodeId?: string
  ): Promise<DialogueRenderPayload> {
    return await fetchJson(`${API_BASE}/npc/dialogue/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ npcId: npcIdOrKey, nodeId }),
    });
  },

  /**
   * 无分支直连推进：在当前节点最后一页点击「继续」
   */
  async advanceDialogue(currentNodeId: string): Promise<DialogueInteractResult> {
    return await fetchJson(`${API_BASE}/npc/dialogue/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentNodeId }),
    });
  },

  /**
   * 选择 NPC 对话选项
   */
  async selectDialogueOption(
    currentNodeId: string,
    optionId: string
  ): Promise<DialogueInteractResult> {
    return await fetchJson(`${API_BASE}/npc/dialogue/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentNodeId, optionId }),
    });
  },

  /**
   * 战前准备：取回本场战斗的双方阵容（我方来自出战队伍，敌方来自怪物组模版）
   * POST /api/combat/prepare
   */
  async prepareCombat(monsterGroupId: string): Promise<{
    group: { id: string; name: string };
    playerTeam: CombatFighter[];
    enemyTeam: CombatFighter[];
  }> {
    return await fetchJson(`${API_BASE}/combat/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monsterGroupId }),
    });
  },

  /**
   * 战斗结算：胜负、战报与奖励资格一律由服务端判定
   * POST /api/combat/settle
   */
  async settleCombat(
    monsterGroupId: string,
    winNodeId?: string,
    loseNodeId?: string
  ): Promise<{
    result: 'WIN' | 'LOSE';
    group: { id: string; name: string };
    roundsCount: number;
    script: CombatScriptEvent[];
    playerTeam: CombatFighter[];
    enemyTeam: CombatFighter[];
    winNodeId?: string;
    loseNodeId?: string;
    battleId: string;
    position: { zoneId: string; areaId: string };
  }> {
    return await fetchJson(`${API_BASE}/combat/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monsterGroupId, winNodeId, loseNodeId }),
    });
  },

  /**
   * 地图 NPC 野怪直战前置准备
   * POST /api/combat/encounter/prepare
   */
  async prepareEncounter(npcId: string): Promise<{
    group: { id: string; name: string };
    playerTeam: CombatFighter[];
    enemyTeam: CombatFighter[];
    npc: {
      id: string;
      name: string;
      title: string;
      avatar: string;
      sceneId: string;
      battleLevel: number;
    };
  }> {
    return await fetchJson(`${API_BASE}/combat/encounter/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ npcId }),
    });
  },

  /**
   * 地图 NPC 野怪直战推演与结算
   * POST /api/combat/encounter/settle
   */
  async settleEncounter(npcId: string): Promise<{
    result: 'WIN' | 'LOSE';
    group: { id: string; name: string };
    roundsCount: number;
    script: CombatScriptEvent[];
    playerTeam: CombatFighter[];
    enemyTeam: CombatFighter[];
    battleId: string;
    npc: {
      id: string;
      name: string;
      title: string;
      avatar: string;
      sceneId: string;
      battleLevel: number;
    };
    rewards?: {
      exp: number;
      gold: number;
      silver: number;
      items: Array<{ id: string; name: string; count: number }>;
    };
    toasts: string[];
  }> {
    return await fetchJson(`${API_BASE}/combat/encounter/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ npcId }),
    });
  },

  /**
   * 获取内容预设（头像立绘目录 + 道号取名库）
   * GET /api/player/presets
   */
  async getPresets(): Promise<{
    avatars: Array<{ id: string; name: string; role: string; url: string }>;
    names: string[];
  }> {
    return await fetchJson(`${API_BASE}/player/presets`);
  },

  /**
   * 获取指定场景内的坊市/名胜画卷
   * GET /api/map/venues?sceneId=square
   */
  async getVenues(sceneId: string): Promise<{
    venues: Array<{
      id: string;
      name: string;
      badge: string;
      tag: string;
      desc: string;
      chips: string[];
      actionNotice: string;
      img: string;
    }>;
  }> {
    return await fetchJson(`${API_BASE}/map/venues?sceneId=${encodeURIComponent(sceneId)}`);
  },

  /**
   * 获取玩家收件箱邮件列表
   */
  async getMails(playerId?: string): Promise<MailItem[]> {
    const url = playerId
      ? `${API_BASE}/mails?playerId=${encodeURIComponent(playerId)}`
      : `${API_BASE}/mails`;
    const data = await fetchJson<{ mails: MailItem[] }>(url);
    return data.mails || [];
  },

  /**
   * 提取指定邮件附件道具与资产
   */
  async claimMailAttachment(
    mailId: string
  ): Promise<{ success: boolean; message: string }> {
    return await fetchJson(`${API_BASE}/mails/claim/${encodeURIComponent(mailId)}`, {
      method: 'POST',
    });
  },

  /**
   * 发送带附件或货币的交易信函
   */
  async sendMail(payload: {
    receiverId: string;
    title: string;
    content: string;
    attachmentInventoryId?: string;
    attachedSilver?: number;
    attachedIngot?: number;
  }): Promise<{ success: boolean; message: string; mailId: string }> {
    return await fetchJson(`${API_BASE}/mails/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  // ============================================================================
  // 仙友与社交系统 API
  // ============================================================================

  /**
   * 获取当前玩家的仙友名册
   */
  async getFriends(): Promise<FriendItem[]> {
    const data = await fetchJson<{ friends: FriendItem[] }>(`${API_BASE}/friends`);
    return data.friends || [];
  },

  /**
   * 获取当前玩家收到的结交申请
   */
  async getFriendRequests(): Promise<FriendRequestItem[]> {
    const data = await fetchJson<{ requests: FriendRequestItem[] }>(`${API_BASE}/friends/requests`);
    return data.requests || [];
  },

  /**
   * 查询与目标道友的结交关系
   */
  async getFriendStatus(targetPlayerId: string): Promise<FriendStatus> {
    return await fetchJson<FriendStatus>(`${API_BASE}/friends/status/${encodeURIComponent(targetPlayerId)}`);
  },

  /**
   * 发送结交名帖 (申请添加好友)
   */
  async sendFriendRequest(
    targetPlayerId: string,
    message?: string
  ): Promise<{ success: boolean; message: string; requestId?: string; isAlreadyFriends?: boolean }> {
    return await fetchJson(`${API_BASE}/friends/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetPlayerId, message }),
    });
  },

  /**
   * 同意结交申请 (正式结为仙友)
   */
  async acceptFriendRequest(payload: {
    requestId?: string;
    senderId?: string;
    mailId?: string;
  }): Promise<{ success: boolean; message: string; friend?: FriendItem }> {
    return await fetchJson(`${API_BASE}/friends/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  /**
   * 婉言谢绝结交申请
   */
  async rejectFriendRequest(payload: {
    requestId?: string;
    senderId?: string;
    mailId?: string;
  }): Promise<{ success: boolean; message: string }> {
    return await fetchJson(`${API_BASE}/friends/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  /**
   * 解除仙友羁绊
   */
  async removeFriend(friendId: string): Promise<{ success: boolean; message: string }> {
    return await fetchJson(`${API_BASE}/friends/${encodeURIComponent(friendId)}`, {
      method: 'DELETE',
    });
  },

  /**
   * 寻访同道修士
   */
  async searchPlayers(query: string): Promise<Array<{
    id: string;
    nickname: string;
    avatar: string;
    level: number;
    realm: string;
    sect: string;
    combatPower: number;
    title?: string;
    isFriend: boolean;
  }>> {
    const data = await fetchJson<{ players: any[] }>(`${API_BASE}/friends/search?q=${encodeURIComponent(query)}`);
    return data.players || [];
  },

  // ============================================================================
  // 9. 悬壶馆 API (回春疗伤、天阶药阁购药、丹药炼制)
  // ============================================================================

  /**
   * 获取悬壶馆全貌信息
   */
  async getPharmacyInfo(): Promise<PharmacyInfoResponse> {
    return await fetchJson<PharmacyInfoResponse>(`${API_BASE}/pharmacy/info`);
  },

  /**
   * 药王孙真人 · 全队回春疗伤
   */
  async healParty(): Promise<PharmacyHealResponse> {
    return await fetchJson<PharmacyHealResponse>(`${API_BASE}/pharmacy/heal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  },

  /**
   * 悬壶药阁 · 购入丹药
   */
  async buyPharmacyMedicine(
    itemId: string,
    count: number = 1
  ): Promise<PharmacyBuyResponse> {
    return await fetchJson<PharmacyBuyResponse>(`${API_BASE}/pharmacy/buy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, count }),
    });
  },

  /**
   * 神农药鼎 · 丹药炼制
   */
  async craftPharmacyMedicine(
    recipeId: string,
    count: number = 1
  ): Promise<PharmacyCraftResponse> {
    return await fetchJson<PharmacyCraftResponse>(`${API_BASE}/pharmacy/craft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipeId, count }),
    });
  },
};
