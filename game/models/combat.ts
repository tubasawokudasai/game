/**
 * 阵营归属
 */
export type CombatCamp = 'PLAYER' | 'ENEMY';

/**
 * 战斗角色属性
 */
export interface CombatFighter {
  id: string;
  name: string;
  avatar: string;
  idleAvatar?: string;
  attackAvatar?: string;
  camp: CombatCamp;
  position: 'FRONT' | 'BACK';
  slotIndex: number; // 0, 1, 2, 3 站位序号
  /** 当前生命（战斗状态，不允许因属性重算自动回满） */
  hp: number;
  /** 最终生命上限 */
  maxHp: number;
  /** 当前内力（战斗状态，不允许因属性重算自动回满） */
  mp: number;
  /** 最终内力上限 */
  maxMp: number;
  rage: number; // 怒气值 0 - 100
  maxRage: number;
  attack: number;
  defense: number;
  speed: number;
  /** 法术攻击（服务端 NPC 属性计算服务下发；旧单位可缺省） */
  matk?: number;
  /** 法术防御（服务端 NPC 属性计算服务下发；旧单位可缺省） */
  mdef?: number;
  /** 暴击率 0~1（服务端 NPC 属性计算服务下发；缺省时沿用旧引擎 0.25） */
  critRate?: number;
  /** 暴击伤害倍率（缺省时沿用旧引擎 2） */
  critDmg?: number;
  /** 生成该战斗单位的等级（展示/排查用） */
  level?: number;
  /** NPC 品质（展示用，倍率已在服务端结算） */
  quality?: string;
  /** 成长模板 ID（展示用） */
  growthTemplate?: string | null;
  /** 单位装配的技能键列表（优先取 npc_instances.skills_json，为空则继承模板 skills_json） */
  skills?: string[];
  isAlive: boolean;
  isActionActive?: boolean;
  buffs: CombatBuff[];
}

/**
 * 战斗状态/增益 Buff
 */
export interface CombatBuff {
  id: string;
  name: string;
  icon?: string;
  description: string;
  duration: number; // 剩余回合
  effectType: 'ATK_UP' | 'DEF_UP' | 'CRIT_UP' | 'SHIELD' | 'DOT' | 'STUN';
  value: number;
}

/**
 * 技能类型
 */
export interface CombatSkill {
  id: string;
  name: string;
  costMp: number;
  costRage: number;
  icon?: string;
  description: string;
  targetType: 'SINGLE_ENEMY' | 'ALL_ENEMIES' | 'SINGLE_ALLY' | 'ALL_ALLIES' | 'SELF';
  cooldown: number;
  currentCooldown: number;
  damageMultiplier: number;
  critBonus?: number;
  buffApplied?: CombatBuff;
  quote?: string; // 施法喊话
}

/**
 * 战报事件动作
 */
export interface CombatActionLog {
  id: string;
  round: number;
  attackerId: string;
  attackerName: string;
  targetId: string;
  targetName: string;
  skillName: string;
  damage?: number;
  heal?: number;
  isCrit?: boolean;
  text: string;
  camp: CombatCamp;
  timestamp: number;
}

/** 技能作用目标类型（后续可继续扩展） */
export type CombatSkillTargetType =
  | 'SINGLE_ENEMY'   // 敌方单体
  | 'SINGLE_ALLY'    // 我方单体（可包含自己）
  | 'SELF'           // 仅自己
  | 'ALL_ENEMIES'    // 敌方全体
  | 'ALL_ALLIES';    // 我方全体

/** 技能效果类型（决定 UI 提示与目标校验，不决定数值公式） */
export type CombatSkillKind = 'DAMAGE' | 'HEAL' | 'BUFF' | 'DEBUFF';

/**
 * 统一战斗行动类型
 */
export enum BattleActionType {
  NORMAL_ATTACK = 'NORMAL_ATTACK',
  DEFEND = 'DEFEND',
  SKILL = 'SKILL',
  USE_ITEM = 'USE_ITEM',
  ESCAPE = 'ESCAPE',
}

/**
 * 统一战斗行动指令
 */
export interface BattleActionCommand {
  actorId: string;
  actionType: BattleActionType;
  targetIds?: string[];
  targetId?: string;
  skillId?: string;
  itemId?: string;
  unitId?: string;
}

/** 玩家可选择的战斗技能信息（由服务端技能表下发，前端只负责展示与提交） */
export interface CombatSkillInfo {
  id: string;
  name: string;
  description: string;
  costMp: number;
  targetType: CombatSkillTargetType;
  /** 预留：DAMAGE / HEAL / BUFF / DEBUFF；治疗技能会校验目标气血 */
  kind: CombatSkillKind;
}

/** 单个出战单位的本回合指令（每个存活角色各一条，兼容统一指令 BattleActionCommand） */
export interface CombatUnitAction {
  /** 出战单位 ID（CombatFighter.id） */
  unitId: string;
  actorId?: string;
  actionType?: BattleActionType;
  skillId?: string;
  /** 按技能 targetType 指向敌方或我方单位；SELF/全体可省略 */
  targetId?: string;
  targetIds?: string[];
  itemId?: string;
}

/** 目标类型的中文展示文案（前后端 UI 共用） */
export const COMBAT_TARGET_LABELS: Record<CombatSkillTargetType, string> = {
  SINGLE_ENEMY: '敌方单体',
  SINGLE_ALLY: '我方单体',
  SELF: '自身',
  ALL_ENEMIES: '敌方全体',
  ALL_ALLIES: '我方全体',
};

/**
 * 切磋论道默认技能表（数据库 combat_skills 的兜底数据）
 * 与后端 services/combat/strategies.ts 中的策略 skillId 一一对应。
 */
export const DUEL_SKILLS: CombatSkillInfo[] = [
  {
    id: 'skill_pure_yang_sword',
    name: '纯阳剑煞',
    description: '催动纯阳剑罡破敌，忽略目标 30% 护甲，造成高额外功伤害。',
    costMp: 120,
    targetType: 'SINGLE_ENEMY',
    kind: 'DAMAGE',
  },
  {
    id: 'skill_tai_qing_heal',
    name: '太清回春',
    description: '引碧玉甘霖回复选中的我方目标气血（含自身，目标气血低于 75% 时方可施展）。',
    costMp: 90,
    targetType: 'SINGLE_ALLY',
    kind: 'HEAL',
  },
  {
    id: 'skill_nine_sky_thunder',
    name: '九霄天雷',
    description: '引九天玄刹轰落，以内功震碎灵光，对单体造成巨额法术伤害。',
    costMp: 150,
    targetType: 'SINGLE_ENEMY',
    kind: 'DAMAGE',
  },
  {
    id: 'skill_wanjian_guizong',
    name: '万剑归宗',
    description: '万柄太虚灵剑悬空齐发，对敌方全体造成巨额剑罡伤害。',
    costMp: 220,
    targetType: 'ALL_ENEMIES',
    kind: 'DAMAGE',
  },
  {
    id: 'skill_spring_rain',
    name: '春风化雨',
    description: '化春风为灵雨洒落，为我方全体回复气血（仅对气血低于 75% 的目标生效）。',
    costMp: 160,
    targetType: 'ALL_ALLIES',
    kind: 'HEAL',
  },
];

/**
 * 战斗初始化参数
 */
export interface CombatInitOptions {
  monsterGroupId: string;
  /** 我方阵容：由服务端根据 players + party_members + npc_instances + npc_templates 下发 */
  playerTeam: CombatFighter[];
  /** 敌方阵容：由服务端根据 monster_groups 下发 */
  enemyTeam: CombatFighter[];
  groupTitle?: string;
  myCampTitle?: string;
  winNodeId?: string;
  loseNodeId?: string;
  /** 服务端下发的完整战报脚本（SCRIPT 模式） */
  script?: CombatScriptEvent[];
  /** 服务端已裁决的胜负（SCRIPT 模式） */
  outcome?: 'WIN' | 'LOSE' | 'ESCAPE';
  /** 战斗模式：SCRIPT = 旧版播片；PVP = 玩家切磋；PVE = 实时回合制 NPC 战斗 */
  mode?: 'SCRIPT' | 'PVP' | 'PVE';
  /** PVP 切磋会话标识 */
  duelId?: string;
  /** 实时战斗会话标识（PVP 使用 duelId，PVE 使用 battleId） */
  battleId?: string;
  /** PVE 战斗来源：剧情战 / 地图 NPC 遭遇 */
  battleType?: 'DIALOGUE' | 'ENCOUNTER';
  /** 实时战斗（PVP/PVE）可操作技能清单；SCRIPT 模式下作为展示技能清单 */
  skills?: CombatSkillInfo[];
  /** PVP 起始回合 */
  round?: number;
  /** PVP 本轮出招截止时间（服务端时间戳） */
  deadline?: number;
  /** PVP 服务端当前时间戳（用于校正客户端倒计时） */
  serverNow?: number;
  /** PVP 每回合出招窗口（毫秒） */
  timeoutMs?: number;
  /** PVP 提交本回合所有出战单位的指令 */
  onPvpAction?: (actions: CombatUnitAction[]) => void;
  onFinish?: (result: 'WIN' | 'LOSE' | 'ESCAPE', toasts?: string[]) => void;
  /** 是否为玩家切磋对战 */
  isDuel?: boolean;
  winTitle?: string;
  winDesc?: string;
  winButtonText?: string;
  loseTitle?: string;
  loseDesc?: string;
  loseButtonText?: string;
}

/**
 * 服务端战报脚本中的单条演出事件
 * 前端只按顺序播放，不再自行计算伤害或判定胜负。
 */
export interface CombatScriptEvent {
  round: number;
  attackerId: string;
  attackerName: string;
  defenderId: string;
  defenderName: string;
  skillName: string;
  damage: number;
  heal: number;
  isCrit: boolean;
  /** 受击方剩余气血（服务端口径） */
  defenderHpRemaining: number;
  logText: string;
}
