import React, { useState, useEffect, useCallback } from 'react';
import { gameApi } from '../services/api';
import { usePlayerStore } from '../store/usePlayerStore';
import {
  PharmacyInfoResponse,
  PharmacyGood,
  AlchemyRecipe,
  PharmacyPartyMember,
} from '../types/pharmacy';

interface PharmacyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowNotice: (msg: string) => void;
}

type TabType = 'HEAL' | 'BUY' | 'CRAFT';

export const PharmacyModal: React.FC<PharmacyModalProps> = ({
  isOpen,
  onClose,
  onShowNotice,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('HEAL');
  const [healingLoading, setHealingLoading] = useState<boolean>(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [info, setInfo] = useState<PharmacyInfoResponse | null>(null);
  const [buyCounts, setBuyCounts] = useState<Record<string, number>>({});
  const [craftCounts, setCraftCounts] = useState<Record<string, number>>({});
  const [healSuccessAnim, setHealSuccessAnim] = useState<boolean>(false);

  const player = usePlayerStore((s) => s.player);
  const fetchProfile = usePlayerStore((s) => s.fetchProfile);
  const fetchInventory = usePlayerStore((s) => s.fetchInventory);
  const setBagModalOpen = usePlayerStore((s) => s.setBagModalOpen);

  // 加载悬壶馆详细数据
  const loadPharmacyData = useCallback(async () => {
    try {
      const data = await gameApi.getPharmacyInfo();
      setInfo(data);
    } catch (err: unknown) {
      onShowNotice(err instanceof Error ? err.message : '获取悬壶馆信息失败');
    }
  }, [onShowNotice]);

  useEffect(() => {
    if (isOpen) {
      loadPharmacyData();
    } else {
      setHealSuccessAnim(false);
    }
  }, [isOpen, loadPharmacyData]);

  if (!isOpen) return null;

  // 1. 全队回春疗伤
  const handleHealParty = async () => {
    if (healingLoading) return;
    setHealingLoading(true);
    try {
      const res = await gameApi.healParty();
      if (res.success) {
        setHealSuccessAnim(true);
        setTimeout(() => setHealSuccessAnim(false), 2000);
        onShowNotice(res.message);
        await Promise.allSettled([fetchProfile(), fetchInventory(), loadPharmacyData()]);
      } else {
        onShowNotice(res.message);
      }
    } catch (err: unknown) {
      onShowNotice(err instanceof Error ? err.message : '疗伤失败');
    } finally {
      setHealingLoading(false);
    }
  };

  // 2. 购入丹药
  const handleBuy = async (good: PharmacyGood) => {
    const count = buyCounts[good.itemId] || 1;
    if (actionLoadingId) return;
    setActionLoadingId(`buy_${good.itemId}`);
    try {
      const res = await gameApi.buyPharmacyMedicine(good.itemId, count);
      onShowNotice(res.message);
      await Promise.allSettled([fetchProfile(), fetchInventory(), loadPharmacyData()]);
      setBuyCounts((prev) => ({ ...prev, [good.itemId]: 1 }));
    } catch (err: unknown) {
      onShowNotice(err instanceof Error ? err.message : '购买失败');
    } finally {
      setActionLoadingId(null);
    }
  };

  // 3. 丹药炼制
  const handleCraft = async (recipe: AlchemyRecipe) => {
    const count = craftCounts[recipe.id] || 1;
    if (actionLoadingId) return;
    setActionLoadingId(`craft_${recipe.id}`);
    try {
      const res = await gameApi.craftPharmacyMedicine(recipe.id, count);
      onShowNotice(res.message);
      await Promise.allSettled([fetchProfile(), fetchInventory(), loadPharmacyData()]);
      setCraftCounts((prev) => ({ ...prev, [recipe.id]: 1 }));
    } catch (err: unknown) {
      onShowNotice(err instanceof Error ? err.message : '炼制失败');
    } finally {
      setActionLoadingId(null);
    }
  };

  // 增减计数助手
  const updateCount = (
    type: 'BUY' | 'CRAFT',
    id: string,
    delta: number
  ) => {
    if (type === 'BUY') {
      const cur = buyCounts[id] || 1;
      const next = Math.max(1, Math.min(99, cur + delta));
      setBuyCounts((prev) => ({ ...prev, [id]: next }));
    } else {
      const cur = craftCounts[id] || 1;
      const next = Math.max(1, Math.min(20, cur + delta));
      setCraftCounts((prev) => ({ ...prev, [id]: next }));
    }
  };

  const currentPlayer = info?.player || {
    nickname: player?.nickname || '道友',
    realm: player?.realm || '金丹圆满',
    level: player?.level || 1,
    hp: player?.hp || 0,
    maxHp: player?.maxHp || 1,
    mp: player?.mp || 0,
    maxMp: player?.maxMp || 1,
    copper: player?.copper || 0,
    silver: player?.silver || 0,
  };

  const hpPercent = Math.min(100, Math.max(0, Math.round((currentPlayer.hp / (currentPlayer.maxHp || 1)) * 100)));
  const mpPercent = Math.min(100, Math.max(0, Math.round((currentPlayer.mp / (currentPlayer.maxMp || 1)) * 100)));
  const isPlayerFull = currentPlayer.hp >= currentPlayer.maxHp && currentPlayer.mp >= currentPlayer.maxMp;
  const canAffordHeal = currentPlayer.copper >= (info?.healCost || 100);

  const getQualityBadge = (quality: string) => {
    switch (quality) {
      case 'LEGENDARY':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">绝品</span>;
      case 'EPIC':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">极品</span>;
      case 'RARE':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">灵品</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">凡品</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 select-none animate-fade-in font-serif">
      <div className="w-full max-w-md max-h-[92vh] flex flex-col rounded-lg bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 border border-emerald-600/40 shadow-2xl overflow-hidden relative text-slate-100">
        {/* 背景金木灵韵光晕 */}
        <div className="absolute -top-24 -left-24 w-60 h-60 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-60 h-60 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-emerald-800/40 bg-slate-900/90 relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-600 to-teal-800 flex items-center justify-center shadow-md border border-emerald-400/50">
              <span className="material-symbols-outlined text-white text-[19px]">local_pharmacy</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[17px] font-bold text-emerald-300 tracking-wider">悬 壶 馆</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-700/60 font-mono">
                  城内医馆 · 安全区
                </span>
              </div>
              <p className="text-[10px] text-slate-400 tracking-wide font-sans">
                回春疗伤 · 丹药炼制 · 妙手回春
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 铜钱展示 */}
            <div
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800/80 border border-amber-600/30 text-[11px] text-amber-300 font-mono"
              title="当前随身铜钱"
            >
              <span>🪙</span>
              <span>{currentPlayer.copper.toLocaleString()}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded hover:bg-slate-800 active:scale-95 flex items-center justify-center text-slate-400 hover:text-white transition-all"
            >
              <span className="material-symbols-outlined text-[19px]">close</span>
            </button>
          </div>
        </div>

        {/* 导航标签卡 */}
        <div className="flex border-b border-slate-800 bg-slate-950/70 text-[12px] font-bold tracking-wider relative z-10">
          <button
            type="button"
            onClick={() => setActiveTab('HEAL')}
            className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 transition-all border-b-2 ${
              activeTab === 'HEAL'
                ? 'border-emerald-400 text-emerald-300 bg-emerald-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">healing</span>
            <span>回春疗伤</span>
            {!isPlayerFull && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('BUY')}
            className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 transition-all border-b-2 ${
              activeTab === 'BUY'
                ? 'border-amber-400 text-amber-300 bg-amber-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">medication</span>
            <span>百草购药</span>
            <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300">天阶</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('CRAFT')}
            className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 transition-all border-b-2 ${
              activeTab === 'CRAFT'
                ? 'border-purple-400 text-purple-300 bg-purple-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">science</span>
            <span>丹药炼制</span>
          </button>
        </div>

        {/* 内容滚动视口 */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-3 relative z-10">
          {/* TAB 1: 药王坐镇 · 全队回春疗伤 */}
          {activeTab === 'HEAL' && (
            <div className="space-y-3.5">
              {/* 药王形象与叙意气泡 */}
              <div className="p-3 rounded-lg bg-gradient-to-r from-emerald-950/40 to-slate-900 border border-emerald-700/40 flex items-start gap-3 shadow-inner">
                <div className="w-12 h-12 rounded-full bg-emerald-900/60 border border-emerald-400/50 flex-shrink-0 flex items-center justify-center overflow-hidden shadow">
                  <img
                    src="/assets/combat/characters/hero_xuanmen_shushi_trans.png"
                    alt="药王孙真人"
                    className="w-full h-full object-contain p-0.5"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <span className="material-symbols-outlined text-emerald-300 text-[26px]">medical_services</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="font-bold text-[13px] text-emerald-300">药王孙真人</span>
                    <span className="text-[10px] text-emerald-400/80 bg-emerald-950 px-1.5 py-0.2 rounded border border-emerald-800">
                      悬壶济世 · 药圣
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                    {info?.facility?.doctor?.dialogue ||
                      '凡胎肉身，历经苦战难免经脉受阻、气血匮乏。老夫引太乙神针，须臾便教道友全队神清气爽、精血重铸。'}
                  </p>
                </div>
              </div>

              {/* 出战队伍与全队状态 */}
              <div className="rounded-lg bg-slate-950/60 p-3 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <span className="text-emerald-400 font-bold text-[12px]">出战队伍状态</span>
                    <span className="text-[10px] text-slate-400 font-sans">
                      ({info?.party?.length || 1} 人结阵同行)
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    气血 / 真气实时监测
                  </span>
                </div>

                {/* 主角当前精气神仪表板 */}
                <div className={`p-2.5 rounded bg-slate-900/80 border ${healSuccessAnim ? 'border-emerald-400 ring-2 ring-emerald-500/30' : 'border-slate-800'} transition-all`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-slate-800 border border-emerald-500/40 flex items-center justify-center text-xs font-bold text-emerald-300">
                        阵
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-[12px] text-slate-100">{currentPlayer.nickname}</span>
                          <span className="text-[10px] text-emerald-400 font-sans">{currentPlayer.realm}</span>
                        </div>
                        <span className="text-[9px] text-slate-400 font-mono">Lv.{currentPlayer.level} 阵眼队长</span>
                      </div>
                    </div>
                    {isPlayerFull ? (
                      <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                        气血充盈
                      </span>
                    ) : (
                      <span className="text-[10px] text-rose-400 flex items-center gap-0.5 animate-pulse">
                        <span className="material-symbols-outlined text-[14px]">warning</span>
                        力战负伤
                      </span>
                    )}
                  </div>

                  {/* 气血条 */}
                  <div className="space-y-1 mb-2">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-rose-400 font-bold">气血 (HP)</span>
                      <span className="text-slate-300">
                        {currentPlayer.hp.toLocaleString()} / {currentPlayer.maxHp.toLocaleString()} ({hpPercent}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden relative">
                      <div
                        className={`h-full transition-all duration-700 ${
                          hpPercent < 30 ? 'bg-rose-600' : hpPercent < 70 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${hpPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* 内力条 */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-sky-400 font-bold">真气 (MP)</span>
                      <span className="text-slate-300">
                        {currentPlayer.mp.toLocaleString()} / {currentPlayer.maxMp.toLocaleString()} ({mpPercent}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden relative">
                      <div
                        className="h-full bg-sky-500 transition-all duration-700"
                        style={{ width: `${mpPercent}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* 随行伙伴列表 */}
                {info?.party && info.party.length > 1 && (
                  <div className="grid grid-cols-3 gap-1.5 pt-1">
                    {info.party.slice(1).map((comp: PharmacyPartyMember) => (
                      <div
                        key={comp.id}
                        className="p-1.5 rounded bg-slate-900/60 border border-slate-800 flex items-center gap-2"
                      >
                        <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 overflow-hidden flex-shrink-0 flex items-center justify-center">
                          {comp.avatar ? (
                            <img src={comp.avatar} alt={comp.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[10px] font-bold text-slate-300">{comp.name.slice(0, 1)}</span>
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[10px] font-bold text-slate-200 truncate">{comp.name}</span>
                          <span className="text-[8px] text-emerald-400/90 truncate font-sans">
                            {isPlayerFull ? '气血圆满' : '随队受治'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 疗伤操作区 */}
              <div className="p-3.5 rounded-lg bg-gradient-to-b from-emerald-950/30 to-slate-900/60 border border-emerald-600/30 flex flex-col items-center text-center space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-center gap-1.5 text-[12px] text-slate-300">
                    <span>回春诊费：</span>
                    <span className="font-mono font-bold text-amber-300 text-[14px]">
                      🪙 {info?.healCost || 100} 铜钱
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-sans">
                    药王孙真人亲施太乙生肌神诀，全队气血与内力将瞬间恢复至 100% 满额状态。
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleHealParty}
                  disabled={healingLoading || isPlayerFull || !canAffordHeal}
                  className={`w-full py-2.5 rounded font-bold text-sm tracking-widest shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    isPlayerFull
                      ? 'bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700'
                      : !canAffordHeal
                      ? 'bg-rose-950/80 text-rose-300 border border-rose-800 cursor-not-allowed'
                      : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border border-emerald-400 shadow-emerald-900/50 active:scale-95'
                  }`}
                >
                  {healingLoading ? (
                    <>
                      <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                      <span>孙真人施针运功中...</span>
                    </>
                  ) : isPlayerFull ? (
                    <>
                      <span className="material-symbols-outlined text-[18px] text-emerald-400">task_alt</span>
                      <span>全队气血内力充盈 · 无需疗伤</span>
                    </>
                  ) : !canAffordHeal ? (
                    <>
                      <span className="material-symbols-outlined text-[18px]">block</span>
                      <span>铜钱不足 (需 {info?.healCost || 100} 铜钱)</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">vital_signs</span>
                      <span>一键回春疗伤 · 恢复全队</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: 百草购药 (天阶金创药、洗髓丹等) */}
          {activeTab === 'BUY' && (
            <div className="space-y-2.5">
              <div className="px-1 flex items-center justify-between text-[11px] text-slate-400 font-sans">
                <span>馆藏丹药：选购即时存入乾坤行囊</span>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    setBagModalOpen(true);
                  }}
                  className="text-emerald-400 hover:underline flex items-center gap-0.5 text-[11px]"
                >
                  <span className="material-symbols-outlined text-[13px]">backpack</span>
                  <span>查看乾坤行囊</span>
                </button>
              </div>

              {info?.goods && info.goods.length > 0 ? (
                info.goods.map((good: PharmacyGood) => {
                  const count = buyCounts[good.itemId] || 1;
                  const totalCost = good.priceCopper * count;
                  const canAfford = currentPlayer.copper >= totalCost;
                  const isOperating = actionLoadingId === `buy_${good.itemId}`;

                  return (
                    <div
                      key={good.itemId}
                      className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 hover:border-emerald-700/50 transition-all flex flex-col gap-2 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-300 shadow-inner flex-shrink-0">
                            <span className="material-symbols-outlined text-[20px]">{good.icon || 'medication'}</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-[13px] text-slate-100">{good.name}</span>
                              {getQualityBadge(good.quality)}
                            </div>
                            <span className="text-[10px] text-slate-400 block font-sans mt-0.5">
                              {good.effectDesc}
                            </span>
                          </div>
                        </div>

                        <div className="text-right flex-shrink-0">
                          <span className="text-[12px] font-mono font-bold text-amber-300 block">
                            🪙 {good.priceCopper}
                          </span>
                          <span className="text-[9px] text-slate-500 font-sans">单价/文</span>
                        </div>
                      </div>

                      <div className="p-1.5 rounded bg-slate-950/70 text-[10px] text-slate-400 leading-relaxed font-sans">
                        {good.description}
                      </div>

                      {/* 购买计数器与按钮 */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-850">
                        <div className="flex items-center gap-1 bg-slate-950 rounded px-1.5 py-0.5 border border-slate-800">
                          <button
                            type="button"
                            onClick={() => updateCount('BUY', good.itemId, -1)}
                            className="w-5 h-5 rounded hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
                          >
                            -
                          </button>
                          <span className="w-7 text-center font-mono text-[11px] text-slate-200">
                            {count}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCount('BUY', good.itemId, 1)}
                            className="w-5 h-5 rounded hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
                          >
                            +
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-slate-300">
                            总计: <span className="font-bold text-amber-300">🪙 {totalCost.toLocaleString()}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleBuy(good)}
                            disabled={isOperating || !canAfford}
                            className={`px-3 py-1 rounded text-[11px] font-bold tracking-wider transition-all flex items-center gap-1 ${
                              !canAfford
                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                : 'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white shadow active:scale-95 cursor-pointer'
                            }`}
                          >
                            {isOperating ? (
                              <span className="material-symbols-outlined text-[13px] animate-spin">
                                progress_activity
                              </span>
                            ) : (
                              <span className="material-symbols-outlined text-[13px]">shopping_bag</span>
                            )}
                            <span>{canAfford ? '购入' : '铜钱不足'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-8 text-center text-slate-500 text-xs font-sans">
                  正在盘点悬壶药阁名品库存...
                </div>
              )}
            </div>
          )}

          {/* TAB 3: 神农药鼎 · 丹药炼制 */}
          {activeTab === 'CRAFT' && (
            <div className="space-y-3">
              {/* 丹炉横幅与三昧真火特效 */}
              <div className="p-3.5 rounded-lg bg-gradient-to-r from-purple-950/40 via-slate-900 to-slate-950 border border-purple-700/40 flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-purple-900/40 border border-purple-400/50 flex items-center justify-center shadow-inner text-purple-300 flex-shrink-0 animate-pulse">
                  <span className="material-symbols-outlined text-[28px]">local_fire_department</span>
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-[13px] text-purple-300">紫金八卦丹炉</span>
                    <span className="text-[10px] text-purple-400 bg-purple-950 px-1.5 py-0.2 rounded border border-purple-800 font-sans">
                      三昧真火 · 九转飞升
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-sans mt-0.5 leading-relaxed">
                    丹火长明不熄。道友可投入铜钱引天地灵脉，直接开炉淬炼高阶救命宝丹。
                  </p>
                </div>
              </div>

              {/* 丹方炼制清单 */}
              <div className="space-y-2.5">
                {info?.recipes && info.recipes.length > 0 ? (
                  info.recipes.map((recipe: AlchemyRecipe) => {
                    const count = craftCounts[recipe.id] || 1;
                    const totalCopper = recipe.costCopper * count;
                    const totalExp = recipe.costExp * count;
                    const canAfford = currentPlayer.copper >= totalCopper;
                    const isOperating = actionLoadingId === `craft_${recipe.id}`;

                    return (
                      <div
                        key={recipe.id}
                        className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 hover:border-purple-600/50 transition-all flex flex-col gap-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-purple-300 flex-shrink-0">
                              <span className="material-symbols-outlined text-[18px]">
                                {recipe.icon || 'science'}
                              </span>
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-[12px] text-slate-100">{recipe.name}</span>
                                {getQualityBadge(recipe.quality)}
                              </div>
                              <span className="text-[10px] text-slate-400 block font-sans">
                                产出：【{recipe.outputItemName}】×{recipe.outputCount * count}
                              </span>
                            </div>
                          </div>

                          <div className="text-right text-[10px] font-mono">
                            <span className="text-amber-300 font-bold block">🪙 {totalCopper} 铜钱</span>
                            {totalExp > 0 && (
                              <span className="text-sky-300 block">✨ {totalExp} 修为</span>
                            )}
                          </div>
                        </div>

                        <div className="p-1.5 rounded bg-slate-950/70 text-[10px] text-slate-400 leading-relaxed font-sans">
                          {recipe.description}
                        </div>

                        {/* 炼制计数器与开炉按钮 */}
                        <div className="flex items-center justify-between pt-1 border-t border-slate-850">
                          <div className="flex items-center gap-1 bg-slate-950 rounded px-1.5 py-0.5 border border-slate-800">
                            <button
                              type="button"
                              onClick={() => updateCount('CRAFT', recipe.id, -1)}
                              className="w-5 h-5 rounded hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
                            >
                              -
                            </button>
                            <span className="w-7 text-center font-mono text-[11px] text-slate-200">
                              {count}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateCount('CRAFT', recipe.id, 1)}
                              className="w-5 h-5 rounded hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
                            >
                              +
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleCraft(recipe)}
                            disabled={isOperating || !canAfford}
                            className={`px-3.5 py-1 rounded text-[11px] font-bold tracking-wider transition-all flex items-center gap-1.5 ${
                              !canAfford
                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow active:scale-95 cursor-pointer'
                            }`}
                          >
                            {isOperating ? (
                              <>
                                <span className="material-symbols-outlined text-[13px] animate-spin">
                                  progress_activity
                                </span>
                                <span>起鼎引火中...</span>
                              </>
                            ) : (
                              <>
                                <span className="material-symbols-outlined text-[13px]">mode_heat</span>
                                <span>开炉炼制</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-8 text-center text-slate-500 text-xs font-sans">
                    正在点燃八卦炉三昧真火...
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮区 */}
        <div className="px-4 py-2.5 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-[11px] text-slate-400 relative z-10">
          <span className="font-sans text-[10px]">「长乐城药圣重地 · 医馆安全区」</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-sans transition-all active:scale-95"
          >
            返回街市
          </button>
        </div>
      </div>
    </div>
  );
};
