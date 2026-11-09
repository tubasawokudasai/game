import { create } from 'zustand';
import { MapSceneInfo, NpcEntity } from '../types/game';
import { gameApi } from '../services/api';

interface MapState {
  scene: MapSceneInfo | null;
  allScenes: Record<string, MapSceneInfo>;
  npcs: NpcEntity[];
  isLoading: boolean;
  error: string | null;
  isScenesLoading: boolean;
  scenesError: string | null;

  fetchMap: (mapId: string, force?: boolean) => Promise<void>;
  fetchAllScenes: () => Promise<void>;
  updateScene: (scene: Partial<MapSceneInfo>) => void;
  setNpcs: (npcs: NpcEntity[]) => void;
}

let fetchMapSequence = 0;

/**
 * 地图场景与当前区域实体 Store (Zustand)
 * 数据完全由 MapDO / 后端 API 动态灌注，无写死假数据
 */
export const useMapStore = create<MapState>((set, get) => ({
  scene: null,
  allScenes: {},
  npcs: [],
  isLoading: false,
  error: null,
  isScenesLoading: false,
  scenesError: null,

  fetchMap: async (mapId: string, force = false) => {
    // 非强制刷新时，同场景已有 NPC 数据则跳过，避免冗余重复拉取
    const currentScene = get().scene;
    if (!force && currentScene && currentScene.mapId === mapId && get().npcs.length > 0) {
      return;
    }

    const requestId = ++fetchMapSequence;
    set({ isLoading: true, error: null });
    try {
      const data = await gameApi.getMapDetails(mapId);
      // 对话结束/传送会并发刷新不同地图，旧响应不能覆盖新场景列表
      if (requestId !== fetchMapSequence) return;
      set((state) => ({
        scene: data.scene,
        npcs: data.npcs,
        allScenes: {
          ...state.allScenes,
          [mapId]: data.scene,
          [data.scene.mapId]: data.scene,
        },
        isLoading: false,
      }));
    } catch (err: unknown) {
      if (requestId !== fetchMapSequence) return;
      set({
        error: err instanceof Error ? err.message : '获取地图场景数据失败',
        isLoading: false,
      });
    }
  },

  fetchAllScenes: async () => {
    set({ isScenesLoading: true, scenesError: null });
    try {
      const scenes = await gameApi.getAllMaps();
      const mapRecord: Record<string, MapSceneInfo> = {};
      scenes.forEach((s) => {
        mapRecord[s.mapId] = s;
      });
      set({ allScenes: mapRecord, isScenesLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '获取全量地图列表失败';
      console.error('[useMapStore] 获取全量地图列表失败:', err);
      set({ isScenesLoading: false, scenesError: message });
    }
  },

  updateScene: (sceneUpdate) =>
    set((state) => ({
      scene: state.scene ? { ...state.scene, ...sceneUpdate } : null,
    })),

  setNpcs: (npcs) => set({ npcs }),
}));
