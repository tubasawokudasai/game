import React, { useRef, useState, useMemo } from 'react';
import { SceneItem } from '../types';
import { MapPin, Compass, Grid, Eye, Plus, Move } from 'lucide-react';

interface MapVisualEditorProps {
  scenes: SceneItem[];
  selectedSceneId: string | null;
  onSelectScene: (scene: SceneItem) => void;
  onDoubleClickScene?: (scene: SceneItem) => void;
  onUpdateCoordinates?: (id: string, coordX: number, coordY: number) => void;
  onCreateAtCoordinates?: (coordX: number, coordY: number) => void;
}

const WORLD_SIZE = 512;

/**
 * 九州大千世界地图底图（与前台 TravelMapScreen 保持严格一致）
 */
export const GAME_WORLD_MAP_URL =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAaluVIbdGEpLZTED-WOD96wXSIv_jp4Aa5S2P1PvakKJk3iUBCQ_iBZvFG20ptkgvkDrVQRp2kvz9XrDv3GrTlQaawFbBzrhu2-R6YpH7tbQmHWqKBPTCjqJvEE8KsS3oH73gj042f2oPT5SHAMb9bOHIWT6YCwpy0TH6zU48g0z4Jp-io3B3XWRekZZsXJq5Q8Z4SKHgQN2sBPQXRiE5Fx0-ftfk_hE_QY6UL8zdh';

export const MapVisualEditor: React.FC<MapVisualEditorProps> = ({
  scenes,
  selectedSceneId,
  onSelectScene,
  onDoubleClickScene,
  onUpdateCoordinates,
  onCreateAtCoordinates,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredScene, setHoveredScene] = useState<SceneItem | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [bgBrightness, setBgBrightness] = useState<number>(90); // 50% ~ 100%

  // 动态底图：优先展示当前选中场景的 background_url，若无则展示父场景，均无则回退根世界大地图
  const activeBackgroundUrl = useMemo(() => {
    if (selectedSceneId) {
      const selected = scenes.find((s) => s.id === selectedSceneId);
      if (selected?.background_url) return selected.background_url;
      if (selected?.parent_id) {
        const parent = scenes.find((s) => s.id === selected.parent_id);
        if (parent?.background_url) return parent.background_url;
      }
    }
    // 根世界地图：优先查找 level===1 的场景或者自定义的根背景
    const rootScene = scenes.find((s) => s.level === 1 && s.background_url);
    return rootScene?.background_url || GAME_WORLD_MAP_URL;
  }, [scenes, selectedSceneId]);
  // 交互模式：'create' 为点击地图直接新建（默认），'move' 为点击移动选中点位
  const [interactionMode, setInteractionMode] = useState<'create' | 'move'>('create');
  const [cursorCoords, setCursorCoords] = useState<{ x: number; y: number } | null>(null);

  // 鼠标在画布滑动时实时换算网格坐标
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * WORLD_SIZE);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * WORLD_SIZE);

    setCursorCoords({
      x: Math.max(0, Math.min(WORLD_SIZE, x)),
      y: Math.max(0, Math.min(WORLD_SIZE, y)),
    });
  };

  const handleMouseLeave = () => {
    setCursorCoords(null);
  };

  // 点击地图区域触发新建或移动
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * WORLD_SIZE);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * WORLD_SIZE);

    const clampedX = Math.max(0, Math.min(WORLD_SIZE, x));
    const clampedY = Math.max(0, Math.min(WORLD_SIZE, y));

    if (interactionMode === 'create') {
      // 核心要求：直接点击地图区域立即触发新建并预填该点坐标
      if (onCreateAtCoordinates) {
        onCreateAtCoordinates(clampedX, clampedY);
      }
    } else if (interactionMode === 'move') {
      // 移动模式：将当前选中的地标移至点击处
      if (selectedSceneId && onUpdateCoordinates) {
        onUpdateCoordinates(selectedSceneId, clampedX, clampedY);
      }
    }
  };

  const selectedScene = scenes.find((s) => s.id === selectedSceneId);

  return (
    <div className="bg-[#121722] border border-slate-800 rounded-2xl p-5 space-y-4">
      {/* 头部控制与图例说明 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Compass className="w-5 h-5 text-amber-400" />
            <span>九州全界 512×512 空间网格视盘</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {interactionMode === 'create' ? (
              <span className="text-amber-300 font-medium">
                🎯 当前处于【点击添加模式】：直接点击地图任意区域即可在该处新建地标！
              </span>
            ) : (
              <span>
                当前处于【移动模式】：点击地图区域可将选定地标【{selectedScene?.name || '未选'}】移动至该处。
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* 模式切换器 */}
          <div className="flex items-center p-1 rounded-xl bg-[#0a0e16] border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setInteractionMode('create')}
              className={`px-2.5 py-1 rounded-lg flex items-center gap-1 font-medium transition ${
                interactionMode === 'create'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="点击地图空白区域直接弹出新建弹窗"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>点击添加</span>
            </button>

            <button
              type="button"
              onClick={() => setInteractionMode('move')}
              className={`px-2.5 py-1 rounded-lg flex items-center gap-1 font-medium transition ${
                interactionMode === 'move'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="点击地图区域移动当前选中的地标"
            >
              <Move className="w-3.5 h-3.5" />
              <span>移动点位</span>
            </button>
          </div>

          {/* 辅助网格与底图明暗调节 */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0a0e16] border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setShowGrid(!showGrid)}
              className={`px-2 py-1 rounded-lg flex items-center gap-1 transition ${
                showGrid
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="切换 64 坐标网格辅助线"
            >
              <Grid className="w-3.5 h-3.5" />
              <span>网格</span>
            </button>

            <button
              type="button"
              onClick={() => setBgBrightness((b) => (b === 100 ? 60 : b === 60 ? 85 : 100))}
              className="px-2 py-1 rounded-lg text-slate-400 hover:text-slate-200 flex items-center gap-1 transition"
              title="调节地图底图明暗"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{bgBrightness}%</span>
            </button>
          </div>
        </div>
      </div>

      {/* 512x512 画布展示区 */}
      <div className="relative flex justify-center">
        <div
          ref={containerRef}
          onClick={handleCanvasClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className={`relative w-full max-w-[640px] aspect-square bg-[#0b0e14] border-2 border-slate-700/80 rounded-2xl overflow-hidden shadow-2xl select-none ${
            interactionMode === 'create' ? 'cursor-crosshair' : 'cursor-move'
          }`}
        >
          {/* 1. 动态场景/大千世界底图 */}
          <div
            className="absolute inset-0 bg-cover bg-center w-full h-full pointer-events-none transition-all duration-300"
            style={{
              backgroundImage: `url('${activeBackgroundUrl}')`,
              opacity: bgBrightness / 100,
            }}
          />

          {/* 2. 国风暗色与微光遮罩 */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#080c14]/75 via-transparent to-[#080c14]/40 pointer-events-none" />

          {/* 3. 512x512 空间辅助网格层 */}
          {showGrid && (
            <div
              className="absolute inset-0 pointer-events-none transition-opacity"
              style={{
                backgroundImage: `
                  linear-gradient(to right, rgba(234, 179, 8, 0.15) 1px, transparent 1px),
                  linear-gradient(to bottom, rgba(234, 179, 8, 0.15) 1px, transparent 1px)
                `,
                backgroundSize: '12.5% 12.5%',
              }}
            />
          )}

          {/* 画布四角坐标标记 */}
          <span className="absolute top-2 left-2 text-[10px] font-mono font-bold text-amber-200/80 bg-black/60 px-1 rounded pointer-events-none">
            [0, 0]
          </span>
          <span className="absolute top-2 right-2 text-[10px] font-mono font-bold text-amber-200/80 bg-black/60 px-1 rounded pointer-events-none">
            [512, 0]
          </span>
          <span className="absolute bottom-2 left-2 text-[10px] font-mono font-bold text-amber-200/80 bg-black/60 px-1 rounded pointer-events-none">
            [0, 512]
          </span>
          <span className="absolute bottom-2 right-2 text-[10px] font-mono font-bold text-amber-200/80 bg-black/60 px-1 rounded pointer-events-none">
            [512, 512]
          </span>

          {/* 渲染所有场景地标点位 */}
          {scenes.map((scene) => {
            const isSelected = scene.id === selectedSceneId;
            const leftPercent = (scene.coord_x / WORLD_SIZE) * 100;
            const topPercent = (scene.coord_y / WORLD_SIZE) * 100;

            let dotColor = 'bg-sky-400 text-sky-950';
            if (scene.level === 1) dotColor = 'bg-purple-400 text-purple-950';
            if (scene.level === 2) dotColor = 'bg-amber-400 text-amber-950';

            return (
              <div
                key={scene.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectScene(scene);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (onDoubleClickScene) {
                    onDoubleClickScene(scene);
                  }
                }}
                onMouseEnter={() => setHoveredScene(scene)}
                onMouseLeave={() => setHoveredScene(null)}
                style={{
                  left: `${leftPercent}%`,
                  top: `${topPercent}%`,
                }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all duration-150 z-10 group`}
              >
                {/* 脉冲光环 */}
                {isSelected && (
                  <div className="absolute inset-0 -m-2 rounded-full border-2 border-amber-400 animate-ping opacity-90 pointer-events-none" />
                )}

                {/* 点位图标 */}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shadow-xl transition-transform ${dotColor} ${
                    isSelected ? 'ring-4 ring-amber-400/60 scale-125 z-20' : 'hover:scale-110'
                  }`}
                  title={`${scene.name} (${scene.icon || 'default'})`}
                >
                  <span className="material-symbols-outlined text-[15px] leading-none select-none">
                    {scene.icon || (scene.level === 1 ? 'fort' : scene.level === 2 ? 'castle' : 'flag')}
                  </span>
                </div>

                {/* 名称标签 */}
                <div
                  className={`absolute left-1/2 -translate-x-1/2 top-7 px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap shadow-xl pointer-events-none transition-opacity backdrop-blur-md ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 font-bold opacity-100 z-30 ring-1 ring-amber-300'
                      : 'bg-black/85 text-slate-200 border border-slate-700/80 opacity-85 group-hover:opacity-100 group-hover:scale-105'
                  }`}
                >
                  {scene.name}
                  <span className="font-mono text-[9px] opacity-75 ml-1">
                    [{scene.coord_x},{scene.coord_y}]
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 底部坐标指示与操作提醒 */}
      <div className="p-3 bg-[#090d14] border border-slate-800 rounded-xl flex items-center justify-between text-xs text-slate-300">
        <div>
          {cursorCoords ? (
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>当前鼠标指点坐标:</span>
              <strong className="text-amber-300 font-mono text-xs">
                [{cursorCoords.x}, {cursorCoords.y}]
              </strong>
              <span className="text-slate-400 text-[11px]">
                {interactionMode === 'create'
                  ? '（点击此处立即弹出新建场景）'
                  : `（点击将【${selectedScene?.name || '选中场景'}】移动至此）`}
              </span>
            </span>
          ) : selectedSceneId ? (
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              当前选定目标：
              <strong className="text-amber-300 font-semibold">
                {selectedScene?.name || selectedSceneId}
              </strong>
              <span className="text-slate-400 font-mono text-[11px]">
                (位置: [{selectedScene?.coord_x}, {selectedScene?.coord_y}])
              </span>
            </span>
          ) : (
            <span className="text-slate-400">在地图上点击任意区域可直接添加全新地标场景</span>
          )}
        </div>

        <div className="text-slate-400 font-mono text-[11px] hidden sm:block">
          {hoveredScene ? `地标: ${hoveredScene.name}` : `模式: ${interactionMode === 'create' ? '点击新建' : '移动点位'}`}
        </div>
      </div>
    </div>
  );
};
