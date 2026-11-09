import { getNpcQualityDefinition, isNpcGrowthTemplateId } from './npcAttributeConfig';
import { NPC_ATTRIBUTE_KEYS } from './npcAttributeTypes';
import { npcAttributeCalculator, NpcAttributeCalculator } from './NpcAttributeCalculator';
import type {
  NpcAttributeBonus,
  NpcAttributeBonusSet,
  NpcAttributeCalculateInput,
  NpcAttributeKey,
  NpcAttributePreviewResult,
  NpcAttributes,
  NpcCurrentState,
  NpcFinalAttributes,
  NpcLevelPreviewRow,
  NpcQuality,
} from './npcAttributeTypes';

/** npc_templates 中与属性相关的行字段（兼容旧库缺列） */
export interface NpcAttributeTemplateRow {
  base_hp?: number | null;
  base_mp?: number | null;
  base_attack?: number | null;
  base_defense?: number | null;
  base_speed?: number | null;
  base_matk?: number | null;
  base_mdef?: number | null;
  base_crit?: number | null;
  growth_hp?: number | null;
  growth_mp?: number | null;
  growth_attack?: number | null;
  growth_defense?: number | null;
  growth_speed?: number | null;
  growth_matk?: number | null;
  growth_mdef?: number | null;
  growth_crit?: number | null;
  growth_template?: string | null;
  quality?: string | null;
  bonus_json?: string | null;
}

/** npc_instances 中可覆盖模板属性的行字段 */
export interface NpcAttributeInstanceRow {
  quality?: string | null;
  growth_template?: string | null;
  realm?: string | null;
  bonus_json?: string | null;
}

export interface NpcAttributeCombatStats {
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  attack: number;
  matk: number;
  defense: number;
  mdef: number;
  speed: number;
  critRate: number;
  combatPower: number;
  level: number;
  quality: NpcQuality;
  growthTemplateId: string | null;
}

/** 兼容前端/旧装备数据中的属性别名 */
const ATTRIBUTE_ALIASES: Record<string, NpcAttributeKey> = {
  hp: 'hp',
  max_hp: 'hp',
  maxhp: 'hp',
  health: 'hp',
  mp: 'mp',
  max_mp: 'mp',
  maxmp: 'mp',
  mana: 'mp',
  atk: 'atk',
  attack: 'atk',
  outer_attack: 'atk',
  physical_attack: 'atk',
  matk: 'matk',
  magic_attack: 'matk',
  inner_attack: 'matk',
  spell_attack: 'matk',
  def: 'def',
  defense: 'def',
  outer_defense: 'def',
  physical_defense: 'def',
  mdef: 'mdef',
  magic_defense: 'mdef',
  inner_defense: 'mdef',
  spell_defense: 'mdef',
  spd: 'spd',
  speed: 'spd',
  crit: 'crit',
  crit_rate: 'crit',
  critrate: 'crit',
};

function toFiniteNumberOrUndefined(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeAttributeObject(value: unknown): Partial<NpcAttributes> {
  const result: Partial<NpcAttributes> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;

  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const key = ATTRIBUTE_ALIASES[String(rawKey).trim().toLowerCase()];
    if (!key) continue;
    const parsed = toFiniteNumberOrUndefined(rawValue);
    if (parsed !== undefined) result[key] = parsed;
  }
  return result;
}

function normalizeBonus(value: unknown): NpcAttributeBonus | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const bonus: NpcAttributeBonus = {};

  if (raw.sourceId !== undefined) bonus.sourceId = String(raw.sourceId);
  if (raw.sourceName !== undefined) bonus.sourceName = String(raw.sourceName);

  const flat = normalizeAttributeObject(raw.flat);
  const percent = normalizeAttributeObject(raw.percent);
  if (Object.keys(flat).length > 0) bonus.flat = flat;
  if (Object.keys(percent).length > 0) bonus.percent = percent;

  // 允许直接写 { "hp": 500, "atk": 20 } 作为固定值加成
  if (!bonus.flat && !bonus.percent) {
    const direct = normalizeAttributeObject(raw);
    if (Object.keys(direct).length > 0) bonus.flat = direct;
  }

  return bonus.flat || bonus.percent ? bonus : null;
}

/**
 * 解析装备 / 永久加成 JSON。
 * 支持：
 * - { equipment: [...], permanent: [...] }
 * - [{ flat: {...}, percent: {...} }]
 * - { hp: 1000, attack: 100 }
 */
export function parseNpcBonusJson(raw: unknown): NpcAttributeBonusSet {
  if (raw === null || raw === undefined || raw === '') {
    return { equipment: [], permanent: [] };
  }

  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { equipment: [], permanent: [] };
    }
  }

  if (Array.isArray(parsed)) {
    return {
      equipment: [],
      permanent: parsed.map(normalizeBonus).filter(Boolean) as NpcAttributeBonus[],
    };
  }

  if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;
    if (Array.isArray(record.equipment) || Array.isArray(record.permanent)) {
      return {
        equipment: Array.isArray(record.equipment)
          ? (record.equipment.map(normalizeBonus).filter(Boolean) as NpcAttributeBonus[])
          : [],
        permanent: Array.isArray(record.permanent)
          ? (record.permanent.map(normalizeBonus).filter(Boolean) as NpcAttributeBonus[])
          : [],
      };
    }
    const direct = normalizeBonus(parsed);
    return { equipment: [], permanent: direct ? [direct] : [] };
  }

  return { equipment: [], permanent: [] };
}

function mergeBonusSets(...sets: NpcAttributeBonusSet[]): NpcAttributeBonusSet {
  return {
    equipment: sets.flatMap((set) => set.equipment || []),
    permanent: sets.flatMap((set) => set.permanent || []),
  };
}

/** npc_templates 行 -> 计算服务入参 */
export function templateRowToAttributeSource(
  row: NpcAttributeTemplateRow
): Pick<NpcAttributeCalculateInput, 'base' | 'growth' | 'growthTemplate' | 'quality' | 'bonuses'> {
  const base: Partial<NpcAttributes> = {
    hp: toFiniteNumberOrUndefined(row.base_hp),
    mp: toFiniteNumberOrUndefined(row.base_mp),
    atk: toFiniteNumberOrUndefined(row.base_attack),
    matk: toFiniteNumberOrUndefined(row.base_matk),
    def: toFiniteNumberOrUndefined(row.base_defense),
    mdef: toFiniteNumberOrUndefined(row.base_mdef),
    spd: toFiniteNumberOrUndefined(row.base_speed),
    crit: toFiniteNumberOrUndefined(row.base_crit),
  };

  const growth: Partial<NpcAttributes> = {
    hp: toFiniteNumberOrUndefined(row.growth_hp),
    mp: toFiniteNumberOrUndefined(row.growth_mp),
    atk: toFiniteNumberOrUndefined(row.growth_attack),
    matk: toFiniteNumberOrUndefined(row.growth_matk),
    def: toFiniteNumberOrUndefined(row.growth_defense),
    mdef: toFiniteNumberOrUndefined(row.growth_mdef),
    spd: toFiniteNumberOrUndefined(row.growth_speed),
    crit: toFiniteNumberOrUndefined(row.growth_crit),
  };
  const hasGrowth = NPC_ATTRIBUTE_KEYS.some((key) => growth[key] !== undefined);

  return {
    base,
    growth: hasGrowth ? growth : undefined,
    growthTemplate: row.growth_template || null,
    quality: row.quality || null,
    bonuses: parseNpcBonusJson(row.bonus_json),
  };
}

export interface CalculateNpcFromRowsInput {
  template: NpcAttributeTemplateRow;
  instance?: NpcAttributeInstanceRow | null;
  /** monster_group_members 等槽位级品质覆盖 */
  qualityOverride?: string | null;
  /** 实例/伙伴境界；模板不再保存境界 */
  realm?: string | null;
  level: number;
  overrides?: Partial<NpcAttributes> | null;
  current?: NpcCurrentState | null;
  calculator?: NpcAttributeCalculator;
}

/**
 * 统一入口：模板行 + 实例行 + 槽位覆盖 -> 最终战斗属性。
 * combatDb、后台管理、NPC 预览都必须走这里，避免各模块自行计算公式。
 */
export function calculateNpcAttributesFromRows(
  input: CalculateNpcFromRowsInput
): NpcFinalAttributes {
  const calculator = input.calculator || npcAttributeCalculator;
  const templateSource = templateRowToAttributeSource(input.template);
  const instance = input.instance;

  const instanceBonuses = parseNpcBonusJson(instance?.bonus_json);
  const bonuses = mergeBonusSets(
    parseNpcBonusJson(templateSource.bonuses),
    instanceBonuses
  );

  return calculator.calculate({
    level: input.level,
    base: templateSource.base,
    growth: templateSource.growth,
    growthTemplate: instance?.growth_template || templateSource.growthTemplate,
    quality: input.qualityOverride || instance?.quality || templateSource.quality,
    realm: input.realm ?? instance?.realm ?? null,
    bonuses,
    overrides: input.overrides,
    current: input.current,
  });
}

/** 最终属性 -> 战斗单位需要的字段（CombatFighter 兼容） */
export function toNpcCombatStats(final: NpcFinalAttributes): NpcAttributeCombatStats {
  return {
    hp: final.currentHp,
    maxHp: final.maxHp,
    mp: final.currentMp,
    maxMp: final.maxMp,
    attack: final.atk,
    matk: final.matk,
    defense: final.def,
    mdef: final.mdef,
    speed: final.spd,
    critRate: final.crit,
    combatPower: final.combatPower,
    level: final.level,
    quality: final.quality,
    growthTemplateId: final.growthTemplateId,
  };
}

/** 后台预览：指定模板 + 多个等级 */
export function previewNpcAttributesFromRows(input: {
  template: NpcAttributeTemplateRow;
  instance?: NpcAttributeInstanceRow | null;
  qualityOverride?: string | null;
  realm?: string | null;
  levels: number[];
  overrides?: Partial<NpcAttributes> | null;
}): NpcAttributePreviewResult {
  const source = templateRowToAttributeSource(input.template);
  const instanceBonuses = parseNpcBonusJson(input.instance?.bonus_json);
  const bonuses = mergeBonusSets(parseNpcBonusJson(source.bonuses), instanceBonuses);

  const levels = npcAttributeCalculator.preview(
    {
      base: source.base,
      growth: source.growth,
      growthTemplate: input.instance?.growth_template || source.growthTemplate,
      quality: input.qualityOverride || input.instance?.quality || source.quality,
      realm: input.realm ?? input.instance?.realm ?? null,
      bonuses,
      overrides: input.overrides,
    },
    input.levels
  );

  return {
    sourceLabel: String((input.template as { name?: string }).name || ''),
    levels,
  };
}

/** 后台模板列表展示：解析出“实际生效”的 1 级基础值与成长值 */
export function resolveEffectiveGrowthProfile(row: NpcAttributeTemplateRow): {
  base: NpcAttributes;
  growth: NpcAttributes;
  growthSource: string;
  growthTemplateId: string | null;
  quality: NpcQuality;
  qualityLabel: string;
  qualityMultiplier: number;
} {
  const source = templateRowToAttributeSource(row);
  const calculator = npcAttributeCalculator;
  const base = calculator.resolveBase(source);
  const { growth, growthSource } = calculator.resolveGrowth(source);
  const qualityDefinition = getNpcQualityDefinition(source.quality);
  return {
    base,
    growth,
    growthSource,
    growthTemplateId: isNpcGrowthTemplateId(source.growthTemplate) ? source.growthTemplate : null,
    quality: qualityDefinition.id,
    qualityLabel: qualityDefinition.label,
    qualityMultiplier: qualityDefinition.statMultiplier,
  };
}

export function toLevelPreviewRows(result: NpcAttributePreviewResult): NpcLevelPreviewRow[] {
  return result.levels;
}
