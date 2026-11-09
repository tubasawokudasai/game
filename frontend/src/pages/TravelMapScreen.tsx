import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TopSceneHeader } from '../components/TopSceneHeader';
import { MainTabNavigation } from '../components/MainTabNavigation';
import { PartyStatusBar } from '../components/PartyStatusBar';
import { GlobalChatSection } from '../components/GlobalChatSection';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSceneStore } from '../store/sceneStore';
import { useMapStore } from '../store/useMapStore';
import { WebSocketManager } from '../hooks/useWebSocket';
import { MapSceneInfo } from '../types/game';

interface TravelMapScreenProps {
  onShowNotice: (msg: string) => void;
  onOpenPlayerModal?: (playerId?: string) => void;
}

/**
 * scenes.coord_x / coord_y 是 512×512 的世界坐标网格（如 [128, 256]、[420, 310]），**并非 0-100 百分比**。
 * 直接当作百分比写进 CSS 会把全部点位甩到视口之外，只留下一张空底图，故此处统一换算。
 */
const WORLD_CANVAS_SIZE = 512;

/** 视口边缘安全边距（百分比），避免贴边点位的名称气泡被裁切 */
const VIEWPORT_EDGE_PADDING = 8;

/** 世界坐标 → 视口百分比，并夹紧在安全边距内，保证任何异常坐标都不会跑出画布 */
const toViewportPercent = (worldCoord: number | undefined | null): number => {
  const value = Number(worldCoord);
  if (!Number.isFinite(value)) return 50;
  const percent = (value / WORLD_CANVAS_SIZE) * 100;
  return Math.min(100 - VIEWPORT_EDGE_PADDING, Math.max(VIEWPORT_EDGE_PADDING, percent));
};

interface LocationInfo {
  title: string;
  tag: string;
  subtitle: string;
  thumb: string;
  desc: string;
  feature: string;
  cost: string;
  btnText: string;
}

export const TravelMapScreen: React.FC<TravelMapScreenProps> = ({ onShowNotice, onOpenPlayerModal }) => {
  const player = usePlayerStore((s) => s.player);
  const inventory = usePlayerStore((s) => s.inventory);
  const allScenes = useMapStore((s) => s.allScenes);
  const fetchAllScenes = useMapStore((s) => s.fetchAllScenes);
  const fetchMap = useMapStore((s) => s.fetchMap);
  const isScenesLoading = useMapStore((s) => s.isScenesLoading);
  const scenesError = useMapStore((s) => s.scenesError);

  const currentLocationKey = player?.areaId || player?.currentMap || 'square';

  // 动态根据后端数据库 scenes 计算地点层级与层级归属
  const getLevelByScene = (key: string): number => {
    const sc = allScenes[key];
    if (sc?.level) return sc.level;
    return 3;
  };

  const [selectedKey, setSelectedKey] = useState<string>(() => currentLocationKey);
  const [mapLevel, setMapLevel] = useState<number>(() => getLevelByScene(currentLocationKey));
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [searchParams] = useSearchParams();
  const targetScene = searchParams.get('target');
  // 记录已自动弹出确认窗的 target，避免 allScenes 刷新时重复弹窗
  const autoOpenedTargetRef = useRef<string | null>(null);

  // 页面初次载入时自动从 D1 数据库拉取全九州场景元数据
  useEffect(() => {
    fetchAllScenes();
  }, [fetchAllScenes]);

  // 页面刷新后如果 player 是异步获取的，监听并更新回玩家真实地点
  useEffect(() => {
    if (player?.areaId || player?.currentMap) {
      // 从「任务」入口带 target 跳转时，保留目标地点，不被玩家当前所在地覆盖
      if (targetScene && allScenes[targetScene]) return;

      const locKey = player.areaId || player.currentMap || 'square';
      setSelectedKey(locKey);
      setMapLevel(getLevelByScene(locKey));
    }
  }, [player?.areaId, player?.currentMap, allScenes, targetScene]);

  // 剧情指引：预选目标场景并打开前往确认弹窗。
  // 同一个 target 只自动弹一次：点击确认后 handleLocationAction 会切换场景并刷新 allScenes，
  // 若不加限定，allScenes 变化会让本 effect 再次执行，把刚关掉的弹窗重新打开。
  useEffect(() => {
    if (!targetScene) {
      autoOpenedTargetRef.current = null;
      return;
    }
    if (!allScenes[targetScene]) return;
    if (autoOpenedTargetRef.current === targetScene) return;
    autoOpenedTargetRef.current = targetScene;
    setSelectedKey(targetScene);
    setMapLevel(getLevelByScene(targetScene));
    setIsDialogOpen(true);
  }, [targetScene, allScenes]);

  const teleportRunes = inventory?.find((i) => i.itemId === 'item_teleport_rune')?.count || 0;

  // 纯数据库驱动：完全从 allScenes (D1 scenes 表) 动态读取选中场景属性
  const scenesList = Object.values(allScenes);
  const curScene = allScenes[selectedKey] || scenesList[0] || null;
  // 玩家当前所在场景（用于在尚未点击进入时保持地图背景与层级展示当前位置）
  const activeScene = allScenes[currentLocationKey] || curScene;
  const curLoc: LocationInfo = {
    title: curScene?.name || '—',
    tag: curScene?.tag || '',
    subtitle:
      curScene?.subtitle ||
      (curScene ? `${curScene.region} · 坐标 [${curScene.coords?.[0] ?? 128}, ${curScene.coords?.[1] ?? 256}]` : ''),
    thumb: curScene?.thumb || '',
    desc: curScene?.desc || curScene?.statusDesc || '',
    feature: curScene?.feature || '',
    cost: curScene?.cost || '',
    btnText: curScene?.btnText || '前往',
  };

  const isCurrentLocation = currentLocationKey === selectedKey;

  const handleSelectLocation = (key: string) => {
    setSelectedKey(key);
    setIsDialogOpen(true);
  };

  // 纯动态前往：无论是同城移动还是远距离传送，全部通用 areaId 驱动
  const handleLocationAction = async () => {
    setIsDialogOpen(false);

    if (isCurrentLocation) {
      onShowNotice(`道友已身处【${curLoc.title}】，无需重复启程。`);
      return;
    }

    const targetAreaId = selectedKey;
    setMapLevel(getLevelByScene(targetAreaId));

    // 1. WebSocket 上报切换场景 (无任何硬编码名单)
    WebSocketManager.getInstance().send({
      type: 'SCENE',
      action: 'CHANGE_AREA',
      payload: { areaId: targetAreaId },
    });

    useSceneStore.getState().setArea(targetAreaId);
    usePlayerStore.getState().setPlayer({
      areaId: targetAreaId,
      currentMap: targetAreaId,
    });

    // 2. 同步加载新场景的数据库元数据与 NPC
    fetchMap(targetAreaId);

    if (player) {
      useSceneStore.getState().syncCurrentPlayer({
        id: player.id,
        nickname: player.nickname,
        areaId: targetAreaId,
        avatar: player.avatar,
        level: player.level,
        realm: player.realm,
        title: player.title,
      });
    }
  };

  // ---------------------------------------------------------------------------
  // 层级画布：完全按数据库 scenes.level / scenes.parent_id 动态归组
  // 约定：1 = 州域（根节点），2 = 都城/地点，3 = 坊市/街区
  // ---------------------------------------------------------------------------
  const levelOfScene = (s?: MapSceneInfo): number => s?.level ?? 3;

  // 向上回溯到指定层级的祖先节点；若当前为上层节点，则向下取归属于该节点的子孙
  const ancestorIdAtLevel = (key: string, targetLevel: number): string | null => {
    let cursor: MapSceneInfo | undefined = allScenes[key];
    const visited = new Set<string>();

    while (cursor && !visited.has(cursor.mapId)) {
      visited.add(cursor.mapId);
      if (levelOfScene(cursor) === targetLevel) return cursor.mapId;
      if (!cursor.parentId) break;
      cursor = allScenes[cursor.parentId];
    }

    const root = cursor ?? allScenes[key];
    if (root) {
      const descendant = scenesList.find(
        (s) => levelOfScene(s) === targetLevel && (s.parentId === root.mapId || !root.parentId)
      );
      if (descendant) return descendant.mapId;
    }

    // 兜底返回该层级的首个有效场景，避免层级间脱节造成展示所有层级的点位
    const fallback = scenesList.find((s) => levelOfScene(s) === targetLevel);
    return fallback?.mapId ?? null;
  };

  // 同级画布只展示“归属于当前上层节点”的点位，避免不同都城的坊市叠在同一张底图上（基于当前所在位置归属）
  const scopeId = mapLevel > 1 ? ancestorIdAtLevel(currentLocationKey, mapLevel - 1) : null;

  const levelScenes = scenesList.filter((s) => levelOfScene(s) === mapLevel);
  const scopedScenes = scopeId ? levelScenes.filter((s) => s.parentId === scopeId) : levelScenes;

  // 严禁各层级点位混杂：始终只展示当前层级 (level === mapLevel) 的场景节点
  const currentLevelScenes =
    scopedScenes.length > 0
      ? scopedScenes
      : levelScenes;

  // 动态底图：优先取当前所在场景的 backgroundUrl，若无则向上取父级场景，均无则取根大地图
  const currentMapBackground = useMemo(() => {
    // 1. 当前所在场景 (点击进入确认前往后才更新)
    if (activeScene?.backgroundUrl) return activeScene.backgroundUrl;
    // 2. 当前层级所属的上级场景
    if (scopeId && allScenes[scopeId]?.backgroundUrl) {
      return allScenes[scopeId].backgroundUrl;
    }
    // 3. 根地图 (level === 1)
    const rootScene = scenesList.find((s) => s.level === 1 && s.backgroundUrl);
    if (rootScene?.backgroundUrl) return rootScene.backgroundUrl;

    // 4. 默认兜底全局山水大地图
    return '';
  }, [activeScene, scopeId, allScenes, scenesList]);

  return (
      <div className="flex flex-col w-full text-on-surface select-none pb-2">
        <TopSceneHeader onMailClick={() => onShowNotice('正在打开飞鸽传书秘录...')} />

        {/* 主屏核心区域 */}
        <section className="mx-space-md mt-space-xs h-[325px] sm:h-[345px] rounded bg-surface-container-low p-space-xs shadow-md border border-outline-variant/30 flex flex-col min-h-0">
          {/* 地图层级导航条 */}
          <div className="flex flex-wrap items-center justify-between px-space-xs py-1 bg-surface-container shadow-sm z-10 gap-y-1 border-b border-surface-container-highest rounded-t">
            <div className="flex items-center space-x-1 text-[11px] font-label-sm">
              <button
                  onClick={() => setMapLevel(1)}
                  className={`hover:text-primary transition-colors flex items-center ${
                      mapLevel === 1 ? 'text-primary font-bold' : 'text-on-surface-variant'
                  }`}
              >
                <span className="material-symbols-outlined text-[14px] mr-0.5">public</span>
                {allScenes['scene_shenzhou_region']?.name || curScene?.region || '九州总览'}
              </button>
              {scenesList.length > 0 && mapLevel >= 2 && (
                <>
                  <span className="text-outline">/</span>
                  <button
                      onClick={() => setMapLevel(2)}
                      className={`hover:text-primary transition-colors ${
                          mapLevel === 2 ? 'text-primary font-bold' : 'text-on-surface-variant'
                      }`}
                  >
                    {curScene?.region || '州域'}
                  </button>
                </>
              )}
              {scenesList.length > 0 && mapLevel === 3 && (
                <>
                  <span className="text-outline">/</span>
                  <button className="text-primary font-bold">
                    {curScene?.name || '坊市'}
                  </button>
                </>
              )}
            </div>

            <div className="flex items-center space-x-1.5 text-[10px] font-label-sm shrink-0">
              <div className="flex bg-surface-container-lowest p-0.5 rounded shadow-inner">
                <button
                    onClick={() => setMapLevel(1)}
                    className={`px-1.5 py-0.5 rounded transition-colors ${
                        mapLevel === 1
                            ? 'bg-primary-container text-on-primary-container font-bold shadow-sm'
                            : 'text-on-surface-variant hover:text-primary'
                    }`}
                >
                  州域
                </button>
                <button
                    onClick={() => setMapLevel(2)}
                    className={`px-1.5 py-0.5 rounded transition-colors ${
                        mapLevel === 2
                            ? 'bg-primary-container text-on-primary-container font-bold shadow-sm'
                            : 'text-on-surface-variant hover:text-primary'
                    }`}
                >
                  都城
                </button>
                <button
                    onClick={() => setMapLevel(3)}
                    className={`px-1.5 py-0.5 rounded transition-colors ${
                        mapLevel === 3
                            ? 'bg-primary-container text-on-primary-container font-bold shadow-sm'
                            : 'text-on-surface-variant hover:text-primary'
                    }`}
                >
                  坊市
                </button>
              </div>
              <div className="flex items-center space-x-1 text-primary bg-surface-container-high px-1.5 py-0.5 rounded">
                <span className="material-symbols-outlined text-[12px]">bolt</span>
                <span>神行符 ×{teleportRunes}</span>
              </div>
            </div>
          </div>

          {/* 世界地图视口 (完全基于数据库 scenes 动态遍历渲染，零硬编码节点) */}
          <div className="relative w-full flex-1 min-h-0 overflow-hidden bg-surface rounded-b shadow-inner mt-1">
            <div
                className="absolute inset-0 bg-cover bg-center w-full h-full opacity-80 transition-all duration-300"
                style={{
                  backgroundImage: `url('${currentMapBackground}')`,
                }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-surface/40 pointer-events-none" />

            {/* 动态场景点位层 */}
            <div className="absolute inset-0 transition-opacity">
              {currentLevelScenes.map((sc) => {
                const isSelected = selectedKey === sc.mapId;
                // 数据库存的是世界坐标，必须换算成视口百分比后再定位
                const leftPercent = toViewportPercent(sc.coords?.[0]);
                const topPercent = toViewportPercent(sc.coords?.[1]);
                const iconName = sc.icon || (sc.level === 1 ? 'fort' : sc.level === 2 ? 'castle' : 'flag');

                return (
                  <button
                    key={sc.mapId}
                    type="button"
                    onClick={() => handleSelectLocation(sc.mapId)}
                    style={{
                      left: `${leftPercent}%`,
                      top: `${topPercent}%`,
                    }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 group flex flex-col items-center transition-transform hover:scale-110 active:scale-95"
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shadow-lg transition-colors ${
                        isSelected
                          ? 'bg-primary-container text-on-primary-container ring-2 ring-primary ring-offset-2 ring-offset-surface'
                          : 'bg-surface-container-high text-on-surface hover:text-primary'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {iconName}
                      </span>
                    </div>
                    <span
                      className={`mt-0.5 px-1.5 py-0.5 rounded text-[10px] shadow transition-colors whitespace-nowrap ${
                        isSelected
                          ? 'bg-surface-container/95 text-primary font-bold ring-1 ring-primary/30'
                          : 'bg-surface-container/80 text-on-surface'
                      }`}
                    >
                      {sc.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 灵图兜底：数据为空/加载失败时给出明确反馈，而不是留一张空底图 */}
            {scenesList.length === 0 && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center space-y-2 px-6 text-center bg-surface/60 backdrop-blur-[1px]">
                <span className="material-symbols-outlined text-[26px] text-on-surface-variant">radar</span>
                <p className="text-[12px] leading-5 text-on-surface-variant">
                  {isScenesLoading ? '正在推演九州灵图…' : '灵图未能显化，请确认后端地图接口是否正常'}
                </p>
                {!isScenesLoading && (
                  <button
                    type="button"
                    onClick={() => fetchAllScenes()}
                    className="px-2.5 py-1 rounded bg-primary-container text-on-primary-container text-[11px] font-bold shadow-sm active:scale-95 transition-transform"
                  >
                    重新推演
                  </button>
                )}
                {!isScenesLoading && scenesError && (
                  <p className="text-[10px] text-error/90 break-all">{scenesError}</p>
                )}
              </div>
            )}

            {/* 罗盘控制 */}
            <div className="absolute bottom-2 right-2 flex flex-col space-y-1 z-20">              <button
                  type="button"
                  onClick={() => mapLevel < 3 && setMapLevel(mapLevel + 1)}
                  className="w-6 h-6 rounded-full bg-surface-container-high/90 text-primary flex items-center justify-center shadow border border-outline-variant/30"
              >
                <span className="material-symbols-outlined text-[14px]">add</span>
              </button>
              <button
                  type="button"
                  onClick={() => mapLevel > 1 && setMapLevel(mapLevel - 1)}
                  className="w-6 h-6 rounded-full bg-surface-container-high/90 text-primary flex items-center justify-center shadow border border-outline-variant/30"
              >
                <span className="material-symbols-outlined text-[14px]">remove</span>
              </button>
              <button
                  type="button"
                  onClick={() => {
                    const myLoc = player?.areaId || player?.currentMap || (scenesList[0]?.mapId || 'square');
                    setSelectedKey(myLoc);
                    setMapLevel(getLevelByScene(myLoc));
                  }}
                  className="w-6 h-6 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shadow"
              >
                <span className="material-symbols-outlined text-[14px]">my_location</span>
              </button>
            </div>
          </div>
        </section>

        {/* 地点详情 Dialog 模态弹窗 */}
        {isDialogOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3">
              <div className="w-full max-w-[340px] bg-[#121c27] p-3.5 rounded-lg border border-[#2a3848]/80 shadow-2xl flex flex-col space-y-2.5 relative animate-in fade-in zoom-in-95 duration-150">
                <button
                    type="button"
                    onClick={() => setIsDialogOpen(false)}
                    className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-[#1b2635] text-[#93a2b4] hover:text-white flex items-center justify-center transition-colors border border-[#2b3a4c]"
                >
                  <span className="material-symbols-outlined text-[15px]">close</span>
                </button>

                <div className="flex items-start justify-between pr-7">
                  <div className="flex flex-col">
                    <div className="flex items-center space-x-1.5">
                      <h2 className="text-[18px] font-bold text-[#f5c66d] tracking-wide font-serif">
                        {curLoc.title}
                      </h2>
                      <span className="px-1.5 py-0.5 rounded bg-[#b8914b] text-[#241704] text-[10px] font-bold">
                    {curLoc.tag}
                  </span>
                    </div>
                    <span className="text-[11px] text-[#93a2b4] mt-0.5">{curLoc.subtitle}</span>
                  </div>
                  <div className="px-2 py-0.5 rounded bg-[#1e2b3a] text-[#f2cb78] text-[11px] font-medium tracking-wider shrink-0">
                    {isCurrentLocation ? '当前驻留' : '可御剑前往'}
                  </div>
                </div>

                <div className="w-full h-[90px] rounded overflow-hidden bg-[#0a1017] border border-[#263546]">
                  {curLoc.thumb ? (
                    <img
                        src={curLoc.thumb}
                        alt={curLoc.title}
                        className="w-full h-full object-cover brightness-95 contrast-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#3f5266]">
                      <span className="material-symbols-outlined text-[26px]">landscape</span>
                    </div>
                  )}
                </div>

                <p className="text-[12px] leading-[20px] text-[#b6c4d4] font-serif tracking-normal">
                  {curLoc.desc}
                </p>

                <div className="flex items-center justify-between text-[11px] text-[#78889b] pt-0.5">
                  <span className="truncate max-w-[65%]">{curLoc.feature}</span>
                  <span className="text-[#96a8bc] shrink-0 font-medium">{curLoc.cost}</span>
                </div>

                <div className="flex items-center justify-end space-x-2 pt-1 border-t border-[#1e2c3c]">
                  <button
                      type="button"
                      onClick={() => {
                        onShowNotice(`已查探【${curLoc.title}】周边修士与坊市情报`);
                        setIsDialogOpen(false);
                      }}
                      className="h-[34px] px-3 rounded-lg bg-[#202c3a] hover:bg-[#283748] active:scale-95 text-[#dbe5f1] text-[12px] font-medium transition-all flex items-center justify-center space-x-1 border border-[#314254]/60"
                  >
                    <span className="material-symbols-outlined text-[15px]">visibility</span>
                    <span>查探人脉</span>
                  </button>

                  <button
                      type="button"
                      onClick={handleLocationAction}
                      className="h-[34px] px-4 rounded-lg bg-[#dfb76c] hover:bg-[#eac57e] active:scale-95 text-[#3a2503] text-[13px] font-bold shadow-md transition-all flex items-center justify-center space-x-1"
                  >
                <span
                    className="material-symbols-outlined text-[16px]"
                    style={{
                      fontVariationSettings: "'FILL' 0, 'wght' 400",
                    }}
                >
                  near_me
                </span>
                    <span>{curLoc.btnText}</span>
                  </button>
                </div>
              </div>
            </div>
        )}

        {/* 底部导航、队伍状态、全服聊天 */}
        <MainTabNavigation activeTab="travel" />
        <PartyStatusBar onShowNotice={onShowNotice} onOpenProfile={onOpenPlayerModal} />
        <GlobalChatSection onShowNotice={onShowNotice} />
      </div>
  );
};