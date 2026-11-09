/**
 * 战斗数据模型 (纯数据层，与结算策略完全解耦)
 */

import { BattleActionType, BattleActionCommand } from '../../models/combat';
export { BattleActionType, BattleActionCommand };

export interface Buff {
  id: string;
  name: string;
  type: 'STAT_BUFF' | 'DOT' | 'HOT' | 'SHIELD';
  value: number;
  remainingRounds: number;
}

export interface Fighter {
  id: string;
  name: string;
  realm: string;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  outerAttack: number;    // 外功攻击
  innerAttack: number;    // 内功攻击
  outerDefense: number;   // 外功防御
  innerDefense: number;   // 内功防御
  critRate: number;       // 暴击概率 (0.0 - 1.0)
  critDmg: number;        // 暴击倍率 (如 2.15)
  speed: number;          // 出手敏捷先攻
  buffs: Buff[];
  equippedSkills: string[];
}

export interface SkillEffect {
  damage: number;
  heal: number;
  isCrit: boolean;
  appliedBuff?: Buff;
  logText: string;
}

export interface RoundLog {
  round: number;
  attackerId: string;
  attackerName: string;
  defenderId: string;
  defenderName: string;
  skillName: string;
  effect: SkillEffect;
  defenderHpRemaining: number;
}

export interface BattleResult {
  winnerId: string;
  winnerName: string;
  roundsCount: number;
  logs: RoundLog[];
}

/**
 * 多人队伍对决结果（服务端唯一裁决口径）
 */
export interface TeamBattleResult {
  result: 'WIN' | 'LOSE';
  roundsCount: number;
  logs: RoundLog[];
  allies: Fighter[];
  enemies: Fighter[];
}

export interface ItemLookupResult {
  id: string;
  itemId: string;
  itemName: string;
  count: number;
  usable: boolean;
  hpGain?: number;
  mpGain?: number;
}

export interface BattleContext {
  round: number;
  actor: Fighter;
  allies: Fighter[];
  enemies: Fighter[];
  battleMode?: 'PVP' | 'PVE';
  battleType?: string;
  allowEscape?: boolean;
  findItem?: (
    actorId: string,
    itemId: string
  ) => Promise<ItemLookupResult | null> | ItemLookupResult | null;
  deductItem?: (
    actorId: string,
    itemId: string,
    count: number
  ) => Promise<boolean> | boolean;
  extra?: Record<string, unknown>;
}

export interface BattleActionResult {
  success: boolean;
  events: RoundLog[];
  escaped?: boolean;
  message?: string;
  itemDeducted?: boolean;
}
