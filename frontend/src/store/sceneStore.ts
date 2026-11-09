import { create } from 'zustand';

export interface ScenePlayer {
  id: string;
  name: string;
  areaId: string;
  avatar?: string;
  level?: number;
  realm?: string;
  title?: string;
}

interface SceneState {
  currentZoneId: string;
  currentAreaId: string;
  players: ScenePlayer[];

  // 状态修改器
  setZone: (zoneId: string) => void;
  setArea: (areaId: string) => void;
  setAreaPlayers: (areaId: string, areaPlayers: ScenePlayer[]) => void;
  addPlayer: (player: ScenePlayer) => void;
  removePlayer: (playerId: string) => void;
  syncCurrentPlayer: (player: {
    id: string;
    nickname: string;
    areaId?: string;
    currentMap?: string;
    avatar?: string;
    level?: number;
    realm?: string;
    title?: string;
  }) => void;
  getAreaPlayers: (areaId?: string) => ScenePlayer[];
}

/**
 * 场景极简同道状态 Store (Zustand)
 *
 * 核心机制：
 * 场景内只按 area_id 过滤并显示当前子区域（如广场）的同道列表，无需渲染坐标组件。
 */
export const useSceneStore = create<SceneState>((set, get) => ({
  currentZoneId: 'changle_city',
  currentAreaId: 'square',
  players: [],

  setZone: (zoneId: string) => set({ currentZoneId: zoneId }),

  setArea: (areaId: string) => set({ currentAreaId: areaId }),

  setAreaPlayers: (areaId: string, areaPlayers: ScenePlayer[]) =>
    set((state) => {
      // 保持其他子区域玩家，精准覆盖/更新该 areaId 下的所有玩家列表。
      const otherAreaPlayers = state.players.filter((p) => p.areaId !== areaId);
      const normalizedAreaPlayers = areaPlayers.map((p) => ({
        ...p,
        areaId,
      }));
      console.log(`[SceneStore] setAreaPlayers areaId=${areaId} count=${areaPlayers.length} ids=`, areaPlayers.map(p => p.id));
      return {
        // 以服务器返回的 areaId 作为权威 currentAreaId，确保过滤逻辑对齐
        currentAreaId: areaId,
        players: [...otherAreaPlayers, ...normalizedAreaPlayers],
      };
    }),

  addPlayer: (player: ScenePlayer) =>
    set((state) => {
      const normalizedPlayer: ScenePlayer = {
        ...player,
        areaId: player.areaId || (player as any).currentMap || state.currentAreaId,
      };
      const remaining = state.players.filter((p) => p.id !== normalizedPlayer.id);
      return {
        players: [...remaining, normalizedPlayer],
      };
    }),

  removePlayer: (playerId: string) =>
    set((state) => ({
      players: state.players.filter((p) => p.id !== playerId),
    })),

  syncCurrentPlayer: (player) =>
    set((state) => {
      const areaId = player.areaId || player.currentMap || state.currentAreaId;
      const existing = state.players.filter((p) => p.id !== player.id);
      const updatedSelf: ScenePlayer = {
        id: player.id,
        name: player.nickname,
        areaId,
        avatar: player.avatar,
        level: player.level,
        realm: player.realm,
        title: player.title,
      };
      return {
        currentAreaId: areaId,
        players: [...existing, updatedSelf],
      };
    }),

  getAreaPlayers: (areaId?: string) => {
    const targetArea = areaId || get().currentAreaId;
    return get().players.filter((p) => p.areaId === targetArea);
  },
}));
