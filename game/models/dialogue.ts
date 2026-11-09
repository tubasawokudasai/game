import { z } from 'zod';

/**
 * ==============================================================================
 * 《万象录》- 有向图对话树 (Directed Graph) 核心协议与模型定义
 * 
 * 核心设计模式组合：
 * 1. 解释器/有向图模式 (Graph Interpreter): 拓扑化管理 NPC 对话节点与选项跳转，契合可视化连线配置
 * 2. 规约模式 (Specification Pattern): 解耦前置条件判定 (等级、道具、任务、剧情Flag)
 * 3. 命令模式 (Command Pattern): 解耦点击选项后的副作用指令 (发道具、扣灵石、接任务、拉起战斗)
 * ==============================================================================
 */

// ------------------------------------------------------------------------------
// 1. 条件规约定义 (Specification) - 判别联合类型与 Zod 校验
// ------------------------------------------------------------------------------

export const DialogueConditionSchema = z.discriminatedUnion('type', [
  // 境界 / 等级要求
  z.object({
    type: z.literal('MIN_LEVEL'),
    level: z.number().int().min(1).describe('最低角色等级/境界要求'),
  }),
  // 拥有道具要求
  z.object({
    type: z.literal('HAS_ITEM'),
    itemId: z.string().min(1).describe('所需道具备案 ID'),
    count: z.number().int().min(1).default(1).describe('所需道具数量'),
  }),
  // 任务状态检查
  z.object({
    type: z.literal('QUEST_STATUS'),
    questId: z.string().min(1).describe('所属天机委托/任务 ID'),
    status: z.enum(['NONE', 'ACTIVE', 'DONE', 'SUBMITTED']).describe('期望任务阶段'),
  }),
  // 剧情标记校验 (防重复领奖、分支记忆)
  z.object({
    type: z.literal('HAS_FLAG'),
    key: z.string().min(1).describe('剧情状态 Flag 键'),
    expectedValue: z.number().int().default(1).describe('期望值'),
  }),
]);

export type DialogueCondition = z.infer<typeof DialogueConditionSchema>;

// ------------------------------------------------------------------------------
// 2. 动作指令定义 (Command) - 判别联合类型与 Zod 校验
// ------------------------------------------------------------------------------

export const DialogueActionSchema = z.discriminatedUnion('type', [
  // 发放道具 / 装备
  z.object({
    type: z.literal('GIVE_ITEM'),
    itemId: z.string().min(1).describe('发放的物品 ID'),
    count: z.number().int().min(1).default(1).describe('发放数量'),
  }),
  // 扣除道具 (不满足则事务回滚阻断)
  z.object({
    type: z.literal('COST_ITEM'),
    itemId: z.string().min(1).describe('扣除的物品 ID'),
    count: z.number().int().min(1).default(1).describe('扣除数量'),
  }),
  // 增减修为经验 / 铜钱灵石
  z.object({
    type: z.literal('ADD_EXP_OR_GOLD'),
    exp: z.number().int().optional().describe('获得经验/修为'),
    gold: z.number().int().optional().describe('获得铜钱/灵石'),
  }),
  // 接取任务
  z.object({
    type: z.literal('ACCEPT_QUEST'),
    questId: z.string().min(1).describe('接取的任务 ID'),
  }),
  // 交付/完成任务
  z.object({
    type: z.literal('COMPLETE_QUEST'),
    questId: z.string().min(1).describe('交付的任务 ID'),
  }),
  // 写入剧情标记 (防刷奖、推进主线支线)
  z.object({
    type: z.literal('SET_FLAG'),
    key: z.string().min(1).describe('剧情标记键名'),
    value: z.number().int().default(1).describe('设定的数值'),
  }),
  // 拉起 CombatEngine 触发剧情战（直接指定怪物组）
  z.object({
    type: z.literal('START_COMBAT'),
    monsterGroupId: z.string().min(1).describe('怪物组/论道对手标识'),
    winNodeId: z.string().optional().describe('战胜后跳转的对话节点 ID'),
    loseNodeId: z.string().optional().describe('战败后跳转的对话节点 ID'),
  }),
  // 拉起剧情战斗（战斗角色由后台按选项 upsert 为 npc_role='STORY_BATTLE'）
  z.object({
    type: z.literal('START_ENCOUNTER'),
    npcId: z.string().min(1).describe('剧情战斗角色实例 ID'),
    winNodeId: z.string().optional().describe('战胜后跳转的对话节点 ID'),
    loseNodeId: z.string().optional().describe('战败后跳转的对话节点 ID'),
  }),
  // 空间御剑传送
  z.object({
    type: z.literal('TELEPORT'),
    zoneId: z
      .string()
      .optional()
      .describe('目标大区（可省略，服务端按 areaId 从 scenes.zone_id 推导）'),
    areaId: z.string().min(1).describe('目标场景 ID（scenes.id）'),
    posX: z.number().optional().describe('目标 X 坐标'),
    posY: z.number().optional().describe('目标 Y 坐标'),
  }),
  // 伙伴加入队伍 (幂等)
  z.object({
    type: z.literal('JOIN_PARTY'),
    memberKey: z.string().optional().describe('NPC 模板 ID 或 key，如 tpl_cangyun'),
    characterId: z.string().optional().describe('兼容别名，如 luo_qinghan'),
    active: z.boolean().default(true).describe('是否默认出战激活'),
  }),
]);

export type DialogueAction = z.infer<typeof DialogueActionSchema>;

// ------------------------------------------------------------------------------
// 3. 表现层选项样式类型
// ------------------------------------------------------------------------------

export type OptionStyleType = 'GOLD' | 'RED' | 'GRAY' | 'NORMAL';

// ------------------------------------------------------------------------------
// 4. 返回给前端渲染的视图模型 (ViewModel)
// ------------------------------------------------------------------------------

export interface DialogueOptionViewModel {
  id: string;
  text: string;                  // "探问天机 · 追问古井幽冥阵真相"
  actionLabel?: string;          // 右侧短标签，如 "知悉" / "奉诏" / "作罢"
  styleType: OptionStyleType;    // 选项高光样式
  disabled: boolean;             // 是否置灰禁用
  disabledReason?: string;       // 置灰原因提示 (如: "修为未至筑基期")
}

/**
 * 单页台词。
 * 一个对话节点内部可以串联多页台词，玩家点击“继续”在节点内部翻页，
 * 不会产生新的图节点或连线。
 */
export interface DialoguePage {
  /** 发言人：默认继承节点的 npc_id；player=主角，narrator=旁白，也可指定 NPC 模板/实例 ID */
  speaker_id?: string;
  content: string;
}

/** 下发给前端的单页台词视图（已解析好发言人名片） */
export interface DialoguePageViewModel {
  speakerId: string;
  speakerName: string;
  speakerBadge?: string;
  speakerTitle?: string;
  speakerAvatar?: string;
  content: string;
}

export interface DialogueRenderPayload {
  nodeId: string;
  npc: {
    id: string;
    key?: string;
    name: string;                // "墨芳"
    badge?: string;              // 印章头衔，如 "司星"
    title?: string;              // 称号，如 "天机使"
    avatar?: string;             // 立绘 URL
  };
  chapterTitle?: string;         // 章节标识，如 "长乐古井篇 · 卷一"
  content: string;               // 兼容字段：第一页台词
  pages: DialoguePageViewModel[]; // 节点内多段线性台词
  quoteBox?: string;             // 蓝框强调/暗语文本
  uiMeta?: Record<string, unknown>; // 表现层扩展 (震屏、立绘表情、BGM)
  options: DialogueOptionViewModel[];
  /** 无分支直连的下一节点；玩家翻完最后一页后点击“继续”进入 */
  directNextNodeId?: string | null;
}

// ------------------------------------------------------------------------------
// 5. 点击选项后的交互结果响应 (Interact Result)
// ------------------------------------------------------------------------------

export interface StoryCombatContext {
  packageId: string;
  nodeId: string;
  /** 战斗结束后没有胜/败返回节点时，直接把来源节点标记 COMPLETED */
  completeOnFinish: boolean;
}

export interface DialogueInteractResult {
  status: 'CONTINUE' | 'CLOSE' | 'COMBAT' | 'TELEPORT';
  nextDialogue?: DialogueRenderPayload; // 拓扑连线直接返回下一节点，省去客户端二次往返
  /** 跨场景选项：只关闭对话，不移动玩家；剧情进度与 NPC 位置已由服务端推进 */
  sceneChanged?: boolean;
  /** 跨场景关闭时玩家再次点击 NPC 应续接的节点 */
  nextNodeId?: string;
  combatPayload?: {
    /** DIALOGUE=剧情战（怪物组）；ENCOUNTER=剧情/地图 NPC 遭遇战（单人/战阵） */
    battleType?: 'DIALOGUE' | 'ENCOUNTER';
    monsterGroupId?: string;
    /** ENCOUNTER 模式下的战斗角色实例 ID */
    npcId?: string;
    winNodeId?: string;
    loseNodeId?: string;
    storyContext?: StoryCombatContext;
    teleportTarget?: {
      zoneId: string;
      areaId: string;
      posX?: number;
      posY?: number;
    };
  };
  storyContext?: StoryCombatContext;
  teleportTarget?: {
    zoneId: string;
    areaId: string;
    posX?: number;
    posY?: number;
  };
  rewardsToast?: string[];              // 前端飘字提示：["获得【天机罗盘】x1", "开启委托【古井异动】"]
  partyChanged?: boolean;               // 本次抉择是否改动了出战队伍（前端需刷新队伍栏）
}
