/**
 * 游戏核心实体类型定义
 * 与后端 D1 数据库结构 (schema.sql) 及 Durable Objects 协议严格对齐
 */

// 1. 玩家数据结构
export interface PlayerProfile {
  id: string;
  username?: string | null;
  nickname: string;
  level: number;
  exp: number;
  maxExp?: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  combatPower: number;
  sect: string;
  sectPosition?: string;
  realm: string;
  vipLevel?: number;
  spiritualRoot?: string;
  reputation?: string;
  residence?: string;
  likesCount?: number;
  silver: number;
  ingot: number;
  copper: number;
  zoneId?: string;
  areaId?: string;
  currentMap?: string;
  coordX?: number;
  coordY?: number;
  signature: string;
  avatar: string;
  title: string;
  status: 'ONLINE' | 'OFFLINE' | 'MEDITATING' | 'MERGED';
  createdAt?: string;
  isGuest?: boolean;
  deviceId?: string;
  accountId?: string;
}

// 2. 装备与行囊物品结构
export type ItemType = 'EQUIPMENT' | 'CONSUMABLE' | 'MEDICINE' | 'MATERIAL' | 'SPECIAL' | string;
export type EquipSlot = 'WEAPON' | 'HELMET' | 'ARMOR' | 'BOOTS' | 'ARTIFACT';
export type ItemQuality = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'MYTHIC';

export interface ItemActions {
  canUse?: boolean;
  canEquip?: boolean;
  canUnequip?: boolean;
  canDiscard?: boolean;
  canSell?: boolean;
}

export interface InventoryItem {
  id: string;
  playerId: string;
  itemId: string;
  itemName: string;
  itemType: ItemType;
  category?: string;
  categoryName?: string;
  categoryIcon?: string;
  count: number;
  isEquipped: boolean;
  slot?: EquipSlot;
  quality: ItemQuality;
  stats?: Record<string, number | string>;
  enhanceLevel: number;
  description?: string;
  actions?: ItemActions;
}

export interface BagCategory {
  code: string;
  name: string;
  icon: string;
  count: number;
  description?: string;
}

export interface BagCapacity {
  total: number;
  used: number;
  free: number;
  isFull: boolean;
}

export interface QiankunBagResponse {
  success: boolean;
  capacity: BagCapacity;
  categories: BagCategory[];
  items: InventoryItem[];
  playerSummary?: {
    hp: number;
    maxHp: number;
    mp: number;
    maxMp: number;
    silver: number;
    ingot: number;
    copper: number;
    combatPower: number;
  };
}

export interface PlayerChronicle {
  id: string;
  title: string;
  year: string;
  content: string;
  orderIndex?: number;
}

export interface FullPlayerDetail {
  player: PlayerProfile;
  equippedItems: InventoryItem[];
  chronicles: PlayerChronicle[];
  isSelf: boolean;
  hasLiked?: boolean;
  isCompanion?: boolean;
}

// 3. 随从/队友数据结构
export interface PartyMember {
  id: string;
  name: string;
  title: string;
  avatar: string;
  role: 'LEADER' | 'DPS' | 'HEALER' | 'TANK';
  realm: string;
  level: number;
  isLeader?: boolean;
  /** 是否出战：false 表示在队伍列表中休息待命 */
  isActive?: boolean;
  hp?: number;
  maxHp?: number;
  mp?: number;
  maxMp?: number;
  combatPower?: number;
}

// 4. 场景 NPC 数据结构
export type NpcType = 'dialogue' | 'battle' | string;

export interface NpcEnemyPreview {
  id?: string;
  name: string;
  avatar: string;
  position: 'FRONT' | 'BACK';
  slotIndex: number;
  isBoss: boolean;
  hp: number;
  maxHp: number;
}

export interface NpcEntity {
  id: string;
  key: string;
  name: string;
  badge?: string;
  title: string;
  avatar: string;
  type?: NpcType;
  greeting?: string;
  templateId?: string;
  templateName?: string;
  /** SOLO：未绑定战阵的单人强敌；GROUP：多敌战阵 */
  battleMode?: 'SOLO' | 'GROUP';
  battleGroupId?: string;
  battleGroupName?: string;
  battleLevel?: number;
  battleReward?: {
    exp?: number;
    gold?: number;
    silver?: number;
    items?: Array<{ id: string; name: string; count: number }>;
  };
  respawnSeconds?: number;
  onceFlag?: string;
  canFight?: boolean;
  cooldownRemaining?: number;
  enemyPreview?: NpcEnemyPreview[];
  /** 剧情 NPC：由 npc_instances.npc_role='STORY' 且 scene_id 匹配当前场景时显示 */
  isStoryNpc?: boolean;
  storyPackageId?: string;
  npcRole?: 'MAP' | 'STORY' | 'STORY_BATTLE';
  ownerPlayerId?: string;
  posX?: number;
  posY?: number;
}

/** 进行中的任务（/features 任务入口） */
export interface ActiveStoryNpc {
  id: string;
  key: string;
  name: string;
  badge?: string;
  title?: string;
  avatar?: string;
}

export interface ActiveStoryItem {
  packageId: string;
  packageName: string;
  category: string;
  packageDescription?: string;
  nodeId: string;
  chapterTitle: string;
  content: string;
  quoteBox?: string;
  sceneId?: string | null;
  sceneName?: string;
  npc?: ActiveStoryNpc | null;
  updatedAt?: string;
}

// 5. 聊天消息结构
export type ChatChannel = 'all' | 'world' | 'local' | 'sect' | 'trade' | 'system';

export interface ChatMessage {
  id: string | number;
  channel: 'world' | 'local' | 'sect' | 'trade' | 'system';
  senderId?: string;
  senderName: string;
  text: string;
  timestamp: number;
  timeFormatted?: string;
}

// 6. 地图场景信息
export interface MapSceneInfo {
  mapId: string;
  name: string;
  region: string;
  level?: number;
  parentId?: string | null;
  icon?: string;
  coords: [number, number];
  statusDesc: string;
  onlineCount: number;
  tag?: string;
  subtitle?: string;
  thumb?: string;
  backgroundUrl?: string;
  desc?: string;
  feature?: string;
  cost?: string;
  btnText?: string;
}

// 7. 飞鸽传书邮件结构
// 附件由后端按 grant_type 解析为统一视图，前端不感知具体发放类型的分支逻辑。
export type MailGrantType = 'ITEM' | 'COMPANION' | 'CURRENCY' | 'EQUIPMENT';

export interface MailAttachmentItem {
  id: string;
  grantType: MailGrantType | string;
  name: string;
  count: number;
  silver: number;
  ingot: number;
  copper: number;
  itemId?: string;
  itemType?: string;
  quality?: string;
  level?: number;
  realm?: string;
  role?: string;
  avatar?: string;
  description?: string;
}

export interface MailItem {
  id: string;
  senderId?: string | null;
  senderName: string;
  receiverId: string;
  title: string;
  content: string;
  mailType: 'SYSTEM' | 'PLAYER' | 'TRADE';
  hasAttachment: boolean;
  isRead: boolean;
  isClaimed: boolean;
  expireAt: number;
  createdAt: string;
  attachments?: MailAttachmentItem[];
}

// 8. 仙友与社交系统结构
export interface FriendItem {
  friendshipId: string;
  friendId: string;
  nickname: string;
  avatar: string;
  level: number;
  realm: string;
  sect: string;
  sectPosition?: string;
  combatPower: number;
  title?: string;
  signature?: string;
  status: string;
  createdAt: string;
}

export interface FriendRequestItem {
  requestId: string;
  senderId: string;
  nickname: string;
  avatar: string;
  level: number;
  realm: string;
  sect: string;
  combatPower: number;
  title?: string;
  status: string;
  mailId?: string;
  createdAt: string;
}

export interface FriendStatus {
  isFriend: boolean;
  isPending: boolean;
  hasIncoming: boolean;
  requestId?: string;
}

