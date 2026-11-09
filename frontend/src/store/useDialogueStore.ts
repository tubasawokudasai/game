import { create } from 'zustand';
import { gameApi } from '../services/api';
import { DialogueRenderPayload, DialogueInteractResult } from '../types/dialogue';

/** 选项执行后的外部副作用回调，由宿主组件注入（战斗 / 传送 / 飘字） */
export interface DialogueCallbacks {
  onCombat?: (payload: NonNullable<DialogueInteractResult['combatPayload']>) => void;
  onTeleport?: (target: NonNullable<DialogueInteractResult['teleportTarget']>) => void | Promise<void>;
  onNotice?: (msg: string) => void;
  onPartyChanged?: () => void;
  /** 对话节点切换：刷新剧情 NPC 位置（同场景继续 / 跨场景关闭前的最后一次刷新） */
  onNodeChanged?: () => void | Promise<void>;
  /** 对话正常结束（剧本终点 / 选择关闭）：刷新地图，让已结束的剧情 NPC 消失 */
  onDialogueEnd?: () => void | Promise<void>;
}

interface DialogueStoreState {
  isOpen: boolean;
  isLoading: boolean;
  currentDialogue: DialogueRenderPayload | null;
  error: string | null;

  // Actions
  openDialogue: (npcIdOrKey?: string, nodeId?: string) => Promise<void>;
  selectOption: (
    optionId: string,
    callbacks?: DialogueCallbacks
  ) => Promise<DialogueInteractResult | undefined>;
  advanceDialogue: (
    callbacks?: DialogueCallbacks
  ) => Promise<DialogueInteractResult | undefined>;
  closeDialogue: () => void;
}

/**
 * 有向图对话数据仓库
 * 只持有服务端下发的节点视图与加载态；节点的可见性 / 条件 / 奖励全部由后端裁决。
 */
export const useDialogueStore = create<DialogueStoreState>((set, get) => ({
  isOpen: false,
  isLoading: false,
  currentDialogue: null,
  error: null,

  openDialogue: async (npcIdOrKey?: string, nodeId?: string) => {
    set({
      isOpen: true,
      isLoading: true,
      currentDialogue: null,
      error: null,
    });

    try {
      const payload = await gameApi.startDialogue(npcIdOrKey, nodeId);
      set({
        currentDialogue: payload,
        isLoading: false,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '与仙灵沟通受阻，神识未应';
      set({
        error: msg,
        isLoading: false,
      });
    }
  },

  selectOption: async (optionId: string, callbacks?: DialogueCallbacks) => {
    const { currentDialogue } = get();
    if (!currentDialogue) return undefined;

    set({ isLoading: true, error: null });

    try {
      const result = await gameApi.selectDialogueOption(currentDialogue.nodeId, optionId);

      // 造化提示统一走宿主注入的飘字通道
      result.rewardsToast?.forEach((msg) => callbacks?.onNotice?.(msg));

      // 队伍发生变动（剧情入队）时，通知宿主重新拉取出战阵容
      if (result.partyChanged) callbacks?.onPartyChanged?.();

      // 根据交互结果流转状态
      switch (result.status) {
        case 'CONTINUE':
          if (result.nextDialogue) {
            set({
              currentDialogue: result.nextDialogue,
              isLoading: false,
            });
            await callbacks?.onNodeChanged?.();
          } else {
            set({ isOpen: false, currentDialogue: null, isLoading: false });
            await callbacks?.onDialogueEnd?.();
          }
          break;

        case 'COMBAT':
          set({ isOpen: false, currentDialogue: null, isLoading: false });
          if (result.combatPayload) callbacks?.onCombat?.(result.combatPayload);
          break;

        case 'TELEPORT':
          set({ isOpen: false, currentDialogue: null, isLoading: false });
          if (result.teleportTarget) await callbacks?.onTeleport?.(result.teleportTarget);
          break;

        case 'CLOSE':
        default:
          set({ isOpen: false, currentDialogue: null, isLoading: false });
          await callbacks?.onDialogueEnd?.();
          break;
      }

      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '神识抉择失败';
      set({ error: msg, isLoading: false });
      callbacks?.onNotice?.(msg);
      return undefined;
    }
  },

  advanceDialogue: async (callbacks?: DialogueCallbacks) => {
    const { currentDialogue } = get();
    if (!currentDialogue) return undefined;

    set({ isLoading: true, error: null });

    try {
      const result = await gameApi.advanceDialogue(currentDialogue.nodeId);

      result.rewardsToast?.forEach((msg) => callbacks?.onNotice?.(msg));
      if (result.partyChanged) callbacks?.onPartyChanged?.();

      switch (result.status) {
        case 'CONTINUE':
          if (result.nextDialogue) {
            set({
              currentDialogue: result.nextDialogue,
              isLoading: false,
            });
            await callbacks?.onNodeChanged?.();
          } else {
            set({ isOpen: false, currentDialogue: null, isLoading: false });
            await callbacks?.onDialogueEnd?.();
          }
          break;

        case 'COMBAT':
          set({ isOpen: false, currentDialogue: null, isLoading: false });
          if (result.combatPayload) callbacks?.onCombat?.(result.combatPayload);
          break;

        case 'TELEPORT':
          set({ isOpen: false, currentDialogue: null, isLoading: false });
          if (result.teleportTarget) await callbacks?.onTeleport?.(result.teleportTarget);
          break;

        case 'CLOSE':
        default:
          set({ isOpen: false, currentDialogue: null, isLoading: false });
          await callbacks?.onDialogueEnd?.();
          break;
      }

      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '对话推进失败';
      set({ error: msg, isLoading: false });
      callbacks?.onNotice?.(msg);
      return undefined;
    }
  },

  closeDialogue: () => {
    set({
      isOpen: false,
      isLoading: false,
      currentDialogue: null,
      error: null,
    });
  },
}));
