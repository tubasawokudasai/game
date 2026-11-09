export interface AdminUser {
  username: string;
  role: string;
}

export interface AdminStats {
  totalPlayers: number;
  guestPlayers: number;
  registeredPlayers: number;
  totalScenes: number;
  totalNpcs: number;
  totalMedicines?: number;
  totalSkills?: number;
}

export interface SceneItem {
  id: string;
  zone_id: string;
  name: string;
  region: string;
  level: number; // 1: 州域, 2: 都城, 3: 坊市
  parent_id?: string | null;
  icon?: string;
  coord_x: number;
  coord_y: number;
  status_desc?: string;
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

export interface PlayerItem {
  id: string;
  username?: string | null;
  is_guest: number;
  nickname: string;
  level: number;
  exp: number;
  hp: number;
  max_hp: number;
  mp: number;
  max_mp: number;
  combat_power: number;
  sect: string;
  sect_position: string;
  realm: string;
  vip_level: number;
  silver: number;
  ingot: number;
  copper: number;
  zone_id: string;
  area_id: string;
  status: string;
  combat_model_key?: string;
  signature?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PlayerListResponse {
  list: PlayerItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface NpcTemplateItem {
  id: string;
  key: string;
  name: string;
  title: string;
  badge: string;
  avatar: string;
  idle_avatar: string;
  attack_avatar: string;
  base_hp: number;
  base_mp: number;
  base_attack: number;
  base_defense: number;
  base_speed: number;
  /** 八维扩展：法攻/法防/暴击（服务端已按成长模板补齐） */
  base_matk?: number;
  base_mdef?: number;
  base_crit?: number;
  /** 实际生效的每级成长值（服务端解析后下发，前端不再硬编码） */
  growth_hp?: number;
  growth_mp?: number;
  growth_attack?: number;
  growth_matk?: number;
  growth_defense?: number;
  growth_mdef?: number;
  growth_speed?: number;
  growth_crit?: number;
  /** warrior / mage / balanced / support；为空表示使用数据库自定义成长值 */
  growth_template?: string | null;
  growth_source?: string;
  quality?: string;
  quality_label?: string;
  quality_multiplier?: number;
  role?: string;
  sort_order?: number;
  bonus_json?: string;
  skills_json?: string;
  description: string;
  dialogue_package_id?: string | null;
  dialogue_package_name?: string | null;
  dialogue_root_node_id?: string | null;
  quote?: string;
  gossip?: string;
  usage?: {
    configs: number;
    npcs: number;
  };
  created_at?: string;
  updated_at?: string;
}

/** 战斗配置槽位：一个 NPC 模板实例 + 可覆盖的等级/属性 */
export interface ConfigMember {
  slot_index: number;
  template_id: string;
  template_name?: string;
  template_avatar?: string;
  level: number;
  position: 'FRONT' | 'BACK';
  is_boss: boolean;
  /** 槽位品质覆盖；为空继承实例/模板品质 */
  quality?: string | null;
  /** 槽位境界；保存在 npc_instances.realm */
  realm?: string | null;
  /** 服务端计算后的最终品质 */
  effective_quality?: string;
  quality_label?: string;
  growth_template?: string | null;
  hp_override: number | null;
  mp_override: number | null;
  attack_override: number | null;
  defense_override: number | null;
  speed_override: number | null;
  /** 后端按模板 + 等级 + 品质 + 覆盖值算出的最终属性 */
  hp: number;
  mp: number;
  attack: number;
  matk?: number;
  defense: number;
  mdef?: number;
  speed: number;
  crit?: number;
  combatPower?: number;
}

export interface MonsterGroupItem {
  id: string;
  name: string;
  members: ConfigMember[];
  enemyCount: number;
  totalHp: number;
  totalCombatPower: number;
  referencedNpcs: Array<{ id: string; name: string; scene_id: string }>;
  created_at?: string;
}

export interface ItemTemplateItem {
  id: string;
  name: string;
  type?: string;
  quality?: string;
  description?: string;
}

export interface NpcItem {
  id: string;
  scene_id: string;
  scene_name?: string;
  key: string;
  name: string;
  badge?: string;
  title: string;
  avatar?: string;
  type: 'dialogue' | 'battle';
  status?: string;
  template_id?: string | null;
  template_name?: string | null;
  /** 战斗遭遇模式：SOLO=未绑定战阵，NPC 自身即唯一敌人；GROUP=绑定战斗配置 */
  battle_mode?: 'SOLO' | 'GROUP' | null;
  battle_group_id?: string | null;
  battle_group_name?: string | null;
  enemyCount?: number;
  enemyNames?: string[];
  battle_level?: number;
  /** 地图 NPC 专属敌方槽位等级 {"0":20,"1":15}；未覆盖的槽位使用战斗配置默认值 */
  battle_member_levels?: Record<string, number>;
  battle_member_levels_json?: string;
  battle_reward?: {
    exp?: number;
    gold?: number;
    silver?: number;
    items?: Array<{ id: string; name?: string; count: number }>;
  };
  battle_reward_json?: string;
  respawn_seconds?: number;
  once_flag?: string | null;
  quote?: string;
  gossip?: string;
  skills_json?: string | null;
  template_skills_json?: string | null;
  dialogue_package_id?: string | null;
  dialogue_package_name?: string | null;
  dialogue_root_node_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * 可入队 NPC 模板（npc_templates，系统发放角色时使用）。
 * 任何 NPC 模板都可以被发放给玩家，不再有独立的 companion_templates。
 */
export interface CompanionTemplateItem {
  member_key: string;
  template_id?: string;
  key?: string;
  name: string;
  title?: string | null;
  badge?: string | null;
  avatar?: string | null;
  role: string;
  sort_order: number;
  idle_avatar?: string | null;
  attack_avatar?: string | null;
  base_hp?: number;
  base_mp?: number;
  base_attack?: number;
  base_defense?: number;
  base_speed?: number;
}

/** 后台 NPC 实例管理（npc_instances） */
export interface NpcInstanceItem {
  npc_id: string;
  template_id: string;
  template_name?: string | null;
  template_key?: string | null;
  instance_type: 'WORLD' | 'PLAYER' | 'BATTLE' | 'MAIL' | string;
  status: 'ACTIVE' | 'PENDING' | 'MERGED' | 'DISABLED' | string;
  npc_role?: 'MAP' | 'STORY' | 'STORY_BATTLE' | string;
  pos_x?: number | null;
  pos_y?: number | null;
  scene_id?: string | null;
  scene_name?: string | null;
  key?: string | null;
  name: string;
  badge?: string | null;
  title: string;
  avatar?: string | null;
  type: string;
  owner_player_id?: string | null;
  owner_name?: string | null;
  created_by: string;
  source: string;
  source_ref?: string | null;
  level: number;
  realm?: string | null;
  quality?: string | null;
  growth_template?: string | null;
  bonus_json?: string | null;
  skills_json?: string | null;
  template_skills_json?: string | null;
  battle_group_id?: string | null;
  battle_level?: number;
  created_at?: string;
  updated_at?: string;
}

export interface NpcInstanceListResponse {
  success: boolean;
  data: NpcInstanceItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type GrantItemType = 'ITEM' | 'COMPANION' | 'CURRENCY';

export interface GrantTypeMeta {
  type: GrantItemType;
  label: string;
  description: string;
}

export interface GrantCatalogResponse {
  success: boolean;
  items: ItemTemplateItem[];
  companions: CompanionTemplateItem[];
  grantTypes: GrantTypeMeta[];
}

export interface SystemGrantItemPayload {
  type: GrantItemType;
  itemId?: string;
  count?: number;
  memberKey?: string;
  level?: number;
  realm?: string;
  silver?: number;
  ingot?: number;
  copper?: number;
}

export interface SystemGrantPayload {
  receiverMode: 'single' | 'all' | 'online';
  receiverId?: string;
  senderName: string;
  title: string;
  content: string;
  expireDays: number;
  grants: SystemGrantItemPayload[];
}

export interface SystemGrantSummary {
  type: GrantItemType;
  name: string;
  count?: number;
  detail?: string;
}

export interface SystemGrantResponse {
  success: boolean;
  delivered: boolean;
  message: string;
  recipientCount: number;
  mailIds: string[];
  grants: SystemGrantSummary[];
  receiverMode: string;
  currentOnlinePlayerIds?: string[];
  tip?: string;
}


/** 后台 NPC 属性成长配置 */
export interface NpcAttributeConfigResponse {
  baseLevel: number;
  maxLevel: number;
  defaultGrowthTemplate: string;
  defaultLevels: number[];
  growthTemplates: Array<{
    id: string;
    label: string;
    description: string;
    base: Record<string, number>;
    growth: Record<string, number>;
  }>;
  qualities: Array<{
    id: string;
    label: string;
    description: string;
    statMultiplier: number;
    critMultiplier: number;
    color: string;
  }>;
  realms: Array<{
    id: string;
    label: string;
    aliases: string[];
    percentBonus: number;
    critBonus: number;
  }>;
}

export interface NpcAttributePreviewRow {
  level: number;
  maxHp: number;
  maxMp: number;
  atk: number;
  matk: number;
  def: number;
  mdef: number;
  spd: number;
  crit: number;
  quality: string;
  qualityLabel: string;
  growthSource: string;
  growthTemplateId: string | null;
}

export interface NpcAttributePreviewResponse {
  success: boolean;
  data: {
    sourceLabel: string;
    levels: NpcAttributePreviewRow[];
    templateId: string | null;
    quality: string;
    growthTemplate: string | null;
    realm: string;
  };
}

export interface NpcSlotPreviewMember {
  slot_index: number;
  error?: string;
  hp?: number;
  maxHp?: number;
  mp?: number;
  maxMp?: number;
  attack?: number;
  matk?: number;
  defense?: number;
  mdef?: number;
  speed?: number;
  crit?: number;
  combatPower?: number;
  quality?: string;
  quality_label?: string;
  growth_template?: string | null;
}

export type MedicineQuality = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'MYTHIC';

export interface MedicineItem {
  id: string;
  itemId?: string;
  name: string;
  quality: MedicineQuality;
  type: string;
  price_copper: number;
  priceCopper?: number;
  effect_desc: string;
  effectDesc?: string;
  description: string;
  icon: string;
  hp_restore?: number;
  mp_restore?: number;
  exp_restore?: number;
  max_hp_bonus?: number;
  max_mp_bonus?: number;
  status: number;
  created_at?: string;
  updated_at?: string;
}

export interface MedicineListResponse {
  success: boolean;
  data: MedicineItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AlchemyRecipeItem {
  id: string;
  name: string;
  quality: MedicineQuality;
  cost_copper: number;
  costCopper?: number;
  cost_exp: number;
  costExp?: number;
  output_item_id: string;
  outputItemId?: string;
  output_count: number;
  outputCount?: number;
  description?: string;
  icon?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AlchemyRecipeListResponse {
  success: boolean;
  data: AlchemyRecipeItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PharmacyGood {
  id: string;
  itemId: string;
  name: string;
  quality?: MedicineQuality | string;
  type?: string;
  price_copper?: number;
  priceCopper: number;
  effect_desc?: string;
  effectDesc: string;
  description?: string;
  icon?: string;
  hp_restore?: number;
  hpRestore?: number;
  mp_restore?: number;
  mpRestore?: number;
  exp_restore?: number;
  expRestore?: number;
  max_hp_bonus?: number;
  maxHpBonus?: number;
  max_mp_bonus?: number;
  maxMpBonus?: number;
  status?: number;
  created_at?: string;
  updated_at?: string;
}

export interface AlchemyRecipe {
  id: string;
  name: string;
  quality?: MedicineQuality | string;
  cost_copper?: number;
  costCopper: number;
  cost_exp?: number;
  costExp: number;
  output_item_id?: string;
  outputItemId: string;
  output_count?: number;
  outputCount: number;
  description?: string;
  icon?: string;
  created_at?: string;
  updated_at?: string;
}


/** 通知管理 · 通知发放内容（道具 / 角色 / 货币） */
export type NotificationGrant =
  | { type: 'ITEM'; itemId: string; quantity: number }
  | { type: 'COMPANION'; memberKey: string; level: number; realm?: string }
  | { type: 'CURRENCY'; silver: number; ingot: number; copper: number };

/** @deprecated 兼容旧命名，等同于 NotificationGrant */
export type LevelUpGrant = NotificationGrant;

/** 通知管理 · 玩家升级通知配置 */
export interface LevelUpNotificationConfig {
  enabled: boolean;
  eventCode: 'PLAYER_LEVEL_UP';
  title: string;
  content: string;
  grants: NotificationGrant[];
  updatedBy?: string | null;
  updatedAt?: string | null;
}

export interface LevelUpNotificationVariable {
  token: string;
  label: string;
  sample: string;
}

export interface LevelUpNotificationFixedRules {
  eventName: string;
  eventCode: string;
  triggerCondition: string;
  action: string;
  target: string;
}

export interface LevelUpNotificationResponse {
  success: boolean;
  message?: string;
  data: LevelUpNotificationConfig;
  defaults: LevelUpNotificationConfig;
  variables: LevelUpNotificationVariable[];
  fixedRules: LevelUpNotificationFixedRules;
}

/** 通知管理 · 剧情节点触发器通知 */
export interface StoryNotificationConfig {
  enabled: boolean;
  eventCode: 'STORY_NODE_TRIGGER';
  title: string;
  content: string;
  grants: NotificationGrant[];
  updatedBy?: string | null;
  updatedAt?: string | null;
}

export interface StoryNotificationResponse {
  success: boolean;
  message?: string;
  data: StoryNotificationConfig;
  defaults: StoryNotificationConfig;
  variables: LevelUpNotificationVariable[];
  fixedRules: LevelUpNotificationFixedRules;
}

/** 通知管理 · 通知事件列表项 */
export interface NotificationEventItem {
  eventCode: string;
  eventName: string;
  triggerCondition: string;
  action: string;
  target: string;
  enabled: boolean;
  title: string;
  content: string;
  grantCount: number;
  /** 剧情通知事件：已配置的独立通知条数 */
  notificationCount?: number;
  updatedBy?: string | null;
  updatedAt?: string | null;
  /** 后台二级配置页路由 */
  configPath: string;
}

/** 剧情通知资产（story_notifications） */
export interface StoryNotificationItem {
  id: string;
  package_id: string;
  package_name?: string | null;
  node_id?: string | null;
  node_chapter?: string | null;
  trigger_event: 'ENTER' | 'COMPLETE' | 'ANY';
  name: string;
  title: string;
  content: string;
  /** 发放内容：与玩家升级通知使用同一套道具 / 角色 / 货币配置 */
  grants: NotificationGrant[];
  enabled: boolean;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface StoryNotificationListResponse {
  success: boolean;
  data: StoryNotificationItem[];
}

export interface NotificationListResponse {
  success: boolean;
  data: NotificationEventItem[];
  total: number;
}

// ==============================================================================
// 剧情剧本系统 (Dialogue Packages & Nodes)
// ==============================================================================

export interface DialogueOptionItem {
  id: string;
  node_id: string;
  sort_order: number;
  text: string;
  action_label?: string | null;
  style_type: 'GOLD' | 'RED' | 'GRAY' | 'NORMAL';
  next_node_id?: string | null;
  show_conditions_json?: string;
  enable_conditions_json?: string;
  actions_json?: string;
  show_conditions?: any[];
  enable_conditions?: any[];
  actions?: any[];
}

export interface DialogueTriggerAction {
  type: 'SEND_NOTIFICATION';
  /** 引用的剧情通知资产 ID（story_notifications.id） */
  notificationId?: string;
  eventCode?: string;
  title?: string;
  content?: string;
  /** 未绑定通知资产时的内联发放内容（道具 / 角色 / 货币） */
  grants?: NotificationGrant[];
  once?: boolean;
}

/**
 * 单页台词：一个节点内部可串联多段线性对话，翻页不产生新的图节点。
 */
export interface DialoguePage {
  /** 发言人：默认继承节点的 npc_id；player=主角，narrator=旁白，也可指定 NPC 模板/实例 ID */
  speaker_id?: string;
  content: string;
}

export type DialogueFlowMode = 'branch' | 'direct' | 'end';

export interface DialogueNodeItem {
  id: string;
  package_id?: string | null;
  npc_id: string;
  chapter_title?: string | null;
  content: string;
  /** 节点内多段线性台词；为空时由 getNodePages 从 content 解析 */
  pages?: DialoguePage[];
  /** 无分支直连的下一节点；与 options 互斥 */
  direct_next_node_id?: string | null;
  quote_box?: string | null;
  /** 节点发生地图；绑定剧本的 NPC 只在玩家当前节点所在地图出现 */
  scene_id?: string | null;
  ui_meta_json?: string;
  editor_pos_json?: string;
  on_enter_actions_json?: string;
  on_complete_actions_json?: string;
  on_enter_actions?: DialogueTriggerAction[];
  on_complete_actions?: DialogueTriggerAction[];
  ui_meta?: Record<string, any>;
  editor_pos?: Record<string, any>;
  options?: DialogueOptionItem[];
}

export interface DialoguePackageItem {
  id: string;
  name: string;
  description?: string;
  category: 'MAIN' | 'BRANCH' | 'ENCOUNTER' | 'FACILITY' | string;
  default_root_node_id?: string | null;
  node_count?: number;
  npc_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface DialoguePackageDetail {
  package: DialoguePackageItem;
  nodes: DialogueNodeItem[];
}

export type CombatSkillTargetType =
  | 'SINGLE_ENEMY'
  | 'SINGLE_ALLY'
  | 'SELF'
  | 'ALL_ENEMIES'
  | 'ALL_ALLIES';

export type CombatSkillKind = 'DAMAGE' | 'HEAL' | 'BUFF' | 'DEBUFF';

export interface CombatSkillItem {
  skill_key: string;
  name: string;
  description?: string | null;
  cost_mp: number;
  target_type: CombatSkillTargetType;
  skill_kind: CombatSkillKind;
  power?: number | null;
  icon?: string | null;
  sort_order: number;
  is_enabled: number;
  created_at?: string;
}

export interface CombatSkillListResponse {
  success: boolean;
  data: CombatSkillItem[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}
