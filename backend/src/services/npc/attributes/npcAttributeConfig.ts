import type {
  NpcAttributes,
  NpcGrowthTemplateDefinition,
  NpcGrowthTemplateId,
  NpcQuality,
  NpcQualityDefinition,
  NpcRealmDefinition,
} from './npcAttributeTypes';

/**
 * NPC 数值成长系统 - 唯一配置源
 *
 * 所有会随版本调整的数值都集中在这里，禁止散落到路由、DB 访问层或前端：
 * - 品质倍率
 * - 四种成长模板的 1 级基础属性与每级成长值（用于新建模板预设）
 * - 境界加成
 *
 * 未来若改为运营后台可配，可将本文件替换为 DB 配置读取；
 * 计算服务与业务调用方无需改动。
 */
export const NPC_ATTRIBUTE_CONFIG = {
  /** 基础等级：公式从 1 级起算 */
  baseLevel: 1,
  /** 允许的 NPC 最高等级（与系统发放的 level 上限保持一致） */
  maxLevel: 9999,
  /** 未配置品质时默认普通 */
  defaultQuality: 'COMMON' as NpcQuality,
  /** 新建模板未指定成长模板时使用的默认预设 */
  defaultGrowthTemplate: 'balanced' as NpcGrowthTemplateId,
  /** 暴击率夹取范围 */
  minCrit: 0,
  maxCrit: 1,
} as const;

/** 品质倍率：集中配置，业务层只引用品质 ID */
export const NPC_QUALITY_DEFINITIONS: Record<NpcQuality, NpcQualityDefinition> = {
  COMMON: {
    id: 'COMMON',
    label: '普通',
    description: '普通散修 / 杂兵，无额外加成',
    statMultiplier: 1,
    critMultiplier: 1,
    color: 'slate',
  },
  ELITE: {
    id: 'ELITE',
    label: '精英',
    description: '资质出众的精锐，属性与暴击均有提升',
    statMultiplier: 1.3,
    critMultiplier: 1.15,
    color: 'sky',
  },
  BOSS: {
    id: 'BOSS',
    label: '首领',
    description: '镇守一方的首领，属性大幅提升',
    statMultiplier: 1.7,
    critMultiplier: 1.35,
    color: 'amber',
  },
  LEGENDARY: {
    id: 'LEGENDARY',
    label: '传说',
    description: '传说级存在，最终战斗属性成倍增长',
    statMultiplier: 2.2,
    critMultiplier: 1.6,
    color: 'fuchsia',
  },
};

/**
 * 四大成长模板。
 *
 * 这里同时给出 1 级基础属性与每级成长值，作为“新建 NPC 的默认值”；
 * 历史 NPC 仍可使用 npc_templates.base_* / growth_* 覆盖，不会被强制改写。
 */
export const NPC_GROWTH_TEMPLATES: Record<NpcGrowthTemplateId, NpcGrowthTemplateDefinition> = {
  warrior: {
    id: 'warrior',
    label: '战士型',
    description: '高气血、高物攻、高物防，法攻与法防偏低，成长偏肉搏',
    base: {
      hp: 15000,
      mp: 220,
      atk: 2600,
      matk: 500,
      def: 1800,
      mdef: 800,
      spd: 100,
      crit: 0.08,
    },
    growth: {
      hp: 1500,
      mp: 22,
      atk: 260,
      matk: 50,
      def: 180,
      mdef: 80,
      spd: 1,
      crit: 0.0008,
    },
  },
  mage: {
    id: 'mage',
    label: '法术型',
    description: '高法力、高法攻、高法防，气血与物防偏低，成长偏术法',
    base: {
      hp: 10000,
      mp: 520,
      atk: 700,
      matk: 3300,
      def: 800,
      mdef: 1500,
      spd: 120,
      crit: 0.06,
    },
    growth: {
      hp: 1000,
      mp: 52,
      atk: 70,
      matk: 330,
      def: 80,
      mdef: 150,
      spd: 1.2,
      crit: 0.0006,
    },
  },
  balanced: {
    id: 'balanced',
    label: '均衡型',
    description: '八维均衡发展，无明显短板，适合作为通用模板',
    base: {
      hp: 13000,
      mp: 350,
      atk: 1700,
      matk: 1700,
      def: 1300,
      mdef: 1100,
      spd: 110,
      crit: 0.07,
    },
    growth: {
      hp: 1300,
      mp: 35,
      atk: 170,
      matk: 170,
      def: 130,
      mdef: 110,
      spd: 1.1,
      crit: 0.0007,
    },
  },
  support: {
    id: 'support',
    label: '辅助型',
    description: '高气血、高法防、高内力，攻击成长较低，擅长续航与治疗',
    base: {
      hp: 12000,
      mp: 480,
      atk: 900,
      matk: 2100,
      def: 1100,
      mdef: 1500,
      spd: 105,
      crit: 0.05,
    },
    growth: {
      hp: 1200,
      mp: 48,
      atk: 90,
      matk: 210,
      def: 110,
      mdef: 150,
      spd: 1,
      crit: 0.0005,
    },
  },
};

/**
 * 境界加成表。
 * 只参与最终属性计算，绝不回写 npc_templates 的基础值或成长值。
 * aliases 用于匹配 "金丹中期" / "元婴圆满" 等带阶段文案。
 */
export const NPC_REALM_DEFINITIONS: NpcRealmDefinition[] = [
  {
    id: 'QI_REFINING',
    label: '练气',
    aliases: ['练气', '炼气'],
    percentBonus: 0.03,
    critBonus: 0.002,
  },
  {
    id: 'FOUNDATION',
    label: '筑基',
    aliases: ['筑基'],
    percentBonus: 0.06,
    critBonus: 0.004,
  },
  {
    id: 'GOLDEN_CORE',
    label: '金丹',
    aliases: ['金丹'],
    percentBonus: 0.1,
    critBonus: 0.006,
  },
  {
    id: 'NASCENT_SOUL',
    label: '元婴',
    aliases: ['元婴'],
    percentBonus: 0.16,
    critBonus: 0.01,
  },
  {
    id: 'SPIRIT_SEVERING',
    label: '化神',
    aliases: ['化神'],
    percentBonus: 0.24,
    critBonus: 0.015,
  },
  {
    id: 'VOID_REFINING',
    label: '炼虚',
    aliases: ['炼虚'],
    percentBonus: 0.34,
    critBonus: 0.02,
  },
  {
    id: 'BODY_INTEGRATION',
    label: '合体',
    aliases: ['合体'],
    percentBonus: 0.46,
    critBonus: 0.03,
  },
  {
    id: 'MAHAYANA',
    label: '大乘',
    aliases: ['大乘'],
    percentBonus: 0.6,
    critBonus: 0.04,
  },
];

export const NPC_GROWTH_TEMPLATE_IDS = Object.keys(
  NPC_GROWTH_TEMPLATES
) as NpcGrowthTemplateId[];

export const NPC_QUALITY_IDS = Object.keys(NPC_QUALITY_DEFINITIONS) as NpcQuality[];

export function isNpcQuality(value: unknown): value is NpcQuality {
  return typeof value === 'string' && value in NPC_QUALITY_DEFINITIONS;
}

export function isNpcGrowthTemplateId(value: unknown): value is NpcGrowthTemplateId {
  return typeof value === 'string' && value in NPC_GROWTH_TEMPLATES;
}

export function getNpcQualityDefinition(quality?: string | null): NpcQualityDefinition {
  return isNpcQuality(quality)
    ? NPC_QUALITY_DEFINITIONS[quality]
    : NPC_QUALITY_DEFINITIONS[NPC_ATTRIBUTE_CONFIG.defaultQuality];
}

export function getNpcGrowthTemplateDefinition(
  growthTemplate?: string | null
): NpcGrowthTemplateDefinition | null {
  return isNpcGrowthTemplateId(growthTemplate)
    ? NPC_GROWTH_TEMPLATES[growthTemplate]
    : null;
}

/** 返回属性全 0 的八维对象，避免调用方自己拼 key */
export function createEmptyNpcAttributes(): NpcAttributes {
  return {
    hp: 0,
    mp: 0,
    atk: 0,
    matk: 0,
    def: 0,
    mdef: 0,
    spd: 0,
    crit: 0,
  };
}
