import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCombatStore, getUnitSkills } from '../../store/useCombatStore';
import { usePlayerStore } from '../../../../store/usePlayerStore';
import { InventoryItem } from '../../../../types/game';
import { COMBAT_TARGET_LABELS, CombatSkillInfo, BattleActionType } from '../../types';
import {
  Shield,
  Swords,
  Package,
  Zap,
  Timer,
  HeartPulse,
  DoorOpen,
  X,
} from 'lucide-react';

/** 与 NPC 播片操作栏保持一致的技能微缩图案 */
const SkillArt: React.FC<{ skillId: string; isHeal: boolean }> = ({ skillId, isHeal }) => {
  if (isHeal || skillId === 'skill_spring_rain') {
    return <HeartPulse className="w-5 h-5 text-emerald-300" />;
  }
  if (skillId.includes('thunder')) {
    return <Zap className="w-5 h-5 text-blue-400 fill-blue-500/40" />;
  }
  if (skillId.includes('shield') || skillId.includes('liangyi')) {
    return <Shield className="w-5 h-5 text-cyan-300" />;
  }
  if (
    skillId.includes('sword') ||
    skillId.includes('tiance') ||
    skillId.includes('wanjian') ||
    skillId.includes('attack')
  ) {
    return <Swords className="w-5 h-5 text-amber-300" />;
  }
  return (
    <div className="w-5 h-5 rounded-full border border-teal-400 bg-teal-500/20 flex items-center justify-center text-[10px] text-teal-300">
      ☯
    </div>
  );
};

/**
 * 实时回合制操作栏 (TurnActionBar)
 *
 * PVP 切磋与 PVE NPC 战共用同一套操作面板：
 * 左侧行动角色头像 + 气血/内力，右侧四枚快捷指令，下方 4 列技能卡，
 * 回合倒计时、下令队列、目标选择与整批提交在两种战斗中完全一致，
 * 只有标题/结算文案按战斗来源区分。
 */
const TurnActionBar: React.FC = () => {
  const {
    playerTeam,
    enemyTeam,
    pvpSkills,
    pvpRound,
    pvpDeadline,
    pvpClockOffset,
    pvpWaiting,
    pvpSubmitted,
    pvpQueue,
    pvpFinished,
    phase,
    mode,
    selectedSkillId,
    selectedTargetId,
    selectedItemId,
    pvpOrderUnitIds,
    pvpActiveUnitId,
    pvpOrders,
    selectPvpUnit,
    selectPvpSkill,
    selectItem,
    confirmPvpAction,
  } = useCombatStore();

  const inventory = usePlayerStore((s) => s.inventory);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isEscapeModalOpen, setIsEscapeModalOpen] = useState(false);

  const [now, setNow] = useState<number>(() => Date.now());
  // 兼容鼠标双击与移动端双击（移动端浏览器不一定派发 dblclick）
  const lastSkillClickRef = useRef<{ skillId: string; at: number } | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  // 当前正在下令的己方单位；若已全部下令/提交则回退到第一个存活单位
  const activeUnit =
    playerTeam.find((f) => f.id === pvpActiveUnitId && f.hp > 0) ||
    playerTeam.find((f) => f.hp > 0) ||
    playerTeam[0];
  if (!activeUnit) return null;

  const remaining =
    pvpDeadline > 0
      ? Math.max(0, Math.ceil((pvpDeadline - (now + pvpClockOffset)) / 1000))
      : 0;
  const playing = pvpQueue.length > 0;
  const canAct =
    phase === 'READY' &&
    !playing &&
    !pvpWaiting &&
    !pvpSubmitted &&
    !pvpFinished &&
    remaining > 0;

  const aliveAllies = playerTeam.filter((f) => f.hp > 0);
  const aliveEnemies = enemyTeam.filter((f) => f.hp > 0);
  const aliveOrderUnitIds = pvpOrderUnitIds.filter((id) =>
    playerTeam.some((f) => f.id === id && f.hp > 0)
  );

  // 当前行动角色的真实装配技能（由后端下发，伙伴专属或主角技能）
  const activeUnitSkills = getUnitSkills(activeUnit, pvpSkills);
  const selectedSkill = activeUnitSkills.find((s) => s.id === selectedSkillId) || pvpSkills.find((s) => s.id === selectedSkillId) || null;
  const targetType = selectedSkill?.targetType;
  const isEnemyTarget = targetType === 'SINGLE_ENEMY';
  const isAllyTarget = targetType === 'SINGLE_ALLY' || targetType === 'SELF';
  const isAoe = targetType === 'ALL_ENEMIES' || targetType === 'ALL_ALLIES';

  const enemyTarget =
    enemyTeam.find((f) => f.id === selectedTargetId && f.hp > 0) || aliveEnemies[0];
  const allyTarget =
    playerTeam.find((f) => f.id === selectedTargetId && f.hp > 0) || aliveAllies[0];
  const target = isAllyTarget ? allyTarget : enemyTarget;

  const healTarget =
    targetType === 'SELF' ? activeUnit : targetType === 'SINGLE_ALLY' ? target : undefined;
  const healBlocked = Boolean(
    selectedSkill?.kind === 'HEAL' &&
      (targetType === 'ALL_ALLIES'
        ? !aliveAllies.some((f) => f.hp < f.maxHp * 0.75)
        : healTarget && healTarget.hp >= healTarget.maxHp * 0.75)
  );

  const orderedCount = pvpOrderUnitIds.filter((id) => Boolean(pvpOrders[id])).length;

  const hpPercent = Math.max(0, Math.min(100, (activeUnit.hp / activeUnit.maxHp) * 100));
  const mpPercent = Math.max(0, Math.min(100, (activeUnit.mp / activeUnit.maxMp) * 100));

  const isPve = mode === 'PVE';
  const statusText = pvpFinished
    ? isPve
      ? '战斗已毕'
      : '切磋已毕'
    : phase === 'INTRO'
    ? '双方入阵…'
    : playing
    ? '本回合演武中…'
    : pvpWaiting || pvpSubmitted
    ? isPve
      ? '已提交，等待敌方出招…'
      : '已提交，等待对方…'
    : remaining <= 0
    ? '时间到，等待裁决…'
    : `第 ${pvpRound} 回合 · ${remaining}s`;

  const statusTone =
    pvpWaiting || pvpSubmitted
      ? 'text-amber-300 animate-pulse'
      : remaining <= 0
      ? 'text-rose-300'
      : 'text-teal-300';

  // 获取战斗可用消耗品
  const consumableItems = inventory.filter(
    (i: InventoryItem) =>
      !i.isEquipped &&
      i.count > 0 &&
      (i.itemType === 'CONSUMABLE' ||
        i.category === 'MEDICINE' ||
        i.itemId.startsWith('item_healing') ||
        i.itemId.startsWith('item_juqi') ||
        i.itemId.startsWith('item_zhuji') ||
        i.itemId.startsWith('item_jindan'))
  );

  const displayItems =
    consumableItems.length > 0
      ? consumableItems
      : [
          {
            id: 'fallback_hc',
            playerId: '',
            itemId: 'item_healing_dan',
            itemName: '回春金疮散',
            itemType: 'CONSUMABLE' as const,
            count: 3,
            isEquipped: false,
            quality: 'COMMON' as const,
            enhanceLevel: 0,
            description: '疗伤灵药，回复 3000 点气血',
          },
          {
            id: 'fallback_jq',
            playerId: '',
            itemId: 'item_juqi_dan',
            itemName: '聚气丹',
            itemType: 'CONSUMABLE' as const,
            count: 5,
            isEquipped: false,
            quality: 'COMMON' as const,
            enhanceLevel: 0,
            description: '凝神聚气，回复 500 点真气法力',
          },
        ];

  const selectedItemInfo = selectedItemId
    ? displayItems.find((i) => i.itemId === selectedItemId)
    : null;

  const targetPrompt = selectedItemInfo
    ? `施用药品：【${selectedItemInfo.itemName}】`
    : !selectedSkill
    ? '请先选择技能'
    : isAoe
    ? '作用目标：全体'
    : targetType === 'SELF'
    ? '作用目标：自身'
    : isEnemyTarget
    ? '作用目标：敌方单体'
    : isAllyTarget
    ? '作用目标：我方单体'
    : '无需选择目标';

  const targetHint = selectedItemInfo
    ? '点击己方立绘完成施用（点击取消）'
    : !selectedSkill
    ? '双击技能卡发动'
    : isAoe
    ? '点击立绘或双击技能卡发动'
    : targetType === 'SELF'
    ? '点击自身立绘或双击技能卡发动'
    : isEnemyTarget
    ? '点击敌方立绘或双击技能卡发动'
    : '点击我方立绘或双击技能卡发动';

  /** 快捷指令：按阵位轮换当前下令角色（亦可点击角色头像或立绘切换） */
  const handleCycleUnit = () => {
    if (!canAct || aliveOrderUnitIds.length <= 1) return;
    const currentIndex = aliveOrderUnitIds.indexOf(activeUnit.id);
    const nextId = aliveOrderUnitIds[(currentIndex + 1) % aliveOrderUnitIds.length];
    if (nextId) selectPvpUnit(nextId);
  };

  /** 快捷指令1：普攻（对当前选定的合法敌方目标执行普通攻击） */
  const handleNormalAttack = () => {
    if (!canAct) return;
    const targetFighter = enemyTarget || aliveEnemies[0];
    if (!targetFighter) return;
    confirmPvpAction({
      actorId: activeUnit.id,
      unitId: activeUnit.id,
      actionType: BattleActionType.NORMAL_ATTACK,
      skillId: 'skill_basic_attack',
      targetId: targetFighter.id,
      targetIds: [targetFighter.id],
    });
  };

  /** 快捷指令2：防御（当前角色进入防御状态，本回合受到的伤害降低） */
  const handleDefend = () => {
    if (!canAct) return;
    confirmPvpAction({
      actorId: activeUnit.id,
      unitId: activeUnit.id,
      actionType: BattleActionType.DEFEND,
      targetId: activeUnit.id,
      targetIds: [activeUnit.id],
    });
  };

  /** 快捷指令3：物品（打开物品选择弹窗） */
  const handleOpenItemModal = () => {
    if (!canAct) return;
    setIsItemModalOpen(true);
  };

  /** 快捷指令4：逃跑（弹出二次确认框） */
  const handleOpenEscapeModal = () => {
    if (!canAct) return;
    setIsEscapeModalOpen(true);
  };

  const handleConfirmEscape = () => {
    if (!canAct) return;
    confirmPvpAction({
      actorId: activeUnit.id,
      unitId: activeUnit.id,
      actionType: BattleActionType.ESCAPE,
      targetId: activeUnit.id,
      targetIds: [activeUnit.id],
    });
    setIsEscapeModalOpen(false);
  };

  /** 双击技能卡：选中并直接发动当前单位指令；全部单位下令后自动整批提交 */
  const handleSkillDoubleClick = (skill: CombatSkillInfo) => {
    if (!canAct) return;

    selectPvpSkill(skill.id);

    // selectPvpSkill 会按技能目标类型修正 selectedTargetId，这里读取修正后的目标
    const state = useCombatStore.getState();
    const actionTarget =
      skill.targetType === 'SINGLE_ENEMY'
        ? state.selectedTargetId || enemyTarget?.id
        : skill.targetType === 'SINGLE_ALLY'
        ? state.selectedTargetId || allyTarget?.id
        : skill.targetType === 'SELF'
        ? activeUnit.id
        : undefined;

    confirmPvpAction({
      actorId: activeUnit.id,
      unitId: activeUnit.id,
      actionType: BattleActionType.SKILL,
      skillId: skill.id,
      targetId: actionTarget,
      targetIds: actionTarget ? [actionTarget] : [],
    });
  };

  /** 统一处理单击/双击：单击选中，320ms 内再次点击同一技能即发动 */
  const handleSkillClick = (skill: CombatSkillInfo) => {
    if (!canAct) return;

    const nowMs = Date.now();
    const last = lastSkillClickRef.current;

    if (last && last.skillId === skill.id && nowMs - last.at <= 320) {
      lastSkillClickRef.current = null;
      handleSkillDoubleClick(skill);
      return;
    }

    lastSkillClickRef.current = { skillId: skill.id, at: nowMs };
    selectPvpSkill(skill.id);
  };

  return (
    <div className="w-full bg-[#0d161a]/95 border-t border-teal-900/60 p-3 flex flex-col gap-2.5 backdrop-blur-md select-none font-serif z-40">
      {/* 顶部：当前行动角色 + 双状态条 + 四枚快捷指令（与 NPC 操作栏同构） */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          {/* 圆形姓名印章：点击可轮换下令角色 */}
          <button
            type="button"
            onClick={handleCycleUnit}
            disabled={!canAct || aliveOrderUnitIds.length <= 1}
            title={
              aliveOrderUnitIds.length > 1
                ? `点击轮换下令角色（当前: ${activeUnit.name}）`
                : activeUnit.name
            }
            className="relative w-12 h-12 rounded-full border-2 border-emerald-500/70 bg-gradient-to-br from-emerald-800 to-teal-950 flex items-center justify-center shadow-[0_0_12px_rgba(16,185,129,0.5)] flex-shrink-0 hover:scale-105 active:scale-95 transition-transform disabled:hover:scale-100 cursor-pointer"
          >
            <span className="text-emerald-100 text-xl font-bold font-serif">
              {(activeUnit.name || '道').slice(0, 1)}
            </span>
          </button>

          {/* 角色名称、状态与气血/内力条 */}
          <div className="flex flex-col flex-1 min-w-0 justify-center gap-1">
            <div className="flex items-center gap-2 text-xs min-w-0">
              <span className="text-emerald-200 font-bold text-sm tracking-wide truncate">
                {activeUnit.name}
              </span>
              <span className="text-[11px] text-teal-400/90 font-serif flex-shrink-0">
                下令中
              </span>
            </div>

            {/* HP 条 */}
            <div className="relative w-full h-3 bg-slate-900/90 rounded-sm overflow-hidden border border-emerald-950 flex items-center">
              <div
                className="h-full bg-gradient-to-r from-emerald-600 to-green-400 transition-all duration-300"
                style={{ width: `${hpPercent}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-[8px] min-[440px]:text-[9px] font-bold text-white drop-shadow">
                HP {Math.max(0, Math.ceil(activeUnit.hp)).toLocaleString()} /{' '}
                {activeUnit.maxHp.toLocaleString()}
              </span>
            </div>

            {/* MP 条 */}
            <div className="relative w-full h-3 bg-slate-900/90 rounded-sm overflow-hidden border border-blue-950 flex items-center">
              <div
                className="h-full bg-gradient-to-r from-cyan-600 to-blue-400 transition-all duration-300"
                style={{ width: `${mpPercent}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-[8px] min-[440px]:text-[9px] font-bold text-white drop-shadow">
                MP {Math.max(0, Math.floor(activeUnit.mp))} / {activeUnit.maxMp}
              </span>
            </div>
          </div>
        </div>

        {/* 右侧四枚快捷指令：普攻 / 防御 / 物品 / 逃跑 */}
        <div className="flex items-center gap-1 min-[440px]:gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={handleNormalAttack}
            disabled={!canAct}
            title="选择普通攻击（对当前选定目标发起攻击）"
            className="w-10 h-10 min-[440px]:w-12 min-[440px]:h-12 rounded border border-teal-800/60 bg-slate-900/80 hover:bg-teal-900/50 active:scale-95 text-[10px] min-[440px]:text-xs text-teal-200 font-bold flex flex-col items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Swords className="w-3.5 h-3.5 text-teal-400 mb-0.5" />
            <span>普攻</span>
          </button>

          <button
            type="button"
            onClick={handleDefend}
            disabled={!canAct}
            title="防御：本回合进入御守姿态，降低受到的伤害"
            className="w-10 h-10 min-[440px]:w-12 min-[440px]:h-12 rounded border border-cyan-800/70 bg-cyan-950/40 hover:bg-cyan-900/50 active:scale-95 text-[10px] min-[440px]:text-xs text-cyan-200 font-bold flex flex-col items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Shield className="w-3.5 h-3.5 text-cyan-400 mb-0.5" />
            <span>防御</span>
          </button>

          <button
            type="button"
            onClick={handleOpenItemModal}
            disabled={!canAct}
            title="物品：打开乾坤行囊使用战斗消耗品"
            className="w-10 h-10 min-[440px]:w-12 min-[440px]:h-12 rounded border border-amber-800/70 bg-amber-950/30 hover:bg-amber-900/50 active:scale-95 text-[10px] min-[440px]:text-xs text-amber-200 font-bold flex flex-col items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Package className="w-3.5 h-3.5 text-amber-400 mb-0.5" />
            <span>物品</span>
          </button>

          <button
            type="button"
            onClick={handleOpenEscapeModal}
            disabled={!canAct}
            title="逃跑：尝试施展遁术脱离战场"
            className="w-10 h-10 min-[440px]:w-12 min-[440px]:h-12 rounded border border-rose-900/70 bg-rose-950/30 hover:bg-rose-900/50 active:scale-95 text-[10px] min-[440px]:text-xs text-rose-200 font-bold flex flex-col items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <DoorOpen className="w-3.5 h-3.5 text-rose-400 mb-0.5" />
            <span>逃跑</span>
          </button>
        </div>
      </div>

      {/* 回合状态 + 我方下令队列：每个存活角色一个指令 */}
      <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
        <span
          className={`flex-shrink-0 text-[10px] font-bold flex items-center gap-0.5 ${statusTone}`}
        >
          <Timer className="w-3 h-3" />
          {statusText}
        </span>
        <span className="flex-shrink-0 text-[10px] text-slate-500 ml-1 mr-0.5">
          下令 {orderedCount}/{pvpOrderUnitIds.length}
        </span>
        {pvpOrderUnitIds.map((unitId) => {
          const unit = playerTeam.find((f) => f.id === unitId);
          if (!unit) return null;
          const ordered = Boolean(pvpOrders[unitId]);
          const active = unitId === pvpActiveUnitId;
          return (
            <button
              key={unitId}
              type="button"
              onClick={() => selectPvpUnit(unitId)}
              disabled={!canAct}
              className={`flex-shrink-0 px-2 py-0.5 rounded-sm border text-[10px] font-bold transition-all ${
                active
                  ? 'border-amber-300 bg-amber-500/20 text-amber-200 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                  : ordered
                  ? 'border-emerald-700/70 bg-emerald-950/60 text-emerald-300'
                  : 'border-slate-700 bg-slate-900/80 text-slate-400'
              } ${canAct ? 'cursor-pointer hover:border-amber-400/80' : 'cursor-not-allowed opacity-70'}`}
            >
              {unit.name}
              <span className="ml-1">
                {ordered ? '✓' : `${Math.max(0, Math.ceil((unit.hp / unit.maxHp) * 100))}%`}
              </span>
            </button>
          );
        })}
      </div>

      {/* 目标提示 */}
      <div className="flex items-center justify-between gap-2 text-[10px] px-0.5">
        <span className="text-slate-400 truncate min-w-0">
          {selectedItemInfo ? (
            <span className="text-amber-300 font-bold">
              {targetPrompt}
            </span>
          ) : (
            <>
              {targetPrompt}：
              <span
                className={
                  targetType === 'ALL_ALLIES' || isAllyTarget
                    ? 'text-emerald-300 font-bold ml-1'
                    : 'text-rose-300 font-bold ml-1'
                }
              >
                {isAoe ? '全体' : target?.name || '—'}
              </span>
              {healBlocked && (
                <span className="ml-2 text-rose-400">
                  {targetType === 'ALL_ALLIES'
                    ? '我方无低于 75% 的可治疗目标'
                    : '目标气血高于 75%，无法施展回春'}
                </span>
              )}
            </>
          )}
        </span>
        {selectedItemInfo ? (
          <button
            type="button"
            onClick={() => selectItem(null)}
            className="text-amber-300 hover:text-amber-200 underline font-bold flex-shrink-0 cursor-pointer"
          >
            {targetHint}
          </button>
        ) : (
          <span className="text-slate-500 flex-shrink-0">{targetHint}</span>
        )}
      </div>

      {/* 技能选择：展示当前行动角色的真实技能，固定一排，4 张可见，多出的横向滚动 */}
      <div className="flex gap-2 py-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {activeUnitSkills.map((skill) => {
          const isHeal = skill.kind === 'HEAL';
          const notEnoughMp = activeUnit.mp < skill.costMp;
          const isSelected = selectedSkillId === skill.id;
          const disabled = !canAct || notEnoughMp;

          return (
            <button
              key={skill.id}
              type="button"
              title={`${skill.description}\n双击发动`}
              onClick={() => handleSkillClick(skill)}
              disabled={disabled}
              className={`relative w-[calc(25%_-_14px)] flex-shrink-0 rounded-sm p-1.5 flex flex-col justify-between h-20 transition-all border overflow-hidden ${
                isSelected
                  ? 'border-amber-400/90 bg-gradient-to-b from-teal-900/80 to-slate-950 shadow-[0_0_10px_rgba(245,158,11,0.5)]'
                  : isHeal
                  ? 'border-emerald-600/80 bg-gradient-to-b from-emerald-950/80 to-slate-950'
                  : 'border-teal-900/80 bg-slate-900/90 hover:border-teal-700/80'
              } ${
                disabled ? 'opacity-40 grayscale cursor-not-allowed' : 'active:scale-95 cursor-pointer'
              }`}
            >
              {/* 技能名称 */}
              <div className="w-full flex items-center justify-center">
                <span
                  className={`text-[12px] font-bold tracking-wider leading-tight text-center ${
                    isSelected ? 'text-amber-300' : isHeal ? 'text-emerald-100' : 'text-slate-200'
                  }`}
                >
                  {skill.name}
                </span>
              </div>

              {/* 技能微缩动态光影图 */}
              <div className="flex-1 flex items-center justify-center my-0.5 pointer-events-none">
                <SkillArt skillId={skill.id} isHeal={isHeal} />
              </div>

              {/* 底部：作用目标 + 内力消耗 */}
              <div className="w-full flex flex-col min-[440px]:flex-row items-center justify-center gap-0.5 min-[440px]:gap-1">
                <span
                  className={`text-[8px] px-0.5 rounded-sm font-bold ${
                    isHeal
                      ? 'text-emerald-200 bg-emerald-950/80'
                      : 'text-amber-200 bg-amber-950/60'
                  }`}
                >
                  {COMBAT_TARGET_LABELS[skill.targetType]}
                </span>
                <span
                  className={`text-[10px] font-mono ${
                    notEnoughMp ? 'text-rose-400' : 'text-cyan-300/90'
                  }`}
                >
                  {skill.costMp > 0 ? `MP ${skill.costMp}` : '无消耗'}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* 物品选择弹窗：通过 Portal 挂载到 document.body，脱离底部 ActionBar，真正居中于整个屏幕 */}
      {isItemModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-serif">
            <div className="relative w-full max-w-sm max-h-[60vh] bg-[#0d161a] border-2 border-teal-700/80 rounded-lg p-4 pb-5 shadow-2xl flex flex-col gap-3 animate-fade-in overflow-hidden">
              {/* 顶部标题与关闭按钮 */}
              <div className="flex items-center justify-between border-b border-teal-900/70 pb-2 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-amber-400" />
                  <span className="text-base font-bold text-amber-200 tracking-wider">
                    乾坤行囊 · 战斗消耗
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsItemModalOpen(false)}
                  className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800/60 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 消耗品列表：单行展示药品名称、剩余数量、效果描述，点击直接设为准备施用状态并关闭弹窗 */}
              <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 pr-1.5 pb-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:block [&::-webkit-scrollbar-track]:bg-slate-900/60 [&::-webkit-scrollbar-thumb]:bg-teal-700/80 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-teal-600 [scrollbar-width:thin] [scrollbar-color:#0f766e_rgba(15,23,42,0.6)]">
                {displayItems.map((item: InventoryItem) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      selectItem(item.itemId);
                      setIsItemModalOpen(false);
                    }}
                    className="w-full p-2.5 rounded border text-left flex items-center justify-between transition-all border-teal-900/70 bg-slate-900/70 hover:border-amber-400/80 hover:bg-amber-500/10 active:scale-95 group cursor-pointer flex-shrink-0"
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-200 group-hover:text-amber-300">
                          {item.itemName}
                        </span>
                        <span className="text-[10px] px-1 rounded bg-teal-950/80 border border-teal-800 text-teal-300">
                          余 {item.count}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 truncate mt-0.5">
                        {item.description || '恢复战斗状态'}
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-amber-400/80 group-hover:text-amber-300 flex-shrink-0">
                      使用 →
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* 逃跑二次确认弹窗 */}
      {isEscapeModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-serif">
            <div className="relative w-full max-w-xs bg-[#0d161a] border-2 border-rose-800/80 rounded-lg p-5 shadow-2xl flex flex-col items-center text-center gap-3 animate-fade-in">
              <div className="w-12 h-12 rounded-full border border-rose-600 bg-rose-950/60 flex items-center justify-center text-rose-300 shadow-[0_0_15px_rgba(225,29,72,0.4)]">
                <DoorOpen className="w-6 h-6" />
              </div>
              <h4 className="text-base font-bold text-rose-200 tracking-wider">
                施展遁法 · 逃离战场
              </h4>
              <p className="text-xs text-rose-100/70 leading-relaxed">
                强敌环伺，是否决意尝试施展遁术逃离？
                <br />
                <span className="text-amber-300/80 text-[11px]">
                  若逃脱成功将即刻脱险；若被敌方识破将消耗本回合行动机会。
                </span>
              </p>
              <div className="flex items-center gap-2.5 w-full pt-1">
                <button
                  type="button"
                  onClick={() => setIsEscapeModalOpen(false)}
                  className="flex-1 py-2 rounded border border-slate-700 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 text-xs font-bold active:scale-95"
                >
                  收势再战
                </button>
                <button
                  type="button"
                  onClick={handleConfirmEscape}
                  className="flex-1 py-2 rounded bg-gradient-to-r from-rose-700 to-red-800 hover:from-rose-600 hover:to-red-700 text-white text-xs font-bold shadow-[0_0_12px_rgba(225,29,72,0.6)] active:scale-95"
                >
                  决意遁走
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

const ScriptActionBar: React.FC = () => {
  const {
    playerTeam,
    skills,
    selectedSkillId,
    selectSkill,
    triggerNormalAttack,
    triggerDefend,
    triggerUseItem,
    skipPerformance,
    phase,
    autoBattle,
    toggleAutoBattle,
    battleSpeed,
    toggleBattleSpeed,
    script,
    scriptIndex,
  } = useCombatStore();

  // 行动者 = 服务端下发的出战阵容首位（前排主控）
  const cangyun = playerTeam[0];

  const totalMoves = script.length;
  const hpPercent = cangyun ? Math.max(0, Math.min(100, (cangyun.hp / cangyun.maxHp) * 100)) : 100;
  const mpPercent = cangyun ? Math.max(0, Math.min(100, (cangyun.mp / cangyun.maxMp) * 100)) : 100;

  if (!cangyun) return null;

  return (
    <div className="w-full bg-[#0d161a]/95 border-t border-teal-900/60 p-3 flex flex-col gap-2.5 backdrop-blur-md select-none font-serif z-40">
      {/* 顶部行动角色与状态条 + 4个主指令 */}
      <div className="flex items-center justify-between gap-3">
        {/* 左侧：圆形「苍」字印章与血条/蓝条 */}
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          {/* 圆形「苍」徽章 */}
          <div className="relative w-12 h-12 rounded-full border-2 border-emerald-500/70 bg-gradient-to-br from-emerald-800 to-teal-950 flex items-center justify-center shadow-[0_0_12px_rgba(16,185,129,0.5)] flex-shrink-0">
            <span className="text-emerald-100 text-xl font-bold font-serif">
              {(cangyun?.name || '道').slice(0, 1)}
            </span>
          </div>

          {/* 角色名称与双状态条 */}
          <div className="flex flex-col flex-1 min-w-0 justify-center gap-1">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-emerald-200 font-bold text-sm tracking-wide">
                {cangyun.name}
              </span>
              <span className="text-[11px] text-teal-400/90 font-serif">行动中</span>
            </div>

            {/* HP 条 */}
            <div className="relative w-full h-3 bg-slate-900/90 rounded-sm overflow-hidden border border-emerald-950 flex items-center">
              <div
                className="h-full bg-gradient-to-r from-emerald-600 to-green-400 transition-all duration-300"
                style={{ width: `${hpPercent}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-[8px] min-[440px]:text-[9px] font-bold text-white drop-shadow">
                HP {cangyun.hp.toLocaleString()} / {cangyun.maxHp.toLocaleString()}
              </span>
            </div>

            {/* MP 条 */}
            <div className="relative w-full h-3 bg-slate-900/90 rounded-sm overflow-hidden border border-blue-950 flex items-center">
              <div
                className="h-full bg-gradient-to-r from-cyan-600 to-blue-400 transition-all duration-300"
                style={{ width: `${mpPercent}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-[8px] min-[440px]:text-[9px] font-bold text-white drop-shadow">
                MP {cangyun.mp} / {cangyun.maxMp}
              </span>
            </div>
          </div>
        </div>

        {/* 右侧：普攻 / 防御 / 物品 / 逃跑 */}
        <div className="flex items-center gap-1 min-[440px]:gap-1.5 flex-shrink-0">
          <button
            onClick={triggerNormalAttack}
            disabled={phase === 'ANIMATING'}
            className="w-10 h-10 min-[440px]:w-12 min-[440px]:h-12 rounded border border-teal-800/60 bg-slate-900/80 hover:bg-teal-900/50 active:scale-95 text-[10px] min-[440px]:text-xs text-teal-200 font-bold flex flex-col items-center justify-center transition-all"
          >
            <Swords className="w-3.5 h-3.5 text-teal-400 mb-0.5" />
            <span>普攻</span>
          </button>

          <button
            onClick={triggerDefend}
            disabled={phase === 'ANIMATING'}
            className="w-10 h-10 min-[440px]:w-12 min-[440px]:h-12 rounded border border-cyan-800/60 bg-cyan-950/40 hover:bg-cyan-900/50 active:scale-95 text-[10px] min-[440px]:text-xs text-cyan-200 font-bold flex flex-col items-center justify-center transition-all"
          >
            <Shield className="w-3.5 h-3.5 text-cyan-400 mb-0.5" />
            <span>防御</span>
          </button>

          <button
            onClick={triggerUseItem}
            disabled={phase === 'ANIMATING'}
            className="w-10 h-10 min-[440px]:w-12 min-[440px]:h-12 rounded border border-amber-800/60 bg-amber-950/30 hover:bg-amber-900/50 active:scale-95 text-[10px] min-[440px]:text-xs text-amber-200 font-bold flex flex-col items-center justify-center transition-all"
          >
            <Package className="w-3.5 h-3.5 text-amber-400 mb-0.5" />
            <span>物品</span>
          </button>

          <button
            onClick={skipPerformance}
            disabled={phase === 'ANIMATING'}
            className="w-10 h-10 min-[440px]:w-12 min-[440px]:h-12 rounded border border-rose-900/60 bg-rose-950/30 hover:bg-rose-900/50 active:scale-95 text-[10px] min-[440px]:text-xs text-rose-200 font-bold flex flex-col items-center justify-center transition-all"
          >
            <DoorOpen className="w-3.5 h-3.5 text-rose-400 mb-0.5" />
            <span>逃跑</span>
          </button>
        </div>
      </div>

      {/* 4 个技能快捷卡位 (如图中: 天策斩诀 / 九霄雷引 / 两仪护心 / 万剑归宗) */}
      <div className="grid grid-cols-4 gap-2 pt-1">
        {skills.map((skill) => {
          const isSelected = selectedSkillId === skill.id;
          const isUlt = skill.costRage > 0;
          const isAffordable = cangyun ? cangyun.mp >= skill.costMp : true;

          return (
            <button
              key={skill.id}
              onClick={() => selectSkill(skill.id)}
              disabled={phase === 'ANIMATING'}
              className={`relative rounded-sm p-1.5 flex flex-col justify-between h-20 transition-all border overflow-hidden ${
                isUlt
                  ? 'border-red-500/90 bg-gradient-to-b from-red-950/80 to-slate-950 shadow-[0_0_12px_rgba(239,68,68,0.7)]'
                  : isSelected
                  ? 'border-amber-400/90 bg-gradient-to-b from-teal-900/80 to-slate-950 shadow-[0_0_10px_rgba(245,158,11,0.5)]'
                  : 'border-teal-900/80 bg-slate-900/90 hover:border-teal-700/80'
              } ${!isAffordable ? 'opacity-40 grayscale' : ''}`}
            >
              {/* 技能名称 */}
              <div className="w-full flex items-center justify-center">
                <span
                  className={`text-[12px] font-bold tracking-wider leading-tight text-center ${
                    isUlt ? 'text-rose-200' : isSelected ? 'text-amber-300' : 'text-slate-200'
                  }`}
                >
                  {skill.name}
                </span>
              </div>

              {/* 技能微缩动态光影图 */}
              <div className="flex-1 flex items-center justify-center my-0.5 pointer-events-none">
                {isUlt ? (
                  <div className="relative flex items-center justify-center">
                    <Swords className="w-6 h-6 text-rose-500 animate-pulse" />
                    <span className="absolute text-[8px] text-amber-300 font-bold -bottom-1">⚔⚔⚔</span>
                  </div>
                ) : skill.id === 'skill_tiance_slash' ? (
                  <div className="w-7 h-5 border-t-2 border-r-2 border-cyan-400 rounded-tr-full transform -rotate-45 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                ) : skill.id === 'skill_nine_thunder' ? (
                  <Zap className="w-5 h-5 text-blue-400 fill-blue-500/40" />
                ) : (
                  <div className="w-5 h-5 rounded-full border border-teal-400 bg-teal-500/20 flex items-center justify-center text-[10px] text-teal-300">
                    ☯
                  </div>
                )}
              </div>

              {/* 底部消耗说明 (如: MP 40 / 满怒) */}
              <div className="w-full flex items-center justify-center">
                {isUlt ? (
                  <span className="px-1 py-0.2 bg-red-600 text-amber-200 text-[10px] font-black rounded-sm tracking-wider animate-pulse">
                    满怒
                  </span>
                ) : (
                  <span className="text-[10px] font-mono text-cyan-300/90">
                    MP {skill.costMp}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 演出控制条：战局已由服务端裁决，这里只控制播片节奏 */}
      <div className="flex items-center justify-between pt-1 border-t border-teal-950 text-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={skipPerformance}
            className="px-2.5 py-1 rounded bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-bold text-[11px] shadow-[0_0_10px_rgba(239,68,68,0.7)] flex items-center gap-1 active:scale-95"
            title="跳过剩余演出，直接揭晓服务端裁决的战果"
          >
            <Zap className="w-3 h-3 text-amber-300" />
            跳过演出 ({scriptIndex}/{totalMoves})
          </button>

          <button
            onClick={toggleAutoBattle}
            className={`px-2 py-0.5 rounded text-[11px] border font-medium ${
              autoBattle
                ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                : 'border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            自动演出: {autoBattle ? '开启' : '关闭'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleBattleSpeed}
            className="px-2 py-0.5 rounded text-[11px] border border-slate-700 text-teal-300 font-mono"
          >
            {battleSpeed}X 倍速
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * 战斗操作栏入口：实时回合制（PVP 切磋 / PVE NPC 战）共用技能选择栏，
 * 仅旧版 SCRIPT 播片模式使用播片控制栏。
 */
export const CombatActionBar: React.FC = () => {
  const mode = useCombatStore((s) => s.mode);
  return mode === 'SCRIPT' ? <ScriptActionBar /> : <TurnActionBar />;
};
