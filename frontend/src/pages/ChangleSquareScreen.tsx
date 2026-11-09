import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMapStore } from '../store/useMapStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { gameApi } from '../services/api';
import { useDialogueStore } from '../store/useDialogueStore';

interface ChangleSquareScreenProps {
  onShowNotice: (msg: string) => void;
  onOpenPlayerModal?: (playerId?: string) => void;
}

type VenueItem = Awaited<ReturnType<typeof gameApi.getVenues>>['venues'][number];

/**
 * 屏幕6：长乐广场社交画卷 (ChangleSquareScreen)
 * 纯动态：在线人数与场景状态连接实时 MapDO 广播数据，消除硬编码假数据
 */
export const ChangleSquareScreen: React.FC<ChangleSquareScreenProps> = ({ onShowNotice }) => {
  const navigate = useNavigate();
  const scene = useMapStore((s) => s.scene);
  const unreadMailCount = usePlayerStore((s) => s.unreadMailCount);
  const setMailModalOpen = usePlayerStore((s) => s.setMailModalOpen);
  const onlineCount = scene?.onlineCount ?? 0;

  // 坊市画卷完全由后端接口下发，接口失败或为空时保持空白状态
  const [venues, setVenues] = useState<VenueItem[]>([]);
  const [isVenuesLoading, setIsVenuesLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    gameApi
      .getVenues('square')
      .then((data) => {
        if (cancelled) return;
        setVenues(Array.isArray(data?.venues) ? data.venues : []);
      })
      .catch(() => {
        if (cancelled) return;
        setVenues([]);
      })
      .finally(() => {
        if (!cancelled) setIsVenuesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col w-full text-on-surface select-none pb-4">
      {/* 顶部场景栏 */}
      <header className="flex items-center justify-between px-space-md py-space-sm bg-surface-container-lowest/80 backdrop-blur-md shadow-md sticky top-0 z-30 border-b border-outline-variant/30">
        <div className="flex items-center gap-space-sm">
          <button
            type="button"
            onClick={() => navigate('/facility')}
            className="w-8 h-8 rounded bg-surface-container-high flex items-center justify-center text-primary shadow-inner hover:bg-surface-bright"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          </button>
          <div className="flex flex-col">
            <div className="flex items-center gap-space-xs">
              <h1 className="font-headline-md text-[16px] text-primary tracking-wider font-bold">
                长乐广场
              </h1>
              <span className="font-label-sm text-[9px] px-1 py-0.2 rounded bg-surface-container-high text-primary-fixed-dim">
                核心社交中心
              </span>
            </div>
            <div className="flex items-center gap-space-xs text-on-surface-variant text-[10px]">
              <span className="material-symbols-outlined text-[12px] text-tertiary">explore</span>
              <span>
                {scene?.coords ? `[${scene.coords[0]}, ${scene.coords[1]}]` : ''}
              </span>
              <span className="text-outline">·</span>
              <span className="text-tertiary-fixed-dim">灵泉论道 · 九州云集</span>
            </div>
          </div>
        </div>
        {unreadMailCount > 0 && (
          <button
            type="button"
            onClick={() => {
              setMailModalOpen(true);
            }}
            className="relative w-8 h-8 rounded border border-amber-400/80 bg-amber-500/20 hover:bg-amber-500/30 flex items-center justify-center text-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.7)] animate-pulse transition-all active:scale-95"
            title={`飞鸽传书：有 ${unreadMailCount} 封未读道书`}
          >
            <span className="material-symbols-outlined text-[18px] text-amber-300">mail</span>
            <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-1 rounded-full bg-error text-white text-[9px] font-bold flex items-center justify-center border border-surface shadow-sm">
              {unreadMailCount > 9 ? '9+' : unreadMailCount}
            </span>
          </button>
        )}
      </header>

      <div className="flex flex-col gap-space-md px-space-md mt-space-sm">
        {/* 全景天象横幅 */}
        <div className="relative rounded-xl overflow-hidden shadow-xl bg-surface-container-low border border-outline-variant/30">
          <div
            className="relative w-full h-36 bg-gradient-to-br from-[#24384a] via-[#182838] to-[#0d1722]"
          >
            <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-surface-container-lowest/50 to-transparent" />
            <div className="absolute top-space-xs left-space-xs right-space-xs flex items-center justify-between flex-wrap gap-space-xs">
              <div className="flex items-center gap-space-xs px-2 py-0.5 rounded-full bg-surface-container-lowest/80 backdrop-blur-sm shadow-sm text-[10px]">
                <span className="inline-block w-2 h-2 rounded-full bg-tertiary animate-pulse" />
                <span className="font-label-sm text-on-surface">
                  当前驻留：
                  <span className="text-primary font-data-metric">({onlineCount}位同道在场)</span>
                </span>
              </div>
            </div>

            <div className="absolute bottom-2 left-space-sm right-space-sm">
              <p className="font-headline-md text-[13px] text-primary drop-shadow tracking-widest font-semibold">
                长乐千灯照夜明，九州仙客共欢声
              </p>
              <p className="font-body-sm text-[10px] text-on-surface-variant drop-shadow-sm">
                云楼画舫倚灵泉，四海同道结仙缘
              </p>
            </div>
          </div>

          {/* 快捷社交 */}
          <div className="grid grid-cols-4 gap-space-xs p-space-xs bg-surface-container-lowest">
            <button
              type="button"
              onClick={() => onShowNotice('已打开广场寻仙组队招募！')}
              className="flex flex-col items-center justify-center py-1.5 px-1 rounded bg-surface-container-high hover:bg-surface-bright active:scale-95 transition-all text-center"
            >
              <span className="material-symbols-outlined text-primary text-[18px]">group_add</span>
              <span className="font-label-sm text-[10px] text-on-surface mt-0.5">发布招募</span>
            </button>
            <button
              type="button"
              onClick={() => onShowNotice('摆摊系统：在此设下摊位，售卖灵药飞剑')}
              className="flex flex-col items-center justify-center py-1.5 px-1 rounded bg-surface-container-high hover:bg-surface-bright active:scale-95 transition-all text-center"
            >
              <span className="material-symbols-outlined text-primary-fixed-dim text-[18px]">
                storefront
              </span>
              <span className="font-label-sm text-[10px] text-on-surface mt-0.5">摆摊设位</span>
            </button>
            <button
              type="button"
              onClick={() => onShowNotice(`当前广场在线道友共计 ${onlineCount} 人`)}
              className="flex flex-col items-center justify-center py-1.5 px-1 rounded bg-surface-container-high hover:bg-surface-bright active:scale-95 transition-all text-center"
            >
              <span className="material-symbols-outlined text-tertiary text-[18px]">contacts</span>
              <span className="font-label-sm text-[10px] text-on-surface mt-0.5">同道名录</span>
            </button>
            <button
              type="button"
              onClick={() => onShowNotice('已向灵泉台投下一盏祈福孔明灯！')}
              className="flex flex-col items-center justify-center py-1.5 px-1 rounded bg-surface-container-high hover:bg-surface-bright active:scale-95 transition-all text-center"
            >
              <span className="material-symbols-outlined text-secondary text-[18px]">
                volunteer_activism
              </span>
              <span className="font-label-sm text-[10px] text-on-surface mt-0.5">祈福留言</span>
            </button>
          </div>
        </div>

        {/* 【主线奇遇入口】演武校场·幽冥守卫阵眼破灭 (直达墨芳剧情与战斗系统) */}
        <div
          onClick={() => useDialogueStore.getState().openDialogue('mofang')}
          className="relative rounded-xl p-3 bg-gradient-to-r from-red-950/80 via-slate-900 to-teal-950/80 border border-amber-500/60 shadow-[0_4px_16px_rgba(245,158,11,0.25)] cursor-pointer hover:border-amber-400 active:scale-[0.99] transition-all group overflow-hidden"
        >
          <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-red-600/10 to-transparent pointer-events-none" />
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-full border border-amber-400/90 bg-amber-500/20 flex items-center justify-center text-amber-300 font-bold font-serif text-lg shadow-[0_0_12px_rgba(245,158,11,0.5)] flex-shrink-0 animate-pulse">
                令
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-amber-300 tracking-wider">
                    【校场奇遇】演武异动 · 密令除魔
                  </span>
                  <span className="text-[9px] px-1 py-0.2 rounded bg-red-600 text-white font-mono animate-bounce">
                    战
                  </span>
                </div>
                <span className="text-[10px] text-slate-300 line-clamp-1 mt-0.5 font-serif">
                  墨芳：“演武校场夜夜渗出幽冥死气，三位同伴已在城中候命……”
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-amber-300 font-bold flex-shrink-0 pl-2 group-hover:translate-x-1 transition-transform">
              <span>见墨芳</span>
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </div>
          </div>
        </div>

        {/* 六大场所画卷 */}
        <div className="flex flex-col gap-space-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-space-xs">
              <span className="w-1 h-3.5 bg-primary rounded-full" />
              <h2 className="font-headline-md text-[13px] text-primary font-semibold tracking-wide">
                坊肆盛景 · 九州名胜
              </h2>
            </div>
            <span className="font-label-sm text-[9px] text-on-surface-variant">入画漫步，仙凡同欢</span>
          </div>

          <div className="flex flex-col gap-space-sm">
            {isVenuesLoading ? (
              <div className="py-10 text-center text-[11px] text-on-surface-variant/60">
                正在展开坊市画卷...
              </div>
            ) : venues.length === 0 ? (
              <div className="py-10 text-center text-[11px] text-on-surface-variant/60">
                坊市画卷暂未开放
              </div>
            ) : (
              venues.map((v) => (
              <div
                key={v.id}
                className="flex flex-col rounded-lg bg-surface-container-low shadow-md overflow-hidden relative border border-outline-variant/30"
              >
                <div className="flex flex-col sm:flex-row gap-space-sm p-space-sm">
                  <div className="w-full sm:w-24 h-24 rounded overflow-hidden relative shrink-0 shadow-inner bg-surface-container">
                    <img className="w-full h-full object-cover" alt={v.name} src={v.img} />
                    <div className="absolute bottom-1 left-1 px-1 py-0.2 rounded bg-surface-container-lowest/80 text-primary font-label-sm text-[9px]">
                      {v.tag}
                    </div>
                  </div>
                  <div className="flex flex-col justify-between flex-grow min-w-0">
                    <div>
                      <div className="flex items-center justify-between">
                        <h3 className="font-headline-sm text-[12px] text-primary font-bold">{v.name}</h3>
                        <span className="font-label-sm text-[9px] text-secondary bg-secondary-container/50 px-1.5 py-0.2 rounded-full">
                          {v.badge}
                        </span>
                      </div>
                      <p className="font-body-sm text-[10px] text-on-surface-variant mt-0.5">{v.desc}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {v.chips.map((c) => (
                          <span
                            key={c}
                            className="font-label-sm text-[9px] px-1 py-0.2 bg-surface-container-high rounded text-on-surface-variant"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-space-sm px-space-sm py-1 bg-surface-container-lowest/60 border-t border-outline-variant/20">
                  <button
                    type="button"
                    onClick={() => onShowNotice(v.actionNotice)}
                    className="px-space-lg py-1 rounded bg-secondary-container text-on-secondary-container font-headline-sm text-[11px] font-semibold hover:opacity-90 active:scale-95 shadow transition-all"
                  >
                    立即前往
                  </button>
                </div>
              </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
