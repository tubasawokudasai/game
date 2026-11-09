import { SkillStrategy } from './SkillStrategy';
import { Fighter, SkillEffect } from './types';

/** 获取受击方防御/护盾类 Buff 减伤比例 (上限 90%) */
export function getShieldReduction(defender: Fighter): number {
  let reduction = 0;
  for (const buff of defender.buffs || []) {
    if (buff.type === 'SHIELD' && buff.value > 0) {
      reduction = Math.min(0.9, reduction + buff.value);
    }
  }
  return reduction;
}

/**
 * 策略1：纯阳剑煞 (天策剑修核心爆发技 · 破甲单体伤害)
 */
export class PureYangSwordStrategy implements SkillStrategy {
  readonly skillId = 'skill_pure_yang_sword';
  readonly skillName = '纯阳剑煞·破虚';
  readonly mpCost = 120;

  canExecute(attacker: Fighter): boolean {
    return attacker.mp >= this.mpCost;
  }

  execute(attacker: Fighter, defender: Fighter): SkillEffect {
    attacker.mp -= this.mpCost;

    // 破防计算：忽略目标 30% 护甲
    const effectiveDefense = Math.max(0, defender.outerDefense * 0.7);
    const baseDamage = Math.max(10, attacker.outerAttack * 1.85 - effectiveDefense);

    // 暴击判定
    const isCrit = Math.random() < attacker.critRate;
    let finalDamage = Math.floor(isCrit ? baseDamage * attacker.critDmg : baseDamage);

    // 防御姿态减伤
    const reduction = getShieldReduction(defender);
    if (reduction > 0) {
      finalDamage = Math.max(1, Math.floor(finalDamage * (1 - reduction)));
    }

    defender.hp = Math.max(0, defender.hp - finalDamage);

    return {
      damage: finalDamage,
      heal: 0,
      isCrit,
      logText: `${attacker.name} 催动周身纯阳剑罡，使出【${this.skillName}】！${
        isCrit ? '触发致命剑意暴击！' : ''
      }${reduction > 0 ? ` (${defender.name} 处于防御姿态减免 ${(reduction * 100).toFixed(0)}% 伤害)` : ''} 对 ${defender.name} 造成 ${finalDamage} 点重创！`,
    };
  }
}

/**
 * 策略2：太清回春 (药仙医修生机技 · 治疗选中的我方目标)
 */
export class TaiQingHealingStrategy implements SkillStrategy {
  readonly skillId = 'skill_tai_qing_heal';
  readonly skillName = '太清灵雨·回春诀';
  readonly mpCost = 90;

  canExecute(attacker: Fighter): boolean {
    // 自动 AI 只做内力筛选；具体目标是否值得治疗由 canExecuteOn / 前端校验
    return attacker.mp >= this.mpCost;
  }

  canExecuteOn(attacker: Fighter, defender: Fighter): boolean {
    return (
      attacker.mp >= this.mpCost &&
      defender.hp > 0 &&
      defender.hp < defender.maxHp * 0.75
    );
  }

  execute(attacker: Fighter, defender: Fighter): SkillEffect {
    attacker.mp -= this.mpCost;

    // 回血计算：受施法者内功与目标最大生命加成
    const healAmount = Math.floor(attacker.innerAttack * 1.2 + defender.maxHp * 0.15);
    defender.hp = Math.min(defender.maxHp, defender.hp + healAmount);

    return {
      damage: 0,
      heal: healAmount,
      isCrit: false,
      logText: `${attacker.name} 默念长生引，为 ${defender.name} 唤起【${this.skillName}】，碧玉甘霖洒落，恢复 ${healAmount} 点气血！`,
    };
  }
}

/**
 * 策略3：九霄天雷 (术士轰击技 · 内功法术真实震颤)
 */
export class NineSkyThunderStrategy implements SkillStrategy {
  readonly skillId = 'skill_nine_sky_thunder';
  readonly skillName = '九霄天雷·寂灭引';
  readonly mpCost = 150;

  canExecute(attacker: Fighter): boolean {
    return attacker.mp >= this.mpCost;
  }

  execute(attacker: Fighter, defender: Fighter): SkillEffect {
    attacker.mp -= this.mpCost;

    const baseDamage = Math.max(20, attacker.innerAttack * 2.1 - defender.innerDefense * 0.5);
    const isCrit = Math.random() < attacker.critRate;
    let finalDamage = Math.floor(isCrit ? baseDamage * attacker.critDmg : baseDamage);

    const reduction = getShieldReduction(defender);
    if (reduction > 0) {
      finalDamage = Math.max(1, Math.floor(finalDamage * (1 - reduction)));
    }

    defender.hp = Math.max(0, defender.hp - finalDamage);

    return {
      damage: finalDamage,
      heal: 0,
      isCrit,
      logText: `${attacker.name} 虚空引动九天玄刹，【${this.skillName}】轰然劈落！${
        reduction > 0 ? ` (${defender.name} 处于防御姿态减免 ${(reduction * 100).toFixed(0)}% 伤害)` : ''
      }震碎灵光，造成 ${finalDamage} 点内功法术湮灭！`,
    };
  }
}

/**
 * 策略4：万剑归宗 (剑修群体绝学 · 敌方全体)
 * 多目标结算由 CombatEngine.resolveActionOnTargets 负责，内力只扣一次。
 */
export class WanJianGuizongStrategy implements SkillStrategy {
  readonly skillId = 'skill_wanjian_guizong';
  readonly skillName = '万剑归宗·荡邪';
  readonly mpCost = 220;

  canExecute(attacker: Fighter): boolean {
    return attacker.mp >= this.mpCost;
  }

  execute(attacker: Fighter, defender: Fighter): SkillEffect {
    attacker.mp -= this.mpCost;

    const baseDamage = Math.max(20, attacker.outerAttack * 1.5 - defender.outerDefense * 0.35);
    const isCrit = Math.random() < attacker.critRate;
    let finalDamage = Math.floor(isCrit ? baseDamage * attacker.critDmg : baseDamage);

    const reduction = getShieldReduction(defender);
    if (reduction > 0) {
      finalDamage = Math.max(1, Math.floor(finalDamage * (1 - reduction)));
    }

    defender.hp = Math.max(0, defender.hp - finalDamage);

    return {
      damage: finalDamage,
      heal: 0,
      isCrit,
      logText: `${attacker.name} 剑指苍穹，万剑齐发！${defender.name} 被剑罡洪流吞没，受到 ${finalDamage} 点重创！`,
    };
  }
}

/**
 * 策略5：春风化雨 (医修群体回春 · 我方全体)
 * 只对气血低于 75% 的友方生效；多目标结算时内力只扣一次。
 */
export class SpringRainStrategy implements SkillStrategy {
  readonly skillId = 'skill_spring_rain';
  readonly skillName = '春风化雨·普济';
  readonly mpCost = 160;

  canExecute(attacker: Fighter): boolean {
    return attacker.mp >= this.mpCost;
  }

  canExecuteOn(attacker: Fighter, defender: Fighter): boolean {
    return (
      attacker.mp >= this.mpCost &&
      defender.hp > 0 &&
      defender.hp < defender.maxHp * 0.75
    );
  }

  execute(attacker: Fighter, defender: Fighter): SkillEffect {
    attacker.mp -= this.mpCost;

    const healAmount = Math.floor(attacker.innerAttack * 0.8 + defender.maxHp * 0.12);
    defender.hp = Math.min(defender.maxHp, defender.hp + healAmount);

    return {
      damage: 0,
      heal: healAmount,
      isCrit: false,
      logText: `${attacker.name} 引来春风化雨，灵雨洒落，为 ${defender.name} 恢复 ${healAmount} 点气血！`,
    };
  }
}

/**
 * 策略6：平A普通近身挥砍 (兜底策略，当内力匮乏时自动降级采用)
 */
export class BasicAttackStrategy implements SkillStrategy {
  readonly skillId = 'skill_basic_attack';
  readonly skillName = '普通挥砍';
  readonly mpCost = 0;

  canExecute(): boolean {
    return true;
  }

  execute(attacker: Fighter, defender: Fighter): SkillEffect {
    const baseDamage = Math.max(5, attacker.outerAttack - defender.outerDefense);
    const isCrit = Math.random() < attacker.critRate;
    let finalDamage = Math.floor(isCrit ? baseDamage * 1.5 : baseDamage);

    const reduction = getShieldReduction(defender);
    if (reduction > 0) {
      finalDamage = Math.max(1, Math.floor(finalDamage * (1 - reduction)));
    }

    defender.hp = Math.max(0, defender.hp - finalDamage);

    return {
      damage: finalDamage,
      heal: 0,
      isCrit,
      logText: `${attacker.name} 飞身向前进行【${this.skillName}】，造成 ${finalDamage} 点伤害。`,
    };
  }
}
