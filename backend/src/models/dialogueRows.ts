/**
 * 后端专用的对话运行时类型（数据库行映射 + 上下文）
 * 这些结构直接对应 D1 表列，不属于跨端协议，因此不放在 game/models 中。
 */
import type {
  DialogueCondition,
  DialogueAction,
  OptionStyleType,
} from '../../../game/models/dialogue';
import type { NotificationGrant } from '../services/notificationGrantService';

export interface PlayerDialogueContext {
  player: {
    id: string;
    nickname?: string;
    level: number;
    zone_id: string;
    area_id: string;
    copper: number;
    silver: number;
    ingot: number;
    exp: number;
    [key: string]: unknown;
  };
  inventoryMap: Map<string, number>;
  questStatusMap: Map<string, 'NONE' | 'ACTIVE' | 'DONE' | 'SUBMITTED'>;
  flagsMap: Map<string, number>;
}

export interface DialoguePackageRow {
  id: string;
  name: string;
  description?: string;
  category: 'MAIN' | 'BRANCH' | 'ENCOUNTER' | 'FACILITY';
  default_root_node_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface NpcRow {
  id: string;
  scene_id: string | null;
  key?: string | null;
  name: string;
  badge?: string;
  title?: string;
  avatar?: string;
  type?: string;
  quote?: string;
  gossip?: string;
  template_id?: string;
  dialogue_package_id?: string;
  dialogue_root_node_id?: string;
  /** MAP / STORY / STORY_BATTLE */
  npc_role?: 'MAP' | 'STORY' | 'STORY_BATTLE';
  owner_player_id?: string | null;
  pos_x?: number | null;
  pos_y?: number | null;
  /** 由 JOIN scenes 推导出的所在大区，非 npc_instances 表字段 */
  scene_zone_id?: string | null;
}

export interface RouterRow {
  id: string;
  npc_id: string;
  priority: number;
  root_node_id: string;
  conditions_json: string;
  description?: string;
  package_id?: string;
  scene_id?: string;
}

export interface DialogueNodeRow {
  id: string;
  npc_id: string;
  chapter_title?: string;
  content: string;
  /** 节点内多段线性台词 JSON 数组 [{speaker_id,content}] */
  pages_json?: string | null;
  /** 无分支直连的下一节点；与 dialogue_options 互斥 */
  direct_next_node_id?: string | null;
  quote_box?: string;
  ui_meta_json?: string;
  editor_pos_json?: string;
  package_id?: string;
  /** 节点发生地图；绑定剧本的 NPC 只在玩家当前节点所在地图出现 */
  scene_id?: string | null;
  /** 进入节点时触发的动作 JSON 数组 */
  on_enter_actions_json?: string | null;
  /** 完成节点（选择任一选项离开）时触发的动作 JSON 数组 */
  on_complete_actions_json?: string | null;
}

/**
 * 剧情节点触发器动作。
 * 目前仅支持系统通知；后续可扩展 GIVE_ITEM / SET_FLAG 等。
 */
export interface DialogueTriggerAction {
  type: 'SEND_NOTIFICATION';
  /** 引用的剧情通知资产 ID (story_notifications.id)；为空时回退到全局兜底配置 */
  notificationId?: string;
  /** 通知事件编码，旧触发器兼容字段 */
  eventCode?: string;
  /** 覆盖通知标题；为空时使用通知资产配置 */
  title?: string;
  /** 覆盖通知正文；为空时使用通知资产配置 */
  content?: string;
  /** 未绑定通知资产时的内联发放内容（道具 / 角色 / 货币） */
  grants?: NotificationGrant[];
  /** 是否只触发一次，默认 true */
  once?: boolean;
}

export interface DialogueOptionRow {
  id: string;
  node_id: string;
  sort_order: number;
  text: string;
  action_label?: string;
  style_type?: OptionStyleType;
  next_node_id?: string | null;
  show_conditions_json: string;
  enable_conditions_json: string;
  actions_json: string;
}

/** 供处理器签名使用的动作/条件别名 */
export type { DialogueCondition, DialogueAction };
