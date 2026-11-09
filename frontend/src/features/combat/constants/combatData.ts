import { CombatSkill } from '../types';

/**
 * 技能演出配置（技能台词的唯一真源）
 *
 * 注意：角色阵容与能力值不在这里，全部来自 D1：
 * - 我方：players + party_members + npc_instances + npc_templates
 * - 敌方：monster_groups
 */
export const DEFAULT_SKILLS: CombatSkill[] = [
  {
    id: 'skill_tiance_slash',
    name: '天策斩诀',
    costMp: 40,
    costRage: 0,
    description: '凝聚纯阳浩然剑气，以雷霆万钧之势横斩敌人，必定触发【剑意纵横】！',
    targetType: 'SINGLE_ENEMY',
    cooldown: 0,
    currentCooldown: 0,
    damageMultiplier: 2.8,
    critBonus: 0.35,
    quote: '天策神威，一剑分晓！',
    buffApplied: {
      id: 'buff_cangyun_sword_intent',
      name: '剑意纵横',
      description: '暴击伤害提升 25%',
      duration: 2,
      effectType: 'CRIT_UP',
      value: 25,
    },
  },
  {
    id: 'skill_nine_thunder',
    name: '九霄雷引',
    costMp: 80,
    costRage: 0,
    description: '引九天神雷劈落，对敌方阵中造成大额雷属性破煞伤害。',
    targetType: 'SINGLE_ENEMY',
    cooldown: 2,
    currentCooldown: 0,
    damageMultiplier: 3.2,
    critBonus: 0.2,
    quote: '九霄神雷，涤荡阴煞！',
  },
  {
    id: 'skill_liangyi_shield',
    name: '两仪护心',
    costMp: 30,
    costRage: 0,
    description: '化两仪阴阳之气于周身，构筑玄光护盾抵御 30% 伤害。',
    targetType: 'SELF',
    cooldown: 3,
    currentCooldown: 0,
    damageMultiplier: 0,
    quote: '阴阳化生，两仪不灭！',
    buffApplied: {
      id: 'buff_liangyi_shield',
      name: '两仪护心',
      description: '生成抵御伤害的玄灵护盾',
      duration: 3,
      effectType: 'SHIELD',
      value: 2000,
    },
  },
  {
    id: 'skill_wanjian_guizong',
    name: '万剑归宗',
    costMp: 0,
    costRage: 100,
    description: '【满怒绝技】万柄太虚灵剑悬空齐发，对敌方全体造成毁灭性斩杀！',
    targetType: 'ALL_ENEMIES',
    cooldown: 0,
    currentCooldown: 0,
    damageMultiplier: 5.0,
    critBonus: 0.5,
    quote: '万剑听吾令，诸邪荡无存——万剑归宗！',
  },
];
