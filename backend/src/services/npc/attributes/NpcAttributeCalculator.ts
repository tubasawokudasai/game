import {
  createEmptyNpcAttributes,
  getNpcGrowthTemplateDefinition,
  getNpcQualityDefinition,
  isNpcGrowthTemplateId,
  NPC_ATTRIBUTE_CONFIG,
  NPC_QUALITY_DEFINITIONS,
  NPC_REALM_DEFINITIONS,
} from './npcAttributeConfig';
import type {
  NpcAttributeBonus,
  NpcAttributeBonusSet,
  NpcAttributeBreakdown,
  NpcAttributeCalculateInput,
  NpcAttributeKey,
  NpcAttributes,
  NpcCurrentState,
  NpcFinalAttributes,
  NpcGrowthSource,
  NpcGrowthTemplateId,
  NpcLevelPreviewRow,
  NpcQuality,
  NpcRealmDefinition,
} from './npcAttributeTypes';
import { NPC_ATTRIBUTE_KEYS } from './npcAttributeTypes';

const NON_CRIT_KEYS: NpcAttributeKey[] = ['hp', 'mp', 'atk', 'matk', 'def', 'mdef', 'spd'];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeLevel(level: unknown): number {
  const parsed = Number(level);
  const safe = Number.isFinite(parsed) ? Math.floor(parsed) : NPC_ATTRIBUTE_CONFIG.baseLevel;
  return Math.min(
    NPC_ATTRIBUTE_CONFIG.maxLevel,
    Math.max(NPC_ATTRIBUTE_CONFIG.baseLevel, safe)
  );
}

function cloneAttributes(source: Partial<NpcAttributes>): NpcAttributes {
  const result = createEmptyNpcAttributes();
  for (const key of NPC_ATTRIBUTE_KEYS) {
    if (isFiniteNumber(source[key])) result[key] = Number(source[key]);
  }
  return result;
}

function roundAttributes(attributes: NpcAttributes): NpcAttributes {
  return {
    hp: Math.max(1, Math.round(attributes.hp)),
    mp: Math.max(0, Math.round(attributes.mp)),
    atk: Math.max(1, Math.round(attributes.atk)),
    matk: Math.max(0, Math.round(attributes.matk)),
    def: Math.max(0, Math.round(attributes.def)),
    mdef: Math.max(0, Math.round(attributes.mdef)),
    spd: Math.max(1, Math.round(attributes.spd)),
    crit: Math.round(
      Math.min(
        NPC_ATTRIBUTE_CONFIG.maxCrit,
        Math.max(NPC_ATTRIBUTE_CONFIG.minCrit, attributes.crit)
      ) * 10000
    ) / 10000,
  };
}

function isNpcAttributeBonus(value: unknown): value is NpcAttributeBonus {
  return Boolean(value) && typeof value === 'object' && ('flat' in (value as object) || 'percent' in (value as object));
}

function isBonusSet(value: unknown): value is NpcAttributeBonusSet {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    ('equipment' in (value as object) || 'permanent' in (value as object))
  );
}

/** 将调用方可能传入的多种加成形态统一成 equipment + permanent 两层 */
function normalizeBonusSet(
  value: NpcAttributeCalculateInput['bonuses']
): Required<NpcAttributeBonusSet> {
  const empty: Required<NpcAttributeBonusSet> = { equipment: [], permanent: [] };
  if (!value) return empty;

  if (Array.isArray(value)) {
    return { equipment: [], permanent: value.filter(isNpcAttributeBonus) };
  }
  if (isNpcAttributeBonus(value)) {
    return { equipment: [], permanent: [value] };
  }
  if (isBonusSet(value)) {
    return {
      equipment: Array.isArray(value.equipment)
        ? value.equipment.filter(isNpcAttributeBonus)
        : [],
      permanent: Array.isArray(value.permanent)
        ? value.permanent.filter(isNpcAttributeBonus)
        : [],
    };
  }
  return empty;
}

/** 匹配 "金丹中期" 这类境界文案 */
function resolveRealm(realm?: string | null): NpcRealmDefinition | null {
  if (!realm) return null;
  const normalized = String(realm).replace(/\s+/g, '');
  return (
    NPC_REALM_DEFINITIONS.find((definition) =>
      definition.aliases.some((alias) => normalized.includes(alias))
    ) || null
  );
}

function applyBonusLayer(attributes: NpcAttributes, bonuses: NpcAttributeBonus[]): NpcAttributes {
  const next = { ...attributes };
  for (const bonus of bonuses) {
    if (bonus.flat) {
      for (const key of NPC_ATTRIBUTE_KEYS) {
        const value = bonus.flat[key];
        if (isFiniteNumber(value)) next[key] += value;
      }
    }
    if (bonus.percent) {
      for (const key of NPC_ATTRIBUTE_KEYS) {
        const value = bonus.percent[key];
        if (isFiniteNumber(value)) next[key] *= 1 + value;
      }
    }
  }
  return next;
}

function estimateCombatPower(attributes: NpcAttributes): number {
  return Math.max(
    1,
    Math.round(
      attributes.atk * 1.5 +
        attributes.matk * 1.5 +
        attributes.def * 1.2 +
        attributes.mdef * 1.2 +
        attributes.hp * 0.1 +
        attributes.spd * 2 +
        attributes.crit * 1000
    )
  );
}

/**
 * NPC 属性计算服务。
 *
 * 固定流水线：
 *   1. 解析 NPC 自有基础值/成长值；成长预设仅用于补齐缺省键
 *   2. 等级成长：base + (level - 1) × growth
 *   3. 品质倍率
 *   4. 境界加成（只作用于本次输出，不修改成长模板）
 *   5. 装备与其他永久加成
 *   6. 战斗配置绝对覆盖值
 *   7. 取整 + 当前生命/内力夹取
 *
 * 所有业务模块（战斗准备、后台预览、NPC 生成）都必须走这里。
 */
export class NpcAttributeCalculator {
  /**
   * 解析 1 级基础属性。
   * 模板行会直接传入数据库中的八维基础值；成长模板仅作为新建模板时的预设补齐。
   */
  resolveBase(source: Pick<NpcAttributeCalculateInput, 'base' | 'growthTemplate'>): NpcAttributes {
    const profile = getNpcGrowthTemplateDefinition(source.growthTemplate);
    const base = profile ? cloneAttributes(profile.base) : createEmptyNpcAttributes();

    if (source.base) {
      for (const key of NPC_ATTRIBUTE_KEYS) {
        if (isFiniteNumber(source.base[key])) base[key] = Number(source.base[key]);
      }
    }

    return base;
  }

  /**
   * 解析每级成长值。
   * 优先级：数据库/调用方显式 growth > 成长模板预设 > 0。
   * 不再根据 base × 10% 推导，避免运行时兼容逻辑掩盖数据缺失。
   */
  resolveGrowth(
    source: Pick<NpcAttributeCalculateInput, 'growth' | 'growthTemplate'>
  ): { growth: NpcAttributes; growthSource: NpcGrowthSource } {
    const profile = getNpcGrowthTemplateDefinition(source.growthTemplate);
    const growth = createEmptyNpcAttributes();
    let hasExplicitGrowth = false;

    if (source.growth) {
      for (const key of NPC_ATTRIBUTE_KEYS) {
        if (isFiniteNumber(source.growth[key])) {
          growth[key] = Number(source.growth[key]);
          hasExplicitGrowth = true;
        }
      }
    }

    if (profile) {
      for (const key of NPC_ATTRIBUTE_KEYS) {
        if (!isFiniteNumber(source.growth?.[key])) {
          growth[key] = profile.growth[key];
        }
      }
    }

    const growthSource: NpcGrowthSource = hasExplicitGrowth
      ? 'database'
      : profile
        ? 'template'
        : 'none';

    return { growth, growthSource };
  }

  /** 根据等级与成长模板计算基础属性（不含品质/境界/装备） */
  calculateBaseAttributes(
    source: Pick<NpcAttributeCalculateInput, 'base' | 'growth' | 'growthTemplate'> & {
      level: number;
    }
  ): NpcAttributes {
    const level = normalizeLevel(source.level);
    const base = this.resolveBase(source);
    const { growth } = this.resolveGrowth(source);
    const result = createEmptyNpcAttributes();

    for (const key of NPC_ATTRIBUTE_KEYS) {
      result[key] = base[key] + (level - NPC_ATTRIBUTE_CONFIG.baseLevel) * growth[key];
    }
    return roundAttributes(result);
  }

  /** 直接按成长模板计算基础属性，便于数值测试与后台预览 */
  calculateFromGrowthTemplate(
    growthTemplate: NpcGrowthTemplateId | string,
    level: number
  ): NpcAttributes {
    if (!isNpcGrowthTemplateId(growthTemplate)) {
      throw new Error(`未备案的 NPC 成长模板 [${growthTemplate}]`);
    }
    return this.calculateBaseAttributes({ growthTemplate, level });
  }

  /** 应用品质倍率 */
  applyQuality(attributes: NpcAttributes, quality?: string | null): NpcAttributes {
    const definition = getNpcQualityDefinition(quality);
    const result = { ...attributes };
    for (const key of NON_CRIT_KEYS) {
      result[key] *= definition.statMultiplier;
    }
    result.crit *= definition.critMultiplier;
    return result;
  }

  /** 应用境界加成（只影响本次计算，不修改任何模板） */
  applyRealmBonus(attributes: NpcAttributes, realm?: string | null): NpcAttributes {
    const definition = resolveRealm(realm);
    if (!definition) return { ...attributes };

    const result = { ...attributes };
    for (const key of NON_CRIT_KEYS) {
      result[key] *= 1 + definition.percentBonus;
    }
    result.crit += definition.critBonus;
    return result;
  }

  /** 应用装备 + 其他永久属性加成 */
  applyBonuses(
    attributes: NpcAttributes,
    bonuses?: NpcAttributeCalculateInput['bonuses']
  ): NpcAttributes {
    const normalized = normalizeBonusSet(bonuses);
    const withEquipment = applyBonusLayer(attributes, normalized.equipment);
    return applyBonusLayer(withEquipment, normalized.permanent);
  }

  /** 应用战斗配置中的绝对覆盖值（旧 hp_override 等） */
  applyOverrides(
    attributes: NpcAttributes,
    overrides?: Partial<NpcAttributes> | null
  ): NpcAttributes {
    const result = { ...attributes };
    if (!overrides) return result;
    for (const key of NPC_ATTRIBUTE_KEYS) {
      if (isFiniteNumber(overrides[key])) result[key] = Number(overrides[key]);
    }
    return result;
  }

  /**
   * 完整计算。
   *
   * current 不传 = 新生成 NPC，按满状态初始化；
   * current 传入 = 升级/换装/重算，只夹取当前值，绝不自动恢复。
   */
  calculate(input: NpcAttributeCalculateInput): NpcFinalAttributes {
    const level = normalizeLevel(input.level);
    const base = this.resolveBase(input);
    const { growth, growthSource } = this.resolveGrowth(input);

    const leveled = createEmptyNpcAttributes();
    for (const key of NPC_ATTRIBUTE_KEYS) {
      leveled[key] = base[key] + (level - NPC_ATTRIBUTE_CONFIG.baseLevel) * growth[key];
    }

    const qualityDefinition = getNpcQualityDefinition(input.quality);
    const realmDefinition = resolveRealm(input.realm);

    const afterQuality = this.applyQuality(leveled, qualityDefinition.id);
    const afterRealm = this.applyRealmBonus(afterQuality, input.realm);
    const afterBonuses = this.applyBonuses(afterRealm, input.bonuses);
    const afterOverrides = this.applyOverrides(afterBonuses, input.overrides);
    const finalAttributes = roundAttributes(afterOverrides);

    const maxHp = finalAttributes.hp;
    const maxMp = finalAttributes.mp;
    const current = this.resolveCurrentState(input.current, maxHp, maxMp);

    const breakdown: NpcAttributeBreakdown = {
      base: leveled,
      afterQuality,
      afterRealm,
      afterBonuses,
      afterOverrides,
    };

    return {
      ...finalAttributes,
      hp: maxHp,
      mp: maxMp,
      maxHp,
      maxMp,
      currentHp: current.hp,
      currentMp: current.mp,
      level,
      quality: qualityDefinition.id,
      qualityLabel: qualityDefinition.label,
      growthSource,
      growthTemplateId: isNpcGrowthTemplateId(input.growthTemplate)
        ? input.growthTemplate
        : null,
      realm: input.realm ? String(input.realm) : '',
      realmLabel: realmDefinition?.label || (input.realm ? String(input.realm) : ''),
      breakdown,
      combatPower: estimateCombatPower(finalAttributes),
    };
  }

  /** 升级 / 换装 / 属性修正时保留当前战斗状态，仅做上限夹取 */
  recalculate(
    previous: Pick<NpcFinalAttributes, 'currentHp' | 'currentMp'> | null | undefined,
    input: NpcAttributeCalculateInput
  ): NpcFinalAttributes {
    return this.calculate({
      ...input,
      current: previous
        ? { hp: previous.currentHp, mp: previous.currentMp }
        : (input.current ?? null),
    });
  }

  /** 查看多个等级的成长属性 */
  preview(input: Omit<NpcAttributeCalculateInput, 'level' | 'current'>, levels: number[]): NpcLevelPreviewRow[] {
    const normalizedLevels = Array.from(
      new Set((levels.length > 0 ? levels : [1]).map((level) => normalizeLevel(level)))
    ).sort((a, b) => a - b);

    return normalizedLevels.map((level) => {
      const final = this.calculate({ ...input, level, current: null });
      return {
        level: final.level,
        maxHp: final.maxHp,
        maxMp: final.maxMp,
        atk: final.atk,
        matk: final.matk,
        def: final.def,
        mdef: final.mdef,
        spd: final.spd,
        crit: final.crit,
        quality: final.quality,
        qualityLabel: final.qualityLabel,
        growthSource: final.growthSource,
        growthTemplateId: final.growthTemplateId,
      };
    });
  }

  /** 后台展示用的战力估算 */
  estimateCombatPower(attributes: Pick<NpcAttributes, NpcAttributeKey>): number {
    return estimateCombatPower(attributes as NpcAttributes);
  }

  /** 品质配置列表（只读副本，供后台展示） */
  listQualities() {
    return Object.values(NPC_QUALITY_DEFINITIONS);
  }

  private resolveCurrentState(
    current: NpcCurrentState | null | undefined,
    maxHp: number,
    maxMp: number
  ): NpcCurrentState {
    if (!current) {
      return { hp: maxHp, mp: maxMp };
    }
    const hp = isFiniteNumber(current.hp) ? current.hp : maxHp;
    const mp = isFiniteNumber(current.mp) ? current.mp : maxMp;
    return {
      hp: Math.min(maxHp, Math.max(0, Math.round(hp))),
      mp: Math.min(maxMp, Math.max(0, Math.round(mp))),
    };
  }
}

/** 全服共享的无状态计算器实例 */
export const npcAttributeCalculator = new NpcAttributeCalculator();

