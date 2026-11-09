import React, { useEffect, useRef } from 'react';
import { useMapStore } from '../store/useMapStore';
import { usePlayerStore } from '../store/usePlayerStore';

interface TopSceneHeaderProps {
  onMailClick?: () => void;
  onAccountClick?: () => void;
  /** 顶层全局广播消息文本（有内容时展示通知栏，无内容或点击关闭时置空） */
  noticeMessage?: string | null;
  /** 关闭全局广播栏回调 */
  onCloseNotice?: () => void;
}

/**
 * 顶部场景栏 (TopSceneHeader)
 * - 场景数据纯数据库驱动 (scenes 表)
 * - 顶层全局广播栏悬浮展示，不挤压下方页面布局
 */
export const TopSceneHeader: React.FC<TopSceneHeaderProps> = ({
                                                                noticeMessage,
                                                                onCloseNotice,
                                                              }) => {
  const scene = useMapStore((s) => s.scene);
  const fetchMap = useMapStore((s) => s.fetchMap);
  const player = usePlayerStore((s) => s.player);

  const currentMapKey = player?.currentMap || player?.areaId || 'square';
  const lastFetchedKeyRef = useRef<string | null>(null);

  // 页面刷新或玩家所在区域变动时，实时从数据库拉取对应场景配置
  useEffect(() => {
    if (currentMapKey && lastFetchedKeyRef.current !== currentMapKey) {
      lastFetchedKeyRef.current = currentMapKey;
      fetchMap(currentMapKey);
    }
  }, [currentMapKey, fetchMap]);

  // 尚未拉取到数据库场景数据时的骨架占位态
  if (!scene) {
    return (
        <header className="relative mx-space-md mt-space-xs rounded bg-gradient-to-r from-surface-container-lowest via-surface-container to-surface-container-lowest p-space-xs shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-space-sm">
              <div className="w-12 h-12 rounded bg-surface-container-highest animate-pulse flex-shrink-0" />
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <div className="h-4 w-16 bg-surface-container-highest rounded animate-pulse" />
                  <div className="h-3 w-14 bg-surface-container-high rounded animate-pulse" />
                </div>
                <div className="h-3 w-32 bg-surface-container-high rounded animate-pulse" />
              </div>
            </div>
            <div className="w-8 h-8 rounded bg-surface-container animate-pulse" />
          </div>
        </header>
    );
  }

  // 场景字段解析
  const [statusPrimary, statusSecondary] = scene.statusDesc
      ? scene.statusDesc.split('·').map((part) => part.trim())
      : ['', ''];

  const tagLabel = scene.tag || scene.region;

  return (
      <div className="relative mx-space-md mt-space-xs">
        {/* 顶层全局广播栏：使用 absolute 绝对定位悬浮，避免出现时将下方页面顶下去 */}
        {noticeMessage && (
            <aside
                aria-live="polite"
                className="absolute -top-2 left-0 right-0 z-50 transform -translate-y-full mb-1 flex items-center justify-between px-3 py-1.5 rounded-lg border border-primary/40 bg-surface-container-highest/95 backdrop-blur-md shadow-lg text-primary text-xs transition-all duration-300 animate-fadeIn"
            >
              <div className="flex items-center gap-2 overflow-hidden mr-2">
            <span className="material-symbols-outlined text-[16px] text-amber-400 flex-shrink-0">
              campaign
            </span>
                <span className="truncate tracking-wide font-medium">
              {noticeMessage}
            </span>
              </div>

              {onCloseNotice && (
                  <button
                      type="button"
                      className="text-on-surface-variant hover:text-on-surface p-0.5 rounded transition-colors flex-shrink-0"
                      onClick={onCloseNotice}
                      title="关闭通知"
                  >
              <span className="material-symbols-outlined text-[16px] leading-none">
                close
              </span>
                  </button>
              )}
            </aside>
        )}

        {/* 场景主体卡片 */}
        <header className="relative rounded bg-gradient-to-r from-surface-container-lowest via-surface-container to-surface-container-lowest p-space-xs shadow-md">
          <div className="flex items-center justify-between">
            {/* 场景微缩视口与场景信息 */}
            <div className="flex items-center gap-space-sm">
              <div className="relative w-12 h-12 rounded bg-surface-container-highest overflow-hidden shadow-inner flex-shrink-0">
                {scene.thumb ? (
                    <img
                        className="w-full h-full object-cover"
                        alt={scene.name}
                        src={scene.thumb}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-surface-container-high text-on-surface-variant text-xs">
                      景
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest/80 via-transparent to-transparent pointer-events-none" />
                <span className="absolute bottom-0 right-0 text-[9px] font-label-sm text-primary px-0.5 bg-surface-container-lowest/90 scale-90">
                景
              </span>
              </div>

              <div className="flex flex-col">
                <div className="flex items-center gap-space-xs">
                <span className="text-primary font-headline-sm text-headline-sm tracking-widest drop-shadow font-bold">
                  {scene.name}
                </span>
                  {tagLabel && (
                      <span className="text-[10px] font-label-sm text-on-surface-variant bg-surface-container-high px-1 py-0.5 rounded">
                    {tagLabel}
                  </span>
                  )}
                </div>

                <div className="flex items-center gap-1 text-[11px] font-data-metric text-tertiary">
                <span className="material-symbols-outlined text-[13px] text-primary">
                  pin_drop
                </span>
                  {scene.coords && (
                      <span>
                    [{scene.coords[0]}, {scene.coords[1]}]
                  </span>
                  )}
                  {statusPrimary && <span>{statusPrimary}</span>}
                  {statusSecondary && (
                      <span className="text-on-surface-variant font-label-sm text-[10px]">
                    · {statusSecondary}
                  </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </header>
      </div>
  );
};