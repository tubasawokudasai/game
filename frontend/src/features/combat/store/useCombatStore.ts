import { create } from 'zustand';
import {
  CombatFighter,
  CombatSkill,
  CombatSkillInfo,
  CombatUnitAction,
  CombatActionLog,
  CombatInitOptions,
  CombatPhase,
  CombatScriptEvent,
  BattleActionType,
} from '../types';
import { DEFAULT_SKILLS } from '../constants/combatData';
import type { DuelRoundPayload, PveRoundPayload } from '../../../types/ws';

interface FloatingItem {
  id: string;
  targetId: string;
  damage?: number;
  heal?: number;
  isCrit?: boolean;
  text?: string;
  subtitle?: string;
  /** 飘字落在哪一侧：敌方在左，我方在右 */
  camp?: 'PLAYER' | 'ENEMY';
}

interface PvpTeams {
  playerTeam: CombatFighter[];
  enemyTeam: CombatFighter[];
}

interface CombatStoreState {
  isActive: boolean;
  phase: CombatPhase;
  currentRound: number;
  playerTeam: CombatFighter[];
  enemyTeam: CombatFighter[];
  activeFighterId: string;
  selectedSkillId: string | null;
  selectedTargetId: string | null;
  actionLogs: CombatActionLog[];
  floatingList: FloatingItem[];
  battleResult: 'WIN' | 'LOSE' | 'ESCAPE' | null;
  options: CombatInitOptions | null;
  autoBattle: boolean;
  battleSpeed: 1 | 2;
  skills: CombatSkill[];
  activeDialogueBubble: { speaker: string; text: string } | null;
  /** 服务端下发的战报脚本与已裁决胜负（SCRIPT 模式） */
  script: CombatScriptEvent[];
  scriptIndex: number;
  outcome: 'WIN' | 'LOSE' | 'ESCAPE' | null;

  // ---- 实时回合制战斗（PVP 切磋 / PVE NPC 战） ----
  mode: 'SCRIPT' | 'PVP' | 'PVE';
  duelId: string | null;
  /** 服务端下发的可操作技能清单 */
  pvpSkills: CombatSkillInfo[];
  /** 本回合需要下令的己方存活单位（按阵位顺序） */
  pvpOrderUnitIds: string[];
  /** 当前正在下令的己方单位 */
  pvpActiveUnitId: string | null;
  /** 已确认的本回合指令：unitId -> action */
  pvpOrders: Record<string, CombatUnitAction>;
  /** 当前等待出招的回合 */
  pvpRound: number;
  /** 服务端结算后给出的下一回合 */
  pvpNextRound: number;
  /** 本回合出招截止时间（服务端时间戳） */
  pvpDeadline: number;
  /** 服务端时钟与本地时钟的偏差（serverNow - Date.now()） */
  pvpClockOffset: number;
  /** 每回合出招窗口（毫秒） */
  pvpTimeoutMs: number;
  /** 已提交、等待对方/服务端裁决 */
  pvpWaiting: boolean;
  /** 本回合是否已提交 */
  pvpSubmitted: boolean;
  /** 待播放的本回合战报 */
  pvpQueue: CombatScriptEvent[];
  /** 本回合结束后的最终阵容（播放完毕后回填） */
  pvpTeams: PvpTeams | null;
  pvpFinished: boolean;
  pvpOutcome: 'WIN' | 'LOSE' | 'ESCAPE' | null;
  /** 当前选中的待施用物品ID（从行囊选中后等待点击我方立绘施用） */
  selectedItemId: string | null;
  /** PVE 战斗结束时服务端下发的奖励/状态提示 */
  battleToasts: string[];

  // Actions
  startCombat: (options: CombatInitOptions) => void;
  selectSkill: (skillId: string) => void;
  selectTarget: (targetId: string) => void;
  selectItem: (itemId: string | null) => void;
  triggerNormalAttack: () => Promise<void>;
  executeSelectedSkill: () => Promise<void>;
  triggerDefend: () => void;
  triggerUseItem: () => void;
  /** 播放下一招演出（战报由服务端给定，前端不做任何数值判定） */
  playNext: () => void;
  /** 跳过剩余演出，直接展示服务端裁决结果 */
  skipPerformance: () => void;
  /** PVP：切换当前正在下令的己方单位 */
  selectPvpUnit: (unitId: string) => void;
  /** PVP：选择当前单位要施展的技能（并自动修正合法目标） */
  selectPvpSkill: (skillId: string) => void;
  /** PVP：确认当前单位的指令；全部单位确认后自动整批提交 */
  confirmPvpOrder: (skillId: string, targetId?: string) => void;
  /** PVP/PVE：确认当前单位的行动指令（普攻/防御/技能/物品/逃跑） */
  confirmPvpAction: (command: Partial<CombatUnitAction>) => void;
  /** 实时回合制：接收 PVP 单回合战报 */
  receiveDuelRound: (payload: DuelRoundPayload) => void;
  /** 实时回合制：接收 PVE 单回合战报 */
  receivePveRound: (payload: PveRoundPayload) => void;
  finishCombat: (result: 'WIN' | 'LOSE' | 'ESCAPE') => void;
  toggleAutoBattle: () => void;
  toggleBattleSpeed: () => void;
  addLog: (log: Omit<CombatActionLog, 'id' | 'timestamp'>) => void;
  removeFloating: (id: string) => void;
  closeCombat: () => void;
}

const cloneTeam = (team: CombatFighter[]): CombatFighter[] =>
  JSON.parse(JSON.stringify(team || []));

/**
 * 获取指定出战角色当前可用技能列表：
 * - 若角色身上装配了 skills（来自后端 npc_instances.skills_json / npc_templates.skills_json），
 *   则从全局下发的 pvpSkills 中筛选出匹配的真实技能；
 * - 若角色 skills 为空，或者未匹配到任何技能，则安全保底为全局技能列表（包含普攻、纯阳剑煞等）。
 */
export function getUnitSkills(
  fighter: CombatFighter | null | undefined,
  allSkills: CombatSkillInfo[]
): CombatSkillInfo[] {
  if (!fighter || !allSkills || allSkills.length === 0) {
    return allSkills || [];
  }

  if (Array.isArray(fighter.skills) && fighter.skills.length > 0) {
    const matched = allSkills.filter((s) => fighter.skills!.includes(s.id));
    if (matched.length > 0) {
      return matched;
    }
  }

  return allSkills;
}

/**
 * 每回合开始 / 新一场切磋时的默认下令状态：
 * - 所有存活己方单位按阵位顺序排队下令；
 * - 默认选择第一个行动角色的专属可用技能（单体技能优先）与第一个存活敌人。
 */
function buildPvpOrderState(
  skills: CombatSkillInfo[],
  playerTeam: CombatFighter[],
  enemyTeam: CombatFighter[]
): {
  pvpOrderUnitIds: string[];
  pvpActiveUnitId: string | null;
  pvpOrders: Record<string, CombatUnitAction>;
  selectedSkillId: string | null;
  selectedTargetId: string;
} {
  const units = playerTeam.filter((f) => f.hp > 0);
  const firstUnit = units[0] || null;
  const availableSkills = getUnitSkills(firstUnit, skills);
  const defaultSkill =
    availableSkills.find((skill) => skill.targetType === 'SINGLE_ENEMY') || availableSkills[0] || skills[0];
  const defaultTarget = enemyTeam.find((f) => f.hp > 0)?.id || '';
  return {
    pvpOrderUnitIds: units.map((f) => f.id),
    pvpActiveUnitId: firstUnit?.id || null,
    pvpOrders: {},
    selectedSkillId: defaultSkill?.id || null,
    selectedTargetId: defaultTarget,
  };
}

const toCombatSkill = (info: CombatSkillInfo): CombatSkill => ({
  id: info.id,
  name: info.name,
  costMp: info.costMp,
  costRage: 0,
  description: info.description,
  targetType: info.targetType,
  cooldown: 0,
  currentCooldown: 0,
  damageMultiplier: 0,
});

/**
 * 把单条服务端战报应用到阵容，并生成飘字/战报日志。
 * 治疗目标可能是任意友方，defenderHpRemaining 已包含最终血量，不再额外给施法者加血。
 */
function buildEventUpdate(
  state: CombatStoreState,
  event: CombatScriptEvent,
  eventKey: string
): Pick<
  CombatStoreState,
  | 'playerTeam'
  | 'enemyTeam'
  | 'floatingList'
  | 'actionLogs'
  | 'currentRound'
  | 'activeFighterId'
  | 'selectedTargetId'
> {
  const allies = state.playerTeam;
  const enemies = state.enemyTeam;
  const everyone = [...allies, ...enemies];
  const attackerIsAlly = allies.some((f) => f.id === event.attackerId);
  const target = everyone.find((f) => f.id === event.defenderId);

  // 服务端下发的 defenderHpRemaining 已包含治疗/伤害后的最终气血
  if (target) {
    target.hp = Math.max(0, event.defenderHpRemaining);
    target.isAlive = target.hp > 0;
  }

  const targetIsEnemy = enemies.some((f) => f.id === event.defenderId);
  const floatId = `float_${Date.now()}_${eventKey}`;

  return {
    playerTeam: [...allies],
    enemyTeam: [...enemies],
    currentRound: event.round,
    activeFighterId: event.attackerId,
    selectedTargetId: event.defenderId,
    floatingList: [
      ...state.floatingList,
      {
        id: floatId,
        targetId: event.defenderId,
        damage: event.damage,
        heal: event.heal,
        isCrit: event.isCrit,
        text:
          event.heal > 0
            ? `+${event.heal.toLocaleString()}`
            : event.isCrit
            ? `暴击 ${event.damage.toLocaleString()}！`
            : `-${event.damage.toLocaleString()}`,
        camp: targetIsEnemy ? 'ENEMY' : 'PLAYER',
      },
    ],
    actionLogs: [
      ...state.actionLogs.slice(-15),
      {
        id: `log_${Date.now()}_${eventKey}`,
        round: event.round,
        attackerId: event.attackerId,
        attackerName: event.attackerName,
        targetId: event.defenderId,
        targetName: event.defenderName,
        skillName: event.skillName,
        damage: event.damage || undefined,
        heal: event.heal || undefined,
        isCrit: event.isCrit,
        text: event.logText,
        camp: attackerIsAlly ? 'PLAYER' : 'ENEMY',
        timestamp: Date.now(),
      },
    ],
  };
}

export const useCombatStore = create<CombatStoreState>((set, get) => ({
  isActive: false,
  phase: 'READY',
  currentRound: 1,
  playerTeam: [],
  enemyTeam: [],
  activeFighterId: '',
  selectedSkillId: 'skill_tiance_slash',
  selectedTargetId: '',
  actionLogs: [],
  floatingList: [],
  battleResult: null,
  options: null,
  autoBattle: false,
  battleSpeed: 1,
  skills: DEFAULT_SKILLS,
  activeDialogueBubble: null,
  script: [],
  scriptIndex: 0,
  outcome: null,

  mode: 'SCRIPT',
  duelId: null,
  pvpSkills: [],
  pvpOrderUnitIds: [],
  pvpActiveUnitId: null,
  pvpOrders: {},
  pvpRound: 1,
  pvpNextRound: 1,
  pvpDeadline: 0,
  pvpClockOffset: 0,
  pvpTimeoutMs: 30000,
  pvpWaiting: false,
  pvpSubmitted: false,
  pvpQueue: [],
  pvpTeams: null,
  pvpFinished: false,
  pvpOutcome: null,
  selectedItemId: null,
  battleToasts: [],

  startCombat: (options: CombatInitOptions) => {
    const mode = options.mode ?? 'SCRIPT';
    const isTurnBased = mode !== 'SCRIPT';
    const pvpSkills = options.skills ?? [];
    const pvpTimeoutMs = options.timeoutMs ?? 30000;
    const allies = cloneTeam(options.playerTeam);
    const enemies = cloneTeam(options.enemyTeam);
    const leader = allies[0];
    const boss = enemies.find((e) => e.isActionActive) || enemies[0];
    const pvpOrderState = buildPvpOrderState(pvpSkills, allies, enemies);
    const scriptSkills = options.skills?.map(toCombatSkill) ?? DEFAULT_SKILLS;

    set({
      isActive: true,
      phase: 'INTRO',
      mode,
      duelId: options.battleId ?? options.duelId ?? null,
      pvpSkills,
      pvpOrderUnitIds: isTurnBased ? pvpOrderState.pvpOrderUnitIds : [],
      pvpActiveUnitId: isTurnBased ? pvpOrderState.pvpActiveUnitId : null,
      pvpOrders: isTurnBased ? pvpOrderState.pvpOrders : {},
      pvpRound: options.round ?? 1,
      pvpNextRound: options.round ?? 1,
      pvpDeadline: options.deadline ?? Date.now() + pvpTimeoutMs,
      pvpClockOffset: options.serverNow ? options.serverNow - Date.now() : 0,
      pvpTimeoutMs,
      pvpWaiting: false,
      pvpSubmitted: false,
      pvpQueue: [],
      pvpTeams: null,
      pvpFinished: false,
      pvpOutcome: null,
      selectedItemId: null,
      battleToasts: [],
      currentRound: options.round ?? 1,
      playerTeam: allies,
      enemyTeam: enemies,
      activeFighterId: leader?.id || '',
      selectedSkillId: isTurnBased
        ? pvpOrderState.selectedSkillId || 'skill_basic_attack'
        : 'skill_tiance_slash',
      selectedTargetId: isTurnBased ? pvpOrderState.selectedTargetId : boss?.id || '',
      actionLogs: [],
      floatingList: [],
      battleResult: null,
      options,
      skills: isTurnBased ? pvpSkills.map(toCombatSkill) : scriptSkills,
      script: isTurnBased ? [] : options.script || [],
      scriptIndex: 0,
      outcome: isTurnBased ? null : options.outcome || null,
      activeDialogueBubble: leader
        ? { speaker: leader.name, text: '“诸位道友，随我入阵！”' }
        : null,
    });

    // 入场演出结束后进入可操作/可播放状态
    setTimeout(() => {
      const state = get();
      if (!state.isActive) return;

      if (state.mode !== 'SCRIPT') {
        // 实时回合制的倒计时由服务端 deadline 控制，入场结束后直接开放出招
        set({ phase: 'READY', activeDialogueBubble: null });
        return;
      }

      if (state.script.length === 0) {
        set({
          phase: 'SETTLEMENT',
          battleResult: state.outcome,
          activeDialogueBubble: null,
        });
        return;
      }
      set({ phase: 'READY', activeDialogueBubble: null });
    }, 2200);
  },

  // 招式选择与指令键统一改为"推进演出"，胜负数值全部来自服务端脚本
  selectSkill: () => {
    get().playNext();
  },

  selectTarget: (targetId: string) => {
    set({ selectedTargetId: targetId });
  },

  triggerNormalAttack: async () => {
    get().playNext();
  },

  executeSelectedSkill: async () => {
    get().playNext();
  },

  triggerDefend: () => {
    get().playNext();
  },

  triggerUseItem: () => {
    get().playNext();
  },

  playNext: () => {
    const state = get();

    // ---------------------------------------------------------------------
    // 实时回合制（PVP/PVE）：逐条播放服务端本回合战报；播完后开放下一回合出招
    // ---------------------------------------------------------------------
    if (state.mode !== 'SCRIPT') {
      if (state.phase === 'INTRO' || state.phase === 'ANIMATING') return;

      if (state.pvpQueue.length === 0) {
        if (state.pvpFinished) {
          set({
            phase: 'SETTLEMENT',
            battleResult: state.pvpOutcome,
            activeDialogueBubble: null,
          });
        }
        return;
      }

      const [event, ...rest] = state.pvpQueue;
      const eventKey = `pvp_${state.pvpRound}_${state.scriptIndex}`;
      const update = buildEventUpdate(state, event, eventKey);

      set({
        ...update,
        phase: 'ANIMATING',
        pvpQueue: rest,
        scriptIndex: state.scriptIndex + 1,
      });

      setTimeout(() => {
        const latest = get();
        if (latest.mode === 'SCRIPT' || !latest.isActive) return;

        if (latest.pvpQueue.length === 0) {
          const teams = latest.pvpTeams;
          if (latest.pvpFinished) {
            set({
              phase: 'SETTLEMENT',
              battleResult: latest.pvpOutcome,
              playerTeam: teams?.playerTeam || latest.playerTeam,
              enemyTeam: teams?.enemyTeam || latest.enemyTeam,
              activeDialogueBubble: null,
            });
          } else {
            const nextPlayerTeam = teams?.playerTeam || latest.playerTeam;
            const nextEnemyTeam = teams?.enemyTeam || latest.enemyTeam;
            const orderState = buildPvpOrderState(
              latest.pvpSkills,
              nextPlayerTeam,
              nextEnemyTeam
            );
            set({
              phase: 'READY',
              pvpRound: latest.pvpNextRound,
              pvpSubmitted: false,
              pvpWaiting: false,
              playerTeam: nextPlayerTeam,
              enemyTeam: nextEnemyTeam,
              ...orderState,
              activeDialogueBubble: null,
            });
          }
        } else {
          set({ phase: 'READY' });
        }
      }, 480 / get().battleSpeed);

      return;
    }

    // ---------------------------------------------------------------------
    // SCRIPT：按服务端预演脚本逐条播放
    // ---------------------------------------------------------------------
    const { script, scriptIndex, outcome, phase } = state;
    if (phase === 'INTRO' || phase === 'ANIMATING') return;

    if (scriptIndex >= script.length) {
      set({ phase: 'SETTLEMENT', battleResult: outcome, activeDialogueBubble: null });
      return;
    }

    const event = script[scriptIndex];
    const update = buildEventUpdate(state, event, String(scriptIndex));

    set({
      ...update,
      phase: 'ANIMATING',
      scriptIndex: scriptIndex + 1,
    });

    // 出招动画结束后回到就绪态；最后一招收势后进入结算
    setTimeout(() => {
      const latest = get();
      if (latest.scriptIndex >= latest.script.length) {
        set({ phase: 'SETTLEMENT', battleResult: latest.outcome, activeDialogueBubble: null });
      } else {
        set({ phase: 'READY' });
      }
    }, 480 / get().battleSpeed);
  },

  skipPerformance: () => {
    const state = get();

    if (state.mode !== 'SCRIPT') {
      if (state.pvpQueue.length === 0 && !state.pvpFinished) return;

      const teams = state.pvpTeams;
      const nextPlayerTeam = teams?.playerTeam || state.playerTeam;
      const nextEnemyTeam = teams?.enemyTeam || state.enemyTeam;
      const orderState = buildPvpOrderState(state.pvpSkills, nextPlayerTeam, nextEnemyTeam);
      set({
        playerTeam: nextPlayerTeam,
        enemyTeam: nextEnemyTeam,
        pvpQueue: [],
        floatingList: [],
        phase: state.pvpFinished ? 'SETTLEMENT' : 'READY',
        battleResult: state.pvpFinished ? state.pvpOutcome : null,
        pvpRound: state.pvpFinished ? state.pvpRound : state.pvpNextRound,
        pvpSubmitted: false,
        pvpWaiting: false,
        selectedItemId: null,
        ...(state.pvpFinished ? {} : orderState),
        activeDialogueBubble: null,
      });
      return;
    }

    const { script, scriptIndex, outcome, playerTeam, enemyTeam } = state;
    const everyone = [...playerTeam, ...enemyTeam];

    for (let i = scriptIndex; i < script.length; i++) {
      const event = script[i];
      const target = everyone.find((f) => f.id === event.defenderId);
      if (target) {
        target.hp = Math.max(0, event.defenderHpRemaining);
        target.isAlive = target.hp > 0;
      }
    }

    set({
      playerTeam: [...playerTeam],
      enemyTeam: [...enemyTeam],
      scriptIndex: script.length,
      floatingList: [],
      phase: 'SETTLEMENT',
      battleResult: outcome,
      activeDialogueBubble: null,
    });
  },

  selectPvpUnit: (unitId: string) => {
    const state = get();
    if (!state.isActive || state.mode === 'SCRIPT') return;
    if (state.phase !== 'READY' || state.pvpQueue.length > 0) return;
    if (state.pvpWaiting || state.pvpSubmitted || state.pvpFinished) return;
    if (!state.pvpOrderUnitIds.includes(unitId)) return;

    const unit = state.playerTeam.find((f) => f.id === unitId && f.hp > 0);
    if (!unit) return;

    const unitSkills = getUnitSkills(unit, state.pvpSkills);
    const existing = state.pvpOrders[unitId];
    const existingSkill = existing
      ? unitSkills.find((s) => s.id === existing.skillId)
      : undefined;
    const defaultSkill =
      existingSkill ||
      unitSkills.find((s) => s.targetType === 'SINGLE_ENEMY') ||
      unitSkills[0] ||
      state.pvpSkills[0] ||
      null;
    const defaultTarget =
      existing?.targetId || state.enemyTeam.find((f) => f.hp > 0)?.id || '';

    set({
      pvpActiveUnitId: unitId,
      selectedSkillId: defaultSkill?.id || null,
      selectedTargetId: defaultTarget,
      selectedItemId: null,
    });
  },

  selectPvpSkill: (skillId: string) => {
    const state = get();
    if (!state.isActive || state.mode === 'SCRIPT') return;
    if (state.phase !== 'READY' || state.pvpQueue.length > 0) return;
    if (state.pvpWaiting || state.pvpSubmitted || state.pvpFinished) return;

    const skill = state.pvpSkills.find((s) => s.id === skillId);
    if (!skill) return;

    const allies = state.playerTeam.filter((f) => f.hp > 0);
    const enemies = state.enemyTeam.filter((f) => f.hp > 0);
    let targetId = state.selectedTargetId || '';

    if (skill.targetType === 'SINGLE_ENEMY') {
      if (!enemies.some((f) => f.id === targetId)) targetId = enemies[0]?.id || '';
    } else if (skill.targetType === 'SINGLE_ALLY') {
      if (!allies.some((f) => f.id === targetId)) targetId = allies[0]?.id || '';
    } else if (skill.targetType === 'SELF') {
      targetId = state.pvpActiveUnitId || allies[0]?.id || '';
    } else {
      targetId = '';
    }

    set({ selectedSkillId: skillId, selectedTargetId: targetId, selectedItemId: null });
  },

  selectItem: (itemId: string | null) => {
    set({ selectedItemId: itemId });
  },

  confirmPvpAction: (command: Partial<CombatUnitAction>) => {
    const state = get();
    if (!state.isActive || state.mode === 'SCRIPT') return;
    if (state.phase !== 'READY' || state.pvpQueue.length > 0) return;
    if (state.pvpWaiting || state.pvpSubmitted || state.pvpFinished) return;

    // 与服务端 deadline 对齐，超时后不再接受本地指令
    if (
      state.pvpDeadline > 0 &&
      Date.now() + state.pvpClockOffset >= state.pvpDeadline
    ) {
      return;
    }

    const activeUnitId = command.actorId || command.unitId || state.pvpActiveUnitId;
    const activeUnit = state.playerTeam.find((f) => f.id === activeUnitId && f.hp > 0);
    if (!activeUnit) return;

    const actionType = command.actionType || BattleActionType.SKILL;
    let finalSkillId = command.skillId;
    let finalTargetId = command.targetId || command.targetIds?.[0];
    const finalItemId = command.itemId;

    if (actionType === BattleActionType.NORMAL_ATTACK) {
      finalSkillId = 'skill_basic_attack';
      if (!finalTargetId || !state.enemyTeam.some((f) => f.id === finalTargetId && f.hp > 0)) {
        finalTargetId = state.enemyTeam.find((f) => f.hp > 0)?.id;
      }
      if (!finalTargetId) return;
    } else if (actionType === BattleActionType.DEFEND) {
      finalTargetId = activeUnit.id;
    } else if (actionType === BattleActionType.ESCAPE) {
      finalTargetId = activeUnit.id;
    } else if (actionType === BattleActionType.USE_ITEM) {
      if (!finalItemId) return;
      if (!finalTargetId || !state.playerTeam.some((f) => f.id === finalTargetId && f.hp > 0)) {
        finalTargetId = activeUnit.id;
      }
    } else if (actionType === BattleActionType.SKILL) {
      const skill = state.pvpSkills.find((s) => s.id === finalSkillId);
      if (!skill) return;
      if (activeUnit.mp < skill.costMp) return;

      if (skill.targetType === 'SINGLE_ENEMY') {
        const target = state.enemyTeam.find((f) => f.id === finalTargetId && f.hp > 0);
        if (!target) return;
        finalTargetId = target.id;
      } else if (skill.targetType === 'SINGLE_ALLY') {
        const target = state.playerTeam.find((f) => f.id === finalTargetId && f.hp > 0);
        if (!target) return;
        // 治疗技能：目标气血高于 75% 时不可施展
        if (skill.kind === 'HEAL' && target.hp >= target.maxHp * 0.75) return;
        finalTargetId = target.id;
      } else if (skill.targetType === 'SELF') {
        if (skill.kind === 'HEAL' && activeUnit.hp >= activeUnit.maxHp * 0.75) return;
        finalTargetId = activeUnit.id;
      } else if (skill.targetType === 'ALL_ALLIES') {
        // 群体治疗：只有存在低于 75% 的存活友方时才允许提交
        if (
          skill.kind === 'HEAL' &&
          !state.playerTeam.some((f) => f.hp > 0 && f.hp < f.maxHp * 0.75)
        ) {
          return;
        }
        finalTargetId = undefined;
      } else if (skill.targetType === 'ALL_ENEMIES') {
        if (!state.enemyTeam.some((f) => f.hp > 0)) return;
        finalTargetId = undefined;
      }
    }

    const order: CombatUnitAction = {
      unitId: activeUnit.id,
      actorId: activeUnit.id,
      actionType,
      skillId: finalSkillId,
      itemId: finalItemId,
      targetId: finalTargetId,
      targetIds: finalTargetId ? [finalTargetId] : [],
    };
    const orders = { ...state.pvpOrders, [activeUnit.id]: order };
    const nextUnitId = state.pvpOrderUnitIds.find((id) => !orders[id]);

    if (nextUnitId) {
      const nextUnit = state.playerTeam.find((f) => f.id === nextUnitId);
      const nextUnitSkills = getUnitSkills(nextUnit, state.pvpSkills);
      const defaultSkill =
        nextUnitSkills.find((s) => s.targetType === 'SINGLE_ENEMY') ||
        nextUnitSkills[0] ||
        state.pvpSkills[0] ||
        null;
      const defaultTarget = state.enemyTeam.find((f) => f.hp > 0)?.id || '';
      set({
        pvpOrders: orders,
        pvpActiveUnitId: nextUnitId,
        selectedSkillId: defaultSkill?.id || null,
        selectedTargetId: defaultTarget,
        selectedItemId: null,
      });
      return;
    }

    const actions = state.pvpOrderUnitIds
      .map((id) => orders[id])
      .filter((action): action is CombatUnitAction => Boolean(action));

    set({
      pvpOrders: orders,
      pvpSubmitted: true,
      pvpWaiting: true,
      selectedItemId: null,
    });
    state.options?.onPvpAction?.(actions);
  },

  confirmPvpOrder: (skillId: string, targetId?: string) => {
    get().confirmPvpAction({
      actionType:
        skillId === 'skill_basic_attack'
          ? BattleActionType.NORMAL_ATTACK
          : BattleActionType.SKILL,
      skillId,
      targetId,
    });
  },

  receiveDuelRound: (payload: DuelRoundPayload) => {
    const state = get();
    if (!state.isActive || state.mode === 'SCRIPT' || state.duelId !== payload.duelId) return;

    const events = payload.events || [];

    set({
      pvpQueue: events,
      pvpFinished: payload.finished,
      pvpOutcome: payload.finished ? payload.outcome ?? null : null,
      pvpNextRound: payload.nextRound,
      pvpTeams: { playerTeam: payload.playerTeam, enemyTeam: payload.enemyTeam },
      pvpDeadline: payload.deadline || state.pvpDeadline,
      pvpClockOffset: payload.serverNow ? payload.serverNow - Date.now() : state.pvpClockOffset,
      pvpTimeoutMs: payload.timeoutMs || state.pvpTimeoutMs,
      currentRound: payload.round,
      phase: 'READY',
      pvpWaiting: false,
      pvpSubmitted: false,
      battleResult: null,
      activeDialogueBubble: null,
    });

    // 无演出事件时直接进入下一回合/结算
    if (events.length === 0) {
      if (payload.finished) {
        set({
          phase: 'SETTLEMENT',
          battleResult: payload.outcome ?? null,
          playerTeam: payload.playerTeam,
          enemyTeam: payload.enemyTeam,
          pvpRound: payload.nextRound,
        });
      } else {
        const orderState = buildPvpOrderState(
          state.pvpSkills,
          payload.playerTeam,
          payload.enemyTeam
        );
        set({
          pvpRound: payload.nextRound,
          playerTeam: payload.playerTeam,
          enemyTeam: payload.enemyTeam,
          ...orderState,
        });
      }
    }
  },

  receivePveRound: (payload: PveRoundPayload) => {
    const state = get();
    if (!state.isActive || state.mode !== 'PVE' || state.duelId !== payload.battleId) {
      return;
    }

    // PVE 与 PVP 共用同一套回合战报应用逻辑，仅会话字段名不同
    get().receiveDuelRound({
      duelId: payload.battleId,
      round: payload.round,
      nextRound: payload.nextRound,
      events: payload.events,
      playerTeam: payload.playerTeam,
      enemyTeam: payload.enemyTeam,
      finished: payload.finished,
      outcome: payload.outcome,
      deadline: payload.deadline,
      serverNow: payload.serverNow,
      timeoutMs: payload.timeoutMs,
      roundCount: payload.roundCount,
    });

    set({ battleToasts: payload.toasts ?? [] });
  },

  finishCombat: (result: 'WIN' | 'LOSE' | 'ESCAPE') => {
    const { options, battleToasts } = get();
    set({
      isActive: false,
      battleResult: null,
      activeDialogueBubble: null,
      mode: 'SCRIPT',
      duelId: null,
      pvpQueue: [],
      pvpTeams: null,
      pvpFinished: false,
      pvpOutcome: null,
      pvpWaiting: false,
      pvpSubmitted: false,
      pvpOrderUnitIds: [],
      pvpActiveUnitId: null,
      pvpOrders: {},
      pvpClockOffset: 0,
      selectedItemId: null,
      battleToasts: [],
    });
    options?.onFinish?.(result, battleToasts);
  },

  toggleAutoBattle: () => {
    set((s) => ({ autoBattle: !s.autoBattle }));
  },

  toggleBattleSpeed: () => {
    set((s) => ({ battleSpeed: s.battleSpeed === 1 ? 2 : 1 }));
  },

  addLog: (log) => {
    const fullLog: CombatActionLog = {
      ...log,
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    };
    set((s) => ({
      actionLogs: [...s.actionLogs.slice(-15), fullLog],
    }));
  },

  removeFloating: (id) => {
    set((s) => ({
      floatingList: s.floatingList.filter((f) => f.id !== id),
    }));
  },

  closeCombat: () => {
    set({
      isActive: false,
      battleResult: null,
      activeDialogueBubble: null,
      mode: 'SCRIPT',
      duelId: null,
      pvpQueue: [],
      pvpTeams: null,
      pvpFinished: false,
      pvpOutcome: null,
      pvpWaiting: false,
      pvpSubmitted: false,
      pvpOrderUnitIds: [],
      pvpActiveUnitId: null,
      pvpOrders: {},
      pvpClockOffset: 0,
      selectedItemId: null,
      battleToasts: [],
    });
  },
}));
