import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TopSceneHeader } from '../components/TopSceneHeader';
import { MainTabNavigation } from '../components/MainTabNavigation';
import { PartyStatusBar } from '../components/PartyStatusBar';
import { GlobalChatSection } from '../components/GlobalChatSection';
import { CharacterPanel } from '../components/CharacterPanel';
import { FacilityItem } from '../App';

interface CityFacilitiesScreenProps {
  onShowNotice: (msg: string) => void;
  onOpenFacility: (fac: FacilityItem) => void;
  onOpenPlayerModal: (playerId?: string) => void;
}

/**
 * 屏幕3：城内设施总览 (CityFacilitiesScreen)
 * 纯动态数据驱动：左侧个人状态完全读取自 usePlayerStore
 */
export const CityFacilitiesScreen: React.FC<CityFacilitiesScreenProps> = ({
  onShowNotice,
  onOpenFacility,
  onOpenPlayerModal,
}) => {
  const navigate = useNavigate();

  const facilities: FacilityItem[] = [
    {
      name: '悬壶馆',
      sub: '回春疗伤 · 丹药炼制',
      desc: '本馆有天阶金创药、洗髓丹。药王孙真人坐镇，可消耗铜钱完全恢复全队气血与内力。',
      action: '购药/疗伤',
      icon: 'local_pharmacy',
      color: 'text-tertiary',
    },
    {
      name: '聚宝钱庄',
      sub: '银票典当 · 万贯钱庄',
      desc: '四海钱庄通兑九州，提供大额元宝兑换、离线银钱钱息汇兑及随身乾坤秘库扩容服务。',
      action: '存取银两',
      icon: 'savings',
      color: 'text-primary',
    },
    {
      name: '四方驿',
      sub: '神行遁地 · 九州行旅',
      desc: '八百里加急御风云舆，可瞬间传送至：蜀山剑阁、青丘古刹、东海蓬莱、幽冥魔渊。',
      action: '启程传送',
      icon: 'explore',
      color: 'text-primary-fixed-dim',
    },
    {
      name: '万商集',
      sub: '天宝异宝 · 寄售竞拍',
      desc: '天工坊与万商集市，玩家可自由摆摊售卖极品飞剑、天阶符箓、打造灵材及天外玄铁。',
      action: '逛摊交易',
      icon: 'storefront',
      color: 'text-tertiary-fixed',
    },
    {
      name: '长乐广场',
      sub: '仙侠雅集 · 篝火豪饮',
      desc: '广场中央青铜巨鼎灵火不熄，在此打坐可获得每秒双倍修为，每晚八点开启全服篝火宴！',
      action: '参与聚会',
      icon: 'festival',
      color: 'text-primary',
      isSquare: true,
    },
    {
      name: '城主府',
      sub: '除魔令状 · 皇榜悬赏',
      desc: '天衡州总督颁发全境通缉除魔令，剿灭黑水玄蛇与万妖岭匪修，可领万两赏银与功勋。',
      action: '揭榜受命',
      icon: 'shield',
      color: 'text-secondary',
    },
    {
      name: '演武场',
      sub: '太极擂台 · 论剑问道',
      desc: '天阶试炼论剑天梯，支持1v1插旗切磋、3v3问道争锋，胜者可登临长乐城英雄榜。',
      action: '拔剑登台',
      icon: 'sports_martial_arts',
      color: 'text-primary-fixed',
    },
    {
      name: '听雨梨园',
      sub: '丝竹雅韵 · 结缘品茗',
      desc: '古筝悠扬，白居易评弹仙史。可在此抚琴赏曲，寻访云游四方的各派绝世隐士入队。',
      action: '入席品茗',
      icon: 'nightlife',
      color: 'text-tertiary',
    },
  ];

  return (
    <div className="flex flex-col w-full text-on-surface select-none pb-2">
      <TopSceneHeader onMailClick={() => onShowNotice('正在打开飞鸽传书秘录...')} />

      <section className="grid grid-cols-12 gap-space-xs mx-space-md mt-space-xs h-[325px] sm:h-[345px] min-h-0">
        {/* 左侧角色基础信息 (原型样式) */}
        <CharacterPanel
          onOpenPlayerModal={onOpenPlayerModal}
          onShowNotice={onShowNotice}
        />

        {/* 右侧：城内设施面板 8宫格 */}
        <div className="col-span-7 h-full min-h-0 flex flex-col rounded bg-surface-container-low p-space-xs shadow-md justify-between border border-outline-variant/30">
          <div className="flex items-center justify-between px-space-xs pb-1 border-b border-surface-container-highest">
            <span className="text-primary font-headline-sm text-[12px] tracking-widest font-bold">
              城 内 设 施
            </span>
            <span className="text-[9px] font-label-sm text-tertiary">主城安全区</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 flex-1 min-h-0 overflow-y-auto my-1 pr-0.5">
            {facilities.map((fac) => (
              <button
                key={fac.name}
                type="button"
                onClick={() => {
                  if (fac.isSquare) {
                    navigate('/square');
                  } else {
                    onOpenFacility(fac);
                  }
                }}
                className="flex flex-row items-center gap-2 p-1.5 rounded bg-surface-container hover:bg-surface-container-high active:scale-95 transition-all text-left shadow-sm"
              >
                <div
                  className={`w-7 h-7 rounded-full bg-surface-container-highest flex items-center justify-center ${fac.color} flex-shrink-0 shadow-inner`}
                >
                  <span className="material-symbols-outlined text-[18px]">{fac.icon}</span>
                </div>
                <div className="flex flex-col items-start min-w-0">
                  <span className="text-[11px] font-headline-sm text-on-surface font-semibold truncate">
                    {fac.name}
                  </span>
                  <span className="text-[9px] font-label-sm text-on-surface-variant truncate">
                    {fac.sub.split(' · ')[1] || fac.sub}
                  </span>
                </div>
              </button>
            ))}
          </div>
          <div className="text-center pt-1 border-t border-surface-container-highest">
            <span className="text-[8px] font-label-sm text-on-surface-variant">
              「城内安全区」
            </span>
          </div>
        </div>
      </section>

      <MainTabNavigation activeTab="facility" />
      <PartyStatusBar onShowNotice={onShowNotice} onOpenProfile={onOpenPlayerModal} />
      <GlobalChatSection onShowNotice={onShowNotice} />
    </div>
  );
};
