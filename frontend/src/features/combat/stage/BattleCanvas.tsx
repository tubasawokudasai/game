import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { useCombatStore } from '../store/useCombatStore';
import { BattleActionType, type CombatFighter } from '../types';

interface BattleCanvasProps {
  onSelectTarget: (id: string) => void;
}

/** 敌方站位（按 slotIndex 排列：0 = 阵眼前排，1 = 中排，2 = 后排，3 = 侧翼） */
const ENEMY_SLOTS = [
  // 立绘整体缩至 50%：容器宽高减半，再用 translate 把缩小后的站位对回原中心/原脚底
  { className: 'left-[8%] top-[42%] w-[104px] h-[112px] translate-x-[52px] translate-y-[112px] z-20', tone: 'red' as const },
  { className: 'left-[4%] top-[24%] w-[96px] h-[88px] translate-x-[48px] translate-y-[88px] z-10', tone: 'amber' as const },
  { className: 'left-[6%] top-[8%] w-[72px] h-[96px] translate-x-[36px] translate-y-[96px] z-10', tone: 'rose' as const },
  { className: 'left-[1%] top-[4%] w-16 h-20 translate-x-[32px] translate-y-[80px] z-10', tone: 'rose' as const },
];

/** 我方站位（0 = 前排主控，1/2 = 后排，3 = 前排护卫） */
const ALLY_SLOTS = [
  { className: 'right-[12%] top-[42%] w-28 h-[120px] translate-x-[-56px] translate-y-[120px] z-30', tone: 'amber' as const },
  { className: 'right-[18%] top-[10%] w-20 h-[104px] translate-x-[-40px] translate-y-[104px] z-10', tone: 'cyan' as const },
  { className: 'right-[4%] top-[14%] w-[72px] h-[96px] translate-x-[-36px] translate-y-[96px] z-10', tone: 'emerald' as const },
  { className: 'right-[6%] top-[30%] w-24 h-[112px] translate-x-[-48px] translate-y-[112px] z-15', tone: 'amber' as const },
];

const TONES = {
  red: {
    label: 'text-red-200 border-red-500/40',
    bar: 'from-red-600 via-rose-500 to-amber-500',
    glow: 'drop-shadow-[0_8px_16px_rgba(239,68,68,0.45)]',
  },
  amber: {
    label: 'text-amber-200 border-amber-600/40',
    bar: 'from-amber-600 to-yellow-400',
    glow: 'drop-shadow-[0_6px_14px_rgba(245,158,11,0.45)]',
  },
  rose: {
    label: 'text-rose-200 border-rose-500/40',
    bar: 'from-rose-600 to-red-400',
    glow: 'drop-shadow-[0_4px_10px_rgba(220,38,38,0.5)]',
  },
  cyan: {
    label: 'text-cyan-200 border-cyan-500/40',
    bar: 'from-cyan-500 to-blue-400',
    glow: 'drop-shadow-[0_4px_12px_rgba(34,211,238,0.4)]',
  },
  emerald: {
    label: 'text-emerald-200 border-emerald-500/40',
    bar: 'from-emerald-500 to-teal-300',
    glow: 'drop-shadow-[0_4px_10px_rgba(16,185,129,0.4)]',
  },
};

/** 立绘缺失时用首字占位，避免空白或伪造头像 */
const FighterAvatar: React.FC<{
  fighter: CombatFighter;
  src?: string;
  className?: string;
  /** 左侧敌方镜像翻转，形成面对面的战斗站位 */
  flip?: boolean;
}> = ({ fighter, src, className = '', flip = false }) =>
  src ? (
    <img
      src={src}
      alt={fighter.name}
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
      className={`w-full h-full object-contain ${className}`}
    />
  ) : (
    <div
      className={`w-full h-full flex items-center justify-center rounded-full bg-slate-800/70 border border-slate-600 text-slate-300 text-2xl font-serif ${className}`}
    >
      {(fighter.name || '道').slice(0, 1)}
    </div>
  );

export const BattleCanvas: React.FC<BattleCanvasProps> = ({ onSelectTarget }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const slashEffectRef = useRef<HTMLDivElement>(null);
  const hitSparkRef = useRef<HTMLDivElement>(null);
  const healEffectRef = useRef<HTMLDivElement>(null);

  // 每个战斗单位的 DOM 引用：谁出手，就把谁移动到目标面前
  const fighterRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const fighterRefCallbacks = useRef<
    Map<string, (el: HTMLDivElement | null) => void>
  >(new Map());

  const {
    playerTeam,
    enemyTeam,
    selectedTargetId,
    selectedSkillId,
    selectedItemId,
    pvpSkills,
    pvpActiveUnitId,
    pvpOrderUnitIds,
    pvpOrders,
    pvpQueue,
    pvpWaiting,
    pvpSubmitted,
    pvpFinished,
    selectPvpUnit,
    selectItem,
    confirmPvpAction,
    mode,
    activeFighterId,
    actionLogs,
    phase,
    activeDialogueBubble,
  } = useCombatStore();

  const activeUnit =
    playerTeam.find((f) => f.id === pvpActiveUnitId && f.hp > 0) ||
    playerTeam.find((f) => f.hp > 0) ||
    playerTeam[0];

  const canAct =
    mode !== 'SCRIPT' &&
    phase === 'READY' &&
    pvpQueue.length === 0 &&
    !pvpWaiting &&
    !pvpSubmitted &&
    !pvpFinished;

  const canSwitchUnit = canAct;

  // 当前选中技能决定可点击的目标阵营
  const selectedSkill =
    mode !== 'SCRIPT'
      ? pvpSkills.find((skill) => skill.id === selectedSkillId)
      : undefined;

  const canSelect = (fighter: CombatFighter, side: 'ENEMY' | 'ALLY') => {
    if (!fighter.isAlive) return false;
    if (mode === 'SCRIPT') return side === 'ENEMY';
    // 若当前正在准备施用药品，我方所有存活单位均为合法目标
    if (side === 'ALLY' && selectedItemId) return true;
    if (!selectedSkill) return side === 'ENEMY';
    if (side === 'ENEMY') {
      return (
        selectedSkill.targetType === 'SINGLE_ENEMY' ||
        selectedSkill.targetType === 'ALL_ENEMIES'
      );
    }
    if (side === 'ALLY') {
      return (
        selectedSkill.targetType === 'SINGLE_ALLY' ||
        selectedSkill.targetType === 'ALL_ALLIES' ||
        (selectedSkill.targetType === 'SELF' && fighter.id === activeUnit?.id)
      );
    }
    return false;
  };

  /** 点击敌方角色立绘：若已选敌方技能且满足施法条件，直接施法（与双击技能卡一致）；否则切换目标 */
  const handleEnemyClick = (fighter: CombatFighter) => {
    if (!fighter.isAlive) return;

    onSelectTarget(fighter.id);

    // 未选技能或不可出招时仅切换目标
    if (!canAct || !selectedSkill || !activeUnit) return;

    if (
      selectedSkill.targetType === 'SINGLE_ENEMY' ||
      selectedSkill.targetType === 'ALL_ENEMIES'
    ) {
      if (activeUnit.mp < selectedSkill.costMp) return;

      const isAoe = selectedSkill.targetType === 'ALL_ENEMIES';
      confirmPvpAction({
        actorId: activeUnit.id,
        unitId: activeUnit.id,
        actionType: BattleActionType.SKILL,
        skillId: selectedSkill.id,
        targetId: isAoe ? undefined : fighter.id,
        targetIds: isAoe ? [] : [fighter.id],
      });
    }
  };

  /** 点击我方角色立绘：若选了物品则使用物品；若已选我方/自身技能则直接施法；否则切换当前下令角色 */
  const handleAllyClick = (fighter: CombatFighter) => {
    if (!fighter.isAlive) return;

    // 0. 优先判定：若当前选中了药品，点击己方立绘直接施放物品
    if (canAct && selectedItemId && activeUnit) {
      // 触发物品施放指令
      confirmPvpAction({
        actorId: activeUnit.id,
        unitId: activeUnit.id,
        actionType: BattleActionType.USE_ITEM,
        itemId: selectedItemId,
        targetId: fighter.id,
        targetIds: [fighter.id],
      });

      // 播放本地治疗/增益光效
      const targetEl = fighterRefs.current.get(fighter.id);
      const heal = healEffectRef.current;
      const stage = containerRef.current;
      if (targetEl && heal && stage) {
        const targetRect = targetEl.getBoundingClientRect();
        const stageRect = stage.getBoundingClientRect();
        const effectX = targetRect.left - stageRect.left + targetRect.width / 2;
        const effectY = targetRect.top - stageRect.top + targetRect.height / 2;

        gsap.set(heal, {
          left: effectX,
          top: effectY,
          xPercent: -50,
          yPercent: -50,
          x: 0,
          y: 0,
          opacity: 1,
          scale: 0.6,
        });
        gsap.to(heal, { scale: 1.35, opacity: 0, duration: 0.5, ease: 'power2.out' });
        gsap.fromTo(
          targetEl,
          { filter: 'brightness(1)' },
          { filter: 'brightness(1.7)', duration: 0.15, yoyo: true, repeat: 1 }
        );
      }

      // 清空选药状态并直接返回，不切换下令角色
      selectItem(null);
      return;
    }

    // 1. 若当前已选我方单体、群体或自身技能，且满足施法条件，点击立绘直接施放技能
    if (canAct && selectedSkill && activeUnit) {
      const isSingleAlly = selectedSkill.targetType === 'SINGLE_ALLY';
      const isAllAllies = selectedSkill.targetType === 'ALL_ALLIES';
      const isSelf = selectedSkill.targetType === 'SELF' && fighter.id === activeUnit.id;

      if (isSingleAlly || isAllAllies || isSelf) {
        // 治疗技能检查气血阈值（高于 75% 无法施展）
        const isHeal = selectedSkill.kind === 'HEAL';
        if (isHeal) {
          if (isSingleAlly && fighter.hp >= fighter.maxHp * 0.75) return;
          if (isSelf && activeUnit.hp >= activeUnit.maxHp * 0.75) return;
          if (isAllAllies && !playerTeam.some((f) => f.hp > 0 && f.hp < f.maxHp * 0.75)) return;
        }

        if (activeUnit.mp >= selectedSkill.costMp) {
          onSelectTarget(fighter.id);
          confirmPvpAction({
            actorId: activeUnit.id,
            unitId: activeUnit.id,
            actionType: BattleActionType.SKILL,
            skillId: selectedSkill.id,
            targetId: isAllAllies ? undefined : fighter.id,
            targetIds: isAllAllies ? [] : [fighter.id],
          });
          return;
        }
      }
    }

    // 2. 否则按原有逻辑：切换下令角色或轮换下一个角色
    if (!canSwitchUnit) return;

    const aliveOrderUnitIds = pvpOrderUnitIds.filter((id) =>
      playerTeam.some((f) => f.id === id && f.hp > 0)
    );

    // 若点击已处于下令中的角色，且己方有多个存活角色，则按阵位轮换至下一个角色
    if (fighter.id === pvpActiveUnitId && aliveOrderUnitIds.length > 1) {
      const currentIndex = aliveOrderUnitIds.indexOf(fighter.id);
      const nextId = aliveOrderUnitIds[(currentIndex + 1) % aliveOrderUnitIds.length];
      if (nextId) {
        selectPvpUnit(nextId);
        return;
      }
    }

    // 点击其他存活队友立绘：直接切换该角色为当前下令角色
    selectPvpUnit(fighter.id);
  };

  // 站位由 slotIndex 决定，阵容完全来自服务端下发的真实队伍与怪物组
  const allySlots = ALLY_SLOTS.map((slot, index) => ({
    slot,
    fighter: playerTeam.find((f) => (f.slotIndex ?? index) === index),
  }));
  const enemySlots = ENEMY_SLOTS.map((slot, index) => ({
    slot,
    fighter: enemyTeam.find((f) => (f.slotIndex ?? index) === index),
  }));

  /** 为每个单位生成稳定的 callback ref，避免每次渲染都触发卸载/重挂 */
  const getFighterRef = (id: string) => {
    let callback = fighterRefCallbacks.current.get(id);
    if (!callback) {
      callback = (el: HTMLDivElement | null) => {
        if (el) {
          fighterRefs.current.set(id, el);
        } else {
          fighterRefs.current.delete(id);
        }
      };
      fighterRefCallbacks.current.set(id, callback);
    }
    return callback;
  };

  // 出手演出：控制单位移动到目标身前 -> 命中特效 -> 归位
  // 不再切换 attackAvatar 攻击立绘，只做位移与特效。
  useEffect(() => {
    if (phase !== 'ANIMATING') return;

    const container = containerRef.current;
    const attackerEl = fighterRefs.current.get(activeFighterId);
    const targetEl = fighterRefs.current.get(selectedTargetId || '');
    if (!container || !attackerEl || !targetEl) return;

    const containerRect = container.getBoundingClientRect();
    const attackerRect = attackerEl.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();

    const attackerCx = attackerRect.left + attackerRect.width / 2;
    const attackerCy = attackerRect.top + attackerRect.height / 2;
    const targetCx = targetRect.left + targetRect.width / 2;
    const targetCy = targetRect.top + targetRect.height / 2;

    // 移动到目标身前（保留一点距离，避免两个立绘完全重叠）
    const dx = (targetCx - attackerCx) * 0.8;
    const dy = (targetCy - attackerCy) * 0.8;

    const lastLog = actionLogs[actionLogs.length - 1];
    const isHeal = Boolean(lastLog?.heal && lastLog.heal > 0);
    const isAllyAttacker = playerTeam.some((f) => f.id === activeFighterId);

    // 命中特效以目标中心为锚点（相对战场容器）
    const effectX = targetCx - containerRect.left;
    const effectY = targetCy - containerRect.top;

    const slash = slashEffectRef.current;
    const spark = hitSparkRef.current;
    const heal = healEffectRef.current;

    gsap.killTweensOf([attackerEl, targetEl]);
    if (slash) gsap.killTweensOf(slash);
    if (spark) gsap.killTweensOf(spark);
    if (heal) gsap.killTweensOf(heal);

    const tl = gsap.timeline();

    if (isHeal) {
      // 治疗：不冲锋，在施法者脚下绽放回春灵光
      tl.add(() => {
        if (heal) {
          gsap.set(heal, {
            left: effectX,
            top: effectY,
            xPercent: -50,
            yPercent: -50,
            x: 0,
            y: 0,
            opacity: 1,
            scale: 0.6,
          });
          gsap.to(heal, { scale: 1.35, opacity: 0, duration: 0.5, ease: 'power2.out' });
        }
        gsap.fromTo(
          targetEl,
          { filter: 'brightness(1)' },
          { filter: 'brightness(1.7)', duration: 0.15, yoyo: true, repeat: 1 }
        );
      });
    } else {
      // 冲锋到目标身前
      tl.to(attackerEl, {
        x: dx,
        y: dy,
        scale: 1.06,
        duration: 0.2,
        ease: 'power2.out',
      });

      // 命中瞬间：目标位置爆出斩击/火花，目标受击抖动
      tl.add(() => {
        if (slash) {
          gsap.set(slash, {
            left: effectX,
            top: effectY,
            xPercent: -50,
            yPercent: -50,
            x: 0,
            y: 0,
            opacity: 1,
            scale: 0.55,
            rotation: -18,
            filter: isAllyAttacker
              ? 'blur(2px)'
              : 'blur(2px) hue-rotate(150deg) saturate(1.4)',
          });
          gsap.to(slash, { scale: 1.35, opacity: 0, duration: 0.26, ease: 'power2.out' });
        }

        if (spark) {
          gsap.set(spark, {
            left: effectX,
            top: effectY,
            xPercent: -50,
            yPercent: -50,
            x: 0,
            y: 0,
            opacity: 1,
            scale: 0.7,
            rotation: 0,
            filter: isAllyAttacker
              ? 'none'
              : 'hue-rotate(-35deg) saturate(1.6)',
          });
          gsap.to(spark, { scale: 1.5, opacity: 0, duration: 0.22, ease: 'power2.out' });
        }

        gsap.fromTo(
          targetEl,
          { x: 0 },
          {
            x: isAllyAttacker ? -12 : 12,
            duration: 0.05,
            yoyo: true,
            repeat: 3,
            ease: 'power1.inOut',
            onComplete: () => gsap.set(targetEl, { x: 0 }),
          }
        );
      });

      // 收招归位
      tl.to(attackerEl, {
        x: 0,
        y: 0,
        scale: 1,
        duration: 0.22,
        ease: 'power1.inOut',
      });
    }

    return () => {
      tl.kill();
      gsap.set(attackerEl, { x: 0, y: 0, scale: 1 });
      gsap.set(targetEl, { x: 0 });
      if (slash) gsap.set(slash, { opacity: 0 });
      if (spark) gsap.set(spark, { opacity: 0 });
      if (heal) gsap.set(heal, { opacity: 0 });
    };
  }, [phase, activeFighterId, selectedTargetId, actionLogs, playerTeam]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none bg-slate-950 font-serif"
      style={{
        backgroundImage: `
          radial-gradient(circle at 50% 30%, rgba(20, 35, 45, 0.4) 0%, rgba(10, 15, 20, 0.95) 100%),
          url('/assets/combat/bg/battle_stage_bg.png')
        `,
        backgroundSize: 'cover',
        backgroundPosition: 'center 45%',
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-teal-950/40 via-transparent to-slate-950/80 pointer-events-none" />

      {/* 氛围台词气泡 */}
      {activeDialogueBubble && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 bg-slate-900/90 border border-amber-400/80 px-4 py-2 rounded-full shadow-[0_0_20px_rgba(245,158,11,0.5)] flex items-center gap-2 animate-bounce">
          <span className="text-xs text-amber-300 font-bold tracking-wider">
            【{activeDialogueBubble.speaker}】
          </span>
          <span className="text-sm text-amber-100 font-medium">
            {activeDialogueBubble.text}
          </span>
        </div>
      )}

      {/* 准备施用药品时的屏幕顶部中央提示横幅（使用后自动消失） */}
      {selectedItemId && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 max-w-[90%] bg-gradient-to-r from-teal-950/95 via-slate-900/95 to-teal-950/95 border-2 border-amber-400/90 px-4 py-2 rounded-full shadow-[0_0_25px_rgba(245,158,11,0.6)] flex items-center gap-2 animate-fade-in backdrop-blur-md">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping flex-shrink-0" />
          <span className="text-xs text-amber-200 font-bold tracking-wide text-center">
            点击药品已就绪，请在下方点击己方立绘完成施用
          </span>
          <button
            type="button"
            onClick={() => selectItem(null)}
            className="ml-1 text-[11px] text-slate-400 hover:text-rose-300 underline cursor-pointer flex-shrink-0"
            title="取消使用"
          >
            取消
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 敌方阵营（左侧，slotIndex 由怪物组配置决定）                              */}
      {/* ========================================================================= */}
      {enemySlots.map(({ slot, fighter }, index) =>
        fighter ? (
          <div
            key={fighter.id}
            ref={getFighterRef(fighter.id)}
            onClick={() => handleEnemyClick(fighter)}
            title={
              selectedSkill &&
              (selectedSkill.targetType === 'SINGLE_ENEMY' ||
                selectedSkill.targetType === 'ALL_ENEMIES')
                ? `点击立绘发动【${selectedSkill.name}】`
                : `${fighter.name}（点击切换目标）`
            }
            className={`absolute ${slot.className} ${
              canSelect(fighter, 'ENEMY') ? 'cursor-crosshair' : 'cursor-default'
            } ${selectedTargetId === fighter.id ? 'scale-105' : 'hover:scale-102'}`}
          >
            {selectedTargetId === fighter.id && fighter.isAlive && (
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 z-30 px-1.5 py-0.5 rounded bg-amber-600 text-white text-[9px] font-bold shadow-[0_0_8px_rgba(245,158,11,0.8)]">
                目标
              </span>
            )}

            {index === 0 && selectedTargetId === fighter.id && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                <div className="relative w-16 h-16 flex items-center justify-center animate-spin-slow">
                  <div className="absolute inset-0 border-2 border-dashed border-red-500/80 rounded-full animate-ping opacity-30" />
                  <div className="absolute inset-1 border-2 border-red-500/90 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.8)]" />
                  <div className="absolute w-full h-[2px] bg-red-400/90" />
                  <div className="absolute h-full w-[2px] bg-red-400/90" />
                </div>
                <span className="absolute px-1 py-0.5 bg-red-700 text-white text-[8px] font-black tracking-widest rounded border border-amber-300 shadow-lg animate-pulse">
                  一受击一
                </span>
              </div>
            )}

            <div className="flex flex-col items-center mb-1">
              <span
                className={`text-[11px] font-bold drop-shadow bg-slate-900/85 px-2 py-0.5 rounded border ${TONES[slot.tone].label} flex items-center gap-1 whitespace-nowrap`}
              >
                {index === 0 && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />}
                {fighter.name}
                {index === 0 && ' (阵眼)'}
              </span>
              <div className="w-16 h-1.5 bg-slate-900 rounded-full overflow-hidden mt-1 border border-slate-700">
                <div
                  className={`h-full bg-gradient-to-r ${TONES[slot.tone].bar} transition-all duration-300`}
                  style={{ width: `${Math.max(0, (fighter.hp / fighter.maxHp) * 100)}%` }}
                />
              </div>
            </div>

            <div className="w-full h-full relative">
              <FighterAvatar
                fighter={fighter}
                src={fighter.idleAvatar || fighter.avatar}
                flip
                className={`filter ${TONES[slot.tone].glow} ${
                  canSelect(fighter, 'ENEMY')
                    ? 'drop-shadow-[0_0_14px_rgba(245,158,11,0.95)]'
                    : ''
                } ${fighter.isAlive ? 'opacity-95' : 'opacity-20 grayscale'}`}
              />
            </div>
          </div>
        ) : null
      )}

      {/* ========================================================================= */}
      {/* 我方阵营（右侧，slotIndex 由出战队伍顺序决定）                            */}
      {/* ========================================================================= */}
      {allySlots.map(({ slot, fighter }, index) => {
        if (!fighter) return null;
        const isCurrentActive = mode !== 'SCRIPT' && fighter.id === pvpActiveUnitId;
        const hasOrdered = mode !== 'SCRIPT' && Boolean(pvpOrders[fighter.id]);
        const isAllyTargetCandidate = canSelect(fighter, 'ALLY');
        const isClickable = (canSwitchUnit || isAllyTargetCandidate) && fighter.isAlive;

        return (
          <div
            key={fighter.id}
            ref={getFighterRef(fighter.id)}
            onClick={() => handleAllyClick(fighter)}
            title={
              selectedItemId
                ? `点击立绘对【${fighter.name}】使用药品`
                : isAllyTargetCandidate && selectedSkill
                ? `点击立绘发动【${selectedSkill.name}】`
                : isCurrentActive
                ? `${fighter.name}（当前下令中，点击立绘轮换至下一个角色）`
                : isClickable
                ? `点击立绘切换至 ${fighter.name} 进行下令`
                : fighter.name
            }
            className={`absolute ${slot.className} ${
              isAllyTargetCandidate
                ? 'cursor-crosshair hover:scale-105 active:scale-95 transition-all duration-200'
                : isClickable
                ? 'cursor-pointer hover:scale-105 active:scale-95 transition-all duration-200'
                : 'pointer-events-none'
            }`}
          >
            {isCurrentActive && (
              <span className="absolute -top-2.5 right-0 z-30 px-1.5 py-0.5 rounded bg-gradient-to-r from-amber-500 to-amber-600 text-white text-[9px] font-bold shadow-[0_0_10px_rgba(245,158,11,0.9)] animate-pulse border border-amber-300/80">
                下令中
              </span>
            )}

            {hasOrdered && !isCurrentActive && fighter.isAlive && (
              <span className="absolute -top-2.5 right-0 z-30 px-1.5 py-0.5 rounded bg-emerald-800/90 text-emerald-200 text-[9px] font-bold shadow-[0_0_8px_rgba(16,185,129,0.7)] border border-emerald-500/70">
                已下令 ✓
              </span>
            )}

            {index === 0 && (
              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-48 h-24 scale-50 origin-bottom pointer-events-none flex items-center justify-center">
                <div className="w-40 h-20 rounded-full border-2 border-amber-400/80 bg-amber-500/10 shadow-[0_0_25px_rgba(245,158,11,0.6)] flex items-center justify-center animate-spin-slow">
                  <span className="text-amber-300 text-lg font-black opacity-80">☯</span>
                </div>
              </div>
            )}

            <div className="flex flex-col items-center mb-1 relative z-20">
              <div
                className={`flex items-center gap-1 bg-slate-900/90 px-2.5 py-0.5 rounded-full border ${TONES[slot.tone].label} shadow-md ${
                  isCurrentActive ? 'border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.6)]' : ''
                }`}
              >
                {index === 0 && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
                <span className={`text-[12px] font-bold tracking-wider whitespace-nowrap ${
                  isCurrentActive ? 'text-amber-300' : ''
                }`}>{fighter.name}</span>
              </div>
              <div className="w-16 h-1.5 bg-slate-900 rounded-full overflow-hidden mt-1 border border-slate-700">
                <div
                  className={`h-full bg-gradient-to-r ${TONES[slot.tone].bar} transition-all duration-300`}
                  style={{ width: `${Math.max(0, (fighter.hp / fighter.maxHp) * 100)}%` }}
                />
              </div>
            </div>

            <div className="w-full h-full relative">
              <FighterAvatar
                fighter={fighter}
                src={fighter.idleAvatar || fighter.avatar}
                className={`filter drop-shadow-[0_8px_20px_rgba(0,0,0,0.8)] ${
                  isAllyTargetCandidate
                    ? 'drop-shadow-[0_0_16px_rgba(16,185,129,0.95)]'
                    : isCurrentActive
                    ? 'drop-shadow-[0_0_16px_rgba(245,158,11,0.95)]'
                    : isClickable
                    ? 'hover:drop-shadow-[0_0_14px_rgba(20,184,166,0.9)]'
                    : ''
                } ${index === 0 ? '' : 'animate-float-slow'} ${
                  fighter.isAlive ? 'opacity-95' : 'opacity-20 grayscale'
                }`}
              />
            </div>
          </div>
        );
      })}

      {/* ========================================================================= */}
      {/* 技能特效层                                                               */}
      {/* ========================================================================= */}
      <div
        ref={slashEffectRef}
        className="absolute left-[30%] top-[45%] w-64 h-48 pointer-events-none z-35 opacity-0 origin-right transition-opacity"
      >
        <div className="w-full h-full bg-gradient-to-r from-transparent via-cyan-400/80 to-teal-200 rounded-full blur-[2px] shadow-[0_0_35px_rgba(34,211,238,0.9)] transform -rotate-12 scale-y-50" />
      </div>

      <div
        ref={hitSparkRef}
        className="absolute left-[20%] top-[48%] w-24 h-24 pointer-events-none z-40 opacity-0 flex items-center justify-center"
      >
        <div className="w-16 h-16 bg-amber-300 rounded-full blur-md" />
        <div className="absolute w-20 h-1 bg-amber-100 rotate-45 shadow-[0_0_15px_#f59e0b]" />
        <div className="absolute w-20 h-1 bg-amber-100 -rotate-45 shadow-[0_0_15px_#f59e0b]" />
      </div>

      {/* 回春/治疗特效：跟随施法者/目标位置由 GSAP 定位 */}
      <div
        ref={healEffectRef}
        className="absolute left-[50%] top-[50%] w-28 h-28 pointer-events-none z-40 opacity-0 flex items-center justify-center"
      >
        <div className="w-20 h-20 rounded-full border-4 border-emerald-300/80 shadow-[0_0_25px_rgba(16,185,129,0.9)]" />
        <div className="absolute w-24 h-24 rounded-full border border-emerald-200/60" />
        <span className="absolute text-emerald-200 text-2xl font-black drop-shadow">✚</span>
      </div>
    </div>
  );
};
