/**
 * 后端核心领域模型类型定义
 */

export interface PlayerRecord {
  id: string;
  username?: string | null;
  account_id?: string | null;
  password_hash?: string | null;
  is_guest: number;
  device_id?: string | null;
  nickname: string;
  level: number;
  exp: number;
  hp: number;
  max_hp: number;
  mp: number;
  max_mp: number;
  combat_power: number;
  sect: string;
  sect_position?: string;
  realm: string;
  vip_level?: number;
  spiritual_root?: string;
  reputation?: string;
  residence?: string;
  likes_count?: number;
  silver: number;
  ingot: number;
  copper: number;
  zone_id: string;
  area_id: string;
  current_map?: string;
  coord_x?: number;
  coord_y?: number;
  signature: string;
  avatar: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface InventoryRecord {
  id: string;
  player_id: string;
  item_id: string;
  item_name: string;
  item_type: 'EQUIPMENT' | 'CONSUMABLE' | 'MATERIAL' | 'SPECIAL';
  count: number;
  is_equipped: number;
  slot?: string;
  quality: string;
  stats?: string; // JSON string
  enhance_level: number;
  created_at: string;
  updated_at: string;
}

export interface MailRecord {
  id: string;
  sender_id?: string | null;
  sender_name: string;
  receiver_id: string;
  title: string;
  content: string;
  mail_type: 'SYSTEM' | 'PLAYER' | 'TRADE';
  has_attachment: number;
  is_read: number;
  is_claimed: number;
  expire_at: number;
  created_at: string;
}

export interface MailAttachmentRecord {
  id: string;
  mail_id: string;
  item_id?: string | null;
  item_snapshot?: string | null;
  count: number;
  silver: number;
  ingot: number;
  /** 发放类型：ITEM / COMPANION / CURRENCY，后续可扩展 EQUIPMENT 等 */
  grant_type?: string | null;
  /** 类型专属参数 JSON，领取时由 grantService 按类型分派 */
  grant_payload?: string | null;
  claimed_at?: string | null;
  created_at: string;
}

export interface CasinoRoundRecord {
  round_id: string;
  round_number: number;
  status: 'BETTING' | 'SETTLING' | 'COMPLETED';
  dice_1?: number;
  dice_2?: number;
  dice_3?: number;
  dice_sum?: number;
  result_type?: 'SMALL' | 'BIG' | 'TRIPLE';
  total_pool: number;
  total_payout: number;
  start_time: number;
  end_time: number;
  created_at: string;
}

export interface CasinoBetRecord {
  bet_id: string;
  round_id: string;
  player_id: string;
  player_name: string;
  bet_type: 'BIG' | 'SMALL' | 'TRIPLE' | 'POINT';
  bet_value?: string;
  bet_amount: number;
  odds: number;
  payout: number;
  is_won: number;
  created_at: string;
}

export interface SceneRecord {
  id: string;
  name: string;
  region: string;
  level?: number;
  parent_id?: string | null;
  icon?: string;
  coord_x: number;
  coord_y: number;
  status_desc: string;
  tag?: string;
  subtitle?: string;
  thumb?: string;
  background_url?: string;
  description?: string;
  feature?: string;
  cost_desc?: string;
  btn_text?: string;
  created_at?: string;
  updated_at?: string;
}

export interface NpcRecord {
  id: string;
  scene_id: string;
  key: string;
  name: string;
  title: string;
  avatar?: string | null;
  type?: string;
  quote?: string;
  gossip?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PlayerChronicleRecord {
  id: string;
  player_id: string;
  title: string;
  year: string;
  content: string;
  order_index: number;
  created_at: string;
}

export interface PlayerLikeRecord {
  id: string;
  player_id: string;
  liker_id: string;
  created_at: string;
}

export interface PartyMemberRecord {
  id: string;
  player_id: string;
  /** 具体 NPC 实例 ID (npc_instances.npc_id)，不是模板 ID */
  member_key: string;
  member_name: string;
  title?: string | null;
  avatar?: string | null;
  role: 'LEADER' | 'DPS' | 'HEALER' | 'TANK';
  realm?: string | null;
  level: number;
  sort_order: number;
  is_active: number;
  created_at?: string;
  updated_at?: string;
}

export interface FriendRecord {
  id: string;
  player_id: string;
  friend_id: string;
  created_at: string;
}

export interface FriendRequestRecord {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  mail_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MedicineRecord {
  id: string;
  name: string;
  quality: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'MYTHIC';
  type: string;
  price_copper: number;
  effect_desc: string;
  description: string;
  icon: string;
  hp_restore: number;
  mp_restore: number;
  exp_restore: number;
  max_hp_bonus: number;
  max_mp_bonus: number;
  status: number;
  created_at?: string;
  updated_at?: string;
}



