/**
 * NPC 属性成长系统 - 公共类型
 *
 * 设计原则：
 * 1. 八维属性统一使用同一套键名，业务层不再各自拼装 hp/attack/defense；
 * 2. 所有“原始值 / 成长值 / 品质倍率 / 境界加成”都只存在于配置层；
 * 3. 最终输出同时包含 maxHp/maxMp（最终上限）与 currentHp/currentMp（当前战斗状态），
 *    重新计算时只允许夹取，不允许自动回满。
 */

/** 统一八维属性键 */
export const NPC_ATTRIBUTE_KEYS = [
  'hp',
  'mp',
  'atk',
  'matk',
  'def',
  'mdef',
  'spd',
  'crit',
] as const;

export type NpcAttributeKey = (typeof NPC_ATTRIBUTE_KEYS)[number];

/** 八维属性值的统一形态 */
export type NpcAttributes = Record<NpcAttributeKey, number>;

/** 品质：普通 / 精英 / 首领 / 传说 */
export type NpcQuality = 'COMMON' | 'ELITE' | 'BOSS' | 'LEGENDARY';

/** 成长模板：战士型 / 法术型 / 均衡型 / 辅助型 */
export type NpcGrowthTemplateId = 'warrior' | 'mage' | 'balanced' | 'support';

/** 一次计算实际使用的成长来源 */
export type NpcGrowthSource = NpcGrowthTemplateId | 'database' | 'template' | 'none';

/** 品质配置 */
export interface NpcQualityDefinition {
  id: NpcQuality;
  label: string;
  description: string;
  /** 生命/内力/攻击/法攻/防御/法防/速度的最终倍率 */
  statMultiplier: number;
  /** 暴击率单独倍率（暴击是 0~1 概率，单独控制更稳妥） */
  critMultiplier: number;
  color: string;
}

/** 成长模板配置：1 级基础属性 + 每级成长值 */
export interface NpcGrowthTemplateDefinition {
  id: NpcGrowthTemplateId;
  label: string;
  description: string;
  /** 1 级基础属性 */
  base: NpcAttributes;
  /** 每级成长值 */
  growth: NpcAttributes;
}

/** 境界配置：只作为外挂加成，不修改上面的成长模板 */
export interface NpcRealmDefinition {
  id: string;
  label: string;
  /** 用于匹配 "金丹中期" 这类文案 */
  aliases: string[];
  /** 对非暴击属性统一增加的百分比，0.1 = +10% */
  percentBonus: number;
  /** 暴击率额外增加（绝对值，0.01 = +1%） */
  critBonus: number;
}

/** 单条装备 / 永久属性加成 */
export interface NpcAttributeBonus {
  sourceId?: string;
  sourceName?: string;
  /** 固定值加成 */
  flat?: Partial<NpcAttributes>;
  /** 百分比加成，0.05 = +5%（按当前阶段数值放大） */
  percent?: Partial<NpcAttributes>;
}

/** 装备与其他永久加成集合 */
export interface NpcAttributeBonusSet {
  equipment?: NpcAttributeBonus[];
  permanent?: NpcAttributeBonus[];
}

/** 数据库行 / 业务调用方可以传入的属性来源 */
export interface NpcAttributeSource {
  /** 1 级基础属性；缺省值由成长模板补齐 */
  base?: Partial<NpcAttributes>;
  /** 显式每级成长值；缺省值由成长模板预设补齐 */
  growth?: Partial<NpcAttributes>;
  /** 成长预设 ID；仅用于展示/新建模板，实际成长值以 growth_* 数据为准 */
  growthTemplate?: string | null;
  /** 品质；为空时默认 COMMON */
  quality?: string | null;
  /** 境界文案，例如 "金丹中期"；由实例/伙伴数据传入，不再来自模板 */
  realm?: string | null;
  /** 装备 / 永久加成 */
  bonuses?: NpcAttributeBonusSet | NpcAttributeBonus | NpcAttributeBonus[] | null;
}

/** 当前战斗状态：重新计算时原样传入 */
export interface NpcCurrentState {
  hp: number;
  mp: number;
}

/** 计算入参 */
export interface NpcAttributeCalculateInput extends NpcAttributeSource {
  level: number;
  /** 战斗配置中的绝对覆盖值，优先级最高（旧版 hp_override 等） */
  overrides?: Partial<NpcAttributes> | null;
  /**
   * 当前生命/内力。
   * - 不传：视为新生成 NPC，按满血满蓝初始化；
   * - 传入（包括 0）：按当前状态保留，最大值变化时只做夹取。
   */
  current?: NpcCurrentState | null;
}

/** 各阶段快照，便于后台排查成长来源 */
export interface NpcAttributeBreakdown {
  /** 等级成长后的基础值 */
  base: NpcAttributes;
  /** 应用品质倍率后 */
  afterQuality: NpcAttributes;
  /** 应用境界加成后 */
  afterRealm: NpcAttributes;
  /** 应用装备/永久加成后 */
  afterBonuses: NpcAttributes;
  /** 应用战斗配置覆盖值后、最终取整前 */
  afterOverrides: NpcAttributes;
}

/** 最终战斗属性 */
export interface NpcFinalAttributes extends NpcAttributes {
  /** 最终最大生命 */
  maxHp: number;
  /** 最终最大内力 */
  maxMp: number;
  /** 当前生命（重新计算不会自动回满） */
  currentHp: number;
  /** 当前内力（重新计算不会自动回满） */
  currentMp: number;
  level: number;
  quality: NpcQuality;
  qualityLabel: string;
  growthSource: NpcGrowthSource;
  growthTemplateId: NpcGrowthTemplateId | null;
  realm: string;
  realmLabel: string;
  breakdown: NpcAttributeBreakdown;
  /** 估算战力，仅用于后台展示 */
  combatPower: number;
}

/** 成长预览的一行 */
export interface NpcLevelPreviewRow {
  level: number;
  maxHp: number;
  maxMp: number;
  atk: number;
  matk: number;
  def: number;
  mdef: number;
  spd: number;
  crit: number;
  quality: NpcQuality;
  qualityLabel: string;
  growthSource: NpcGrowthSource;
  growthTemplateId: NpcGrowthTemplateId | null;
}

/** 后台预览接口返回结构 */
export interface NpcAttributePreviewResult {
  sourceLabel: string;
  levels: NpcLevelPreviewRow[];
}
