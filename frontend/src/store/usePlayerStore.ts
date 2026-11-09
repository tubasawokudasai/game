import { create } from 'zustand';
import { PlayerProfile, InventoryItem, PartyMember, FriendItem, FriendRequestItem } from '../types/game';
import { gameApi } from '../services/api';

interface PlayerState {
  player: PlayerProfile | null;
  inventory: InventoryItem[];
  party: PartyMember[];
  friends: FriendItem[];
  friendRequests: FriendRequestItem[];
  unreadMailCount: number;
  isMailModalOpen: boolean;
  isBagModalOpen: boolean;
  isFriendsModalOpen: boolean;
  isLoading: boolean;
  error: string | null;

  // 动作 Actions
  fetchProfile: () => Promise<void>;
  fetchInventory: () => Promise<void>;
  fetchParty: () => Promise<void>;
  fetchFriends: () => Promise<void>;
  fetchFriendRequests: () => Promise<void>;
  updatePartyMemberStatus: (memberKey: string, isActive: boolean) => Promise<string>;
  setPlayer: (player: Partial<PlayerProfile> | null) => void;
  updateHpMp: (hp: number, mp: number) => void;
  addCurrency: (type: 'silver' | 'ingot' | 'copper', amount: number) => void;
  setUnreadMailCount: (count: number) => void;
  setMailModalOpen: (open: boolean) => void;
  setBagModalOpen: (open: boolean) => void;
  setFriendsModalOpen: (open: boolean) => void;
}

/**
 * 玩家状态管理 Store (Zustand)
 * 不设任何写死的假数据，启动时通过真实 API/DO 状态获取
 */
export const usePlayerStore = create<PlayerState>((set) => ({
  player: null,
  inventory: [],
  party: [],
  friends: [],
  friendRequests: [],
  unreadMailCount: 0,
  isMailModalOpen: false,
  isBagModalOpen: false,
  isFriendsModalOpen: false,
  isLoading: false,
  error: null,

  fetchProfile: async () => {
    set({ isLoading: true, error: null });
    try {
      const player = await gameApi.getCurrentPlayer();
      set({ player, isLoading: false });
    } catch (err: unknown) {
      set({
        player: null,
        error: err instanceof Error ? err.message : '获取道友资料异常',
        isLoading: false,
      });
      throw err;
    }
  },

  fetchInventory: async () => {
    try {
      const inventory = await gameApi.getInventory();
      set({ inventory });
    } catch (err: unknown) {
      console.error('加载行囊失败:', err);
    }
  },

  fetchParty: async () => {
    try {
      const party = await gameApi.getPartyMembers();
      set({ party });
    } catch (err: unknown) {
      console.error('加载队伍失败:', err);
    }
  },

  fetchFriends: async () => {
    try {
      const friends = await gameApi.getFriends();
      set({ friends });
    } catch (err: unknown) {
      console.error('加载好友列表失败:', err);
    }
  },

  fetchFriendRequests: async () => {
    try {
      const friendRequests = await gameApi.getFriendRequests();
      set({ friendRequests });
    } catch (err: unknown) {
      console.error('加载好友申请失败:', err);
    }
  },

  /**
   * 切换伙伴出战 / 休息；成功后用后端返回的整份阵容替换本地状态
   */
  updatePartyMemberStatus: async (memberKey, isActive) => {
    const res = await gameApi.updatePartyMemberStatus(memberKey, isActive);
    if (Array.isArray(res.members)) {
      set({ party: res.members });
    }
    return res.message || (isActive ? '已加入出战阵容' : '已下场休息');
  },

  setPlayer: (newAttrs) =>
    set((state) => ({
      player:
        newAttrs === null
          ? null
          : state.player
          ? { ...state.player, ...newAttrs }
          : ((newAttrs.id ? newAttrs : null) as PlayerProfile | null),
    })),

  updateHpMp: (hp, mp) =>
    set((state) => ({
      player: state.player ? { ...state.player, hp, mp } : null,
    })),

  addCurrency: (type, amount) =>
    set((state) => {
      if (!state.player) return state;
      return {
        player: {
          ...state.player,
          [type]: Math.max(0, (state.player[type] || 0) + amount),
        },
      };
    }),

  setUnreadMailCount: (count: number) => set({ unreadMailCount: count }),

  setMailModalOpen: (open: boolean) => set({ isMailModalOpen: open }),

  setBagModalOpen: (open: boolean) => set({ isBagModalOpen: open }),

  setFriendsModalOpen: (open: boolean) => set({ isFriendsModalOpen: open }),
}));
