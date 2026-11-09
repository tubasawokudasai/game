import React, { useState, useEffect } from 'react';
import { InventoryItem, BagCategory, BagCapacity } from '../types/game';
import { gameApi } from '../services/api';
import { usePlayerStore } from '../store/usePlayerStore';

interface QiankunBagModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowNotice: (msg: string) => void;
}

const QUALITY_COLOR: Record<string, { border: string; bg: string; text: string; badge: string; label: string }> = {
  COMMON: {
    border: 'border-[#94a3b8]/40',
    bg: 'bg-[#94a3b8]/10',
    text: 'text-[#cbd5e1]',
    badge: 'bg-[#64748b]/40 text-[#cbd5e1]',
    label: '凡品',
  },
  RARE: {
    border: 'border-[#34d399]/50',
    bg: 'bg-[#34d399]/10',
    text: 'text-[#6ee7b7]',
    badge: 'bg-[#059669]/40 text-[#a7f3d0]',
    label: '灵品',
  },
  EPIC: {
    border: 'border-[#60a5fa]/60',
    bg: 'bg-[#3b82f6]/15',
    text: 'text-[#93c5fd]',
    badge: 'bg-[#2563eb]/40 text-[#bfdbfe]',
    label: '地阶',
  },
  LEGENDARY: {
    border: 'border-[#c084fc]/70',
    bg: 'bg-[#a855f7]/15',
    text: 'text-[#d8b4fe]',
    badge: 'bg-[#7e22ce]/50 text-[#f3e8ff]',
    label: '天阶',
  },
  MYTHIC: {
    border: 'border-[#fbbf24]/80 shadow-[0_0_10px_rgba(251,191,36,0.25)]',
    bg: 'bg-[#f59e0b]/20',
    text: 'text-[#fde68a]',
    badge: 'bg-[#d97706]/60 text-[#fef3c7]',
    label: '神品',
  },
};

const STAT_NAMES: Record<string, string> = {
  outer_attack: '外功攻击',
  inner_attack: '内功攻击',
  defense: '外防',
  inner_defense: '内御',
  hp: '气血',
  hp_max: '气血上限',
  mp: '真气',
  mp_max: '真气上限',
  mp_regen: '内力恢复',
  speed: '遁速',
  dodge: '闪避',
  crit_rate: '暴击率',
  crit_dmg: '暴击伤害',
  perception: '神识感知',
  shield: '御气护体',
  ice_resist: '玄冰抗性',
  metal_affinity: '庚金亲和',
  wood_affinity: '乙木亲和',
  ice_affinity: '玄冰亲和',
};

const SLOT_LABEL: Record<string, string> = {
  WEAPON: '神兵武器',
  HELMET: '天枢冠冕',
  ARMOR: '护身法袍',
  BOOTS: '遁光云履',
  ARTIFACT: '本命法宝',
};

export const QiankunBagModal: React.FC<QiankunBagModalProps> = ({
  isOpen,
  onClose,
  onShowNotice,
}) => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<BagCategory[]>([]);
  const [capacity, setCapacity] = useState<BagCapacity>({
    total: 50,
    used: 0,
    free: 50,
    isFull: false,
  });
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isOperating, setIsOperating] = useState<boolean>(false);

  const fetchProfile = usePlayerStore((s) => s.fetchProfile);
  const fetchInventory = usePlayerStore((s) => s.fetchInventory);

  const loadBagData = async (cat?: string) => {
    setIsLoading(true);
    try {
      const res = await gameApi.getQiankunBag(cat || activeCategory);
      if (res && res.success) {
        setItems(res.items || []);
        setCategories(res.categories || []);
        if (res.capacity) setCapacity(res.capacity);

        // 若当前选中的物品仍在列表中，同步更新选中态
        if (selectedItem) {
          const updated = (res.items || []).find((i) => i.id === selectedItem.id);
          setSelectedItem(updated || (res.items && res.items.length > 0 ? res.items[0] : null));
        } else if (res.items && res.items.length > 0) {
          setSelectedItem(res.items[0]);
        } else {
          setSelectedItem(null);
        }
      }
    } catch (err: unknown) {
      console.warn('获取乾坤行囊失败:', err);
      onShowNotice(err instanceof Error ? err.message : '查阅乾坤行囊异常');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadBagData('ALL');
      setActiveCategory('ALL');
    }
  }, [isOpen]);

  const handleTabChange = (catCode: string) => {
    setActiveCategory(catCode);
    loadBagData(catCode);
  };

  // 服用/使用物品
  const handleUseItem = async () => {
    if (!selectedItem || isOperating) return;
    setIsOperating(true);
    try {
      const res = await gameApi.useInventoryItem(selectedItem.id, 1);
      onShowNotice(res.message || `已使用【${selectedItem.itemName}】`);
      await Promise.allSettled([loadBagData(), fetchProfile(), fetchInventory()]);
    } catch (err: unknown) {
      onShowNotice(err instanceof Error ? err.message : '使用物品失败');
    } finally {
      setIsOperating(false);
    }
  };

  // 穿戴装备
  const handleEquipItem = async () => {
    if (!selectedItem || isOperating) return;
    setIsOperating(true);
    try {
      const res = await gameApi.equipInventoryItem(selectedItem.id);
      onShowNotice(res.message || `已穿戴【${selectedItem.itemName}】`);
      await Promise.allSettled([loadBagData(), fetchProfile(), fetchInventory()]);
    } catch (err: unknown) {
      onShowNotice(err instanceof Error ? err.message : '穿戴装备失败');
    } finally {
      setIsOperating(false);
    }
  };

  // 卸下装备
  const handleUnequipItem = async () => {
    if (!selectedItem || isOperating) return;
    setIsOperating(true);
    try {
      const res = await gameApi.unequipInventoryItem(selectedItem.id);
      onShowNotice(res.message || `已卸下【${selectedItem.itemName}】`);
      await Promise.allSettled([loadBagData(), fetchProfile(), fetchInventory()]);
    } catch (err: unknown) {
      onShowNotice(err instanceof Error ? err.message : '卸下装备失败');
    } finally {
      setIsOperating(false);
    }
  };

  // 整理行囊
  const handleTidy = async () => {
    if (isOperating) return;
    setIsOperating(true);
    try {
      const res = await gameApi.tidyInventory();
      onShowNotice(res.message || '行囊已理顺堆叠完毕');
      await Promise.allSettled([loadBagData(), fetchInventory()]);
    } catch (err: unknown) {
      onShowNotice(err instanceof Error ? err.message : '整理行囊异常');
    } finally {
      setIsOperating(false);
    }
  };

  // 丢弃物品
  const handleDiscard = async () => {
    if (!selectedItem || isOperating) return;
    if (selectedItem.isEquipped) {
      onShowNotice('已穿戴神兵不可丢弃，请先卸下');
      return;
    }
    if (!confirm(`道友确认要将【${selectedItem.itemName}】舍弃吗？`)) {
      return;
    }
    setIsOperating(true);
    try {
      const res = await gameApi.discardInventoryItem(selectedItem.id, 1);
      onShowNotice(res.message || `已舍弃【${selectedItem.itemName}】`);
      await Promise.allSettled([loadBagData(), fetchInventory()]);
    } catch (err: unknown) {
      onShowNotice(err instanceof Error ? err.message : '丢弃物品失败');
    } finally {
      setIsOperating(false);
    }
  };

  if (!isOpen) return null;

  const currentQuality = selectedItem ? (QUALITY_COLOR[selectedItem.quality] || QUALITY_COLOR.COMMON) : QUALITY_COLOR.COMMON;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 select-none">
      <div className="w-full max-w-lg rounded-xl bg-gradient-to-b from-[#1a2332] via-[#111923] to-[#0b1017] p-3 shadow-2xl border border-primary/30 flex flex-col max-h-[92vh] text-on-surface">
        
        {/* 顶部标题栏与容量显示 */}
        <div className="flex items-center justify-between pb-2 border-b border-outline-variant/30">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-primary/20 flex items-center justify-center text-primary border border-primary/40">
              <span className="material-symbols-outlined text-[18px]">work</span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[14px] font-bold text-primary tracking-wide">乾坤行囊</span>
                <span className="text-[10px] text-tertiary font-serif">· 芥子纳须弥</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-on-surface-variant">
                <span>格数: <strong className="text-primary font-mono">{capacity.used}</strong> / {capacity.total}</span>
                <span className="text-outline-variant/60">|</span>
                <span>余量: <strong className={capacity.free <= 3 ? 'text-[#f87171] font-mono' : 'text-emerald-400 font-mono'}>{capacity.free}</strong></span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleTidy}
              disabled={isOperating}
              className="px-2 py-1 rounded bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/40 text-[11px] text-primary hover:text-primary-container transition-all flex items-center gap-1 active:scale-95 cursor-pointer disabled:opacity-50"
              title="整理堆叠背包中同类道具"
            >
              <span className="material-symbols-outlined text-[13px]">auto_fix_high</span>
              <span>规整</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-surface-container hover:bg-surface-container-highest text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* 动态分类页签导航栏（支持后期任意拓展类型） */}
        <div className="flex items-center gap-1 py-1.5 overflow-x-auto no-scrollbar border-b border-outline-variant/20">
          {categories.map((cat) => {
            const isActive = activeCategory === cat.code;
            return (
              <button
                key={cat.code}
                type="button"
                onClick={() => handleTabChange(cat.code)}
                className={`flex-shrink-0 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all flex items-center gap-1 cursor-pointer ${
                  isActive
                    ? 'bg-primary/20 text-primary border border-primary/50 shadow-sm'
                    : 'bg-surface-container/60 text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                }`}
              >
                <span className="material-symbols-outlined text-[13px]">{cat.icon || 'category'}</span>
                <span>{cat.name}</span>
                {cat.count > 0 && (
                  <span className={`text-[9px] px-1 rounded-full font-mono ${isActive ? 'bg-primary text-black font-bold' : 'bg-surface-container-highest text-on-surface-variant'}`}>
                    {cat.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 主体双栏区域：左侧物品栅格，右侧选定物品鉴赏 */}
        <div className="flex-1 min-h-[300px] max-h-[460px] grid grid-cols-1 sm:grid-cols-12 gap-2 pt-2 overflow-hidden">
          
          {/* 左侧：物品网格列表 */}
          <div className="sm:col-span-7 flex flex-col min-h-0 bg-surface-container-lowest/60 rounded-lg p-1.5 border border-outline-variant/20">
            {isLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant text-[11px] py-12">
                <span className="material-symbols-outlined text-2xl animate-spin text-primary mb-1">cyclone</span>
                <span>感应神识调阅乾坤...</span>
              </div>
            ) : items.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant/60 text-[11px] py-12 text-center">
                <span className="material-symbols-outlined text-3xl mb-1 opacity-40">inventory_2</span>
                <span>此格内空空如也</span>
                <span className="text-[10px] text-tertiary mt-0.5">历练探索或诛妖悬赏可获奇珍</span>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-4 gap-1.5 content-start">
                {items.map((item) => {
                  const qStyle = QUALITY_COLOR[item.quality] || QUALITY_COLOR.COMMON;
                  const isSelected = selectedItem?.id === item.id;

                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className={`relative flex flex-col items-center justify-center p-1 rounded-lg border cursor-pointer transition-all active:scale-95 ${
                        qStyle.bg
                      } ${qStyle.border} ${
                        isSelected
                          ? 'ring-2 ring-primary shadow-md scale-[1.02]'
                          : 'hover:border-primary/60'
                      }`}
                    >
                      {/* 已穿戴角标 */}
                      {item.isEquipped && (
                        <span className="absolute top-0.5 left-0.5 px-1 py-0.2 rounded bg-emerald-600/90 text-[8px] font-bold text-white shadow pointer-events-none scale-90">
                          已配
                        </span>
                      )}

                      {/* 品质小标 */}
                      <span className={`absolute top-0.5 right-0.5 text-[8px] px-0.8 py-0.2 rounded font-serif pointer-events-none ${qStyle.badge}`}>
                        {qStyle.label[0]}
                      </span>

                      {/* 物品图标 */}
                      <div className="w-8 h-8 rounded bg-black/40 flex items-center justify-center my-0.5">
                        <span className={`material-symbols-outlined text-[18px] ${qStyle.text}`}>
                          {item.category === 'EQUIPMENT'
                            ? 'swords'
                            : item.category === 'MEDICINE'
                            ? 'medication'
                            : item.category === 'SPECIAL'
                            ? 'auto_fix_high'
                            : 'diamond'}
                        </span>
                      </div>

                      {/* 物品名称 */}
                      <span className={`text-[10px] truncate max-w-full font-medium ${qStyle.text}`}>
                        {item.itemName}
                      </span>

                      {/* 堆叠数量 */}
                      {item.count > 1 && (
                        <span className="text-[9px] font-mono text-tertiary">
                          x{item.count}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 右侧：物品详录鉴赏卡 */}
          <div className="sm:col-span-5 flex flex-col bg-surface-container/70 rounded-lg p-2.5 border border-outline-variant/30 min-h-0 overflow-y-auto justify-between">
            {selectedItem ? (
              <div className="flex flex-col gap-2">
                {/* 物品品阶头图与名称 */}
                <div className="flex items-start gap-2 pb-2 border-b border-outline-variant/20">
                  <div className={`w-11 h-11 rounded-lg ${currentQuality.bg} border ${currentQuality.border} flex items-center justify-center flex-shrink-0 shadow`}>
                    <span className={`material-symbols-outlined text-[24px] ${currentQuality.text}`}>
                      {selectedItem.category === 'EQUIPMENT'
                        ? 'swords'
                        : selectedItem.category === 'MEDICINE'
                        ? 'medication'
                        : selectedItem.category === 'SPECIAL'
                        ? 'auto_fix_high'
                        : 'diamond'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[13px] font-bold ${currentQuality.text} truncate`}>
                        {selectedItem.itemName}
                      </span>
                      {selectedItem.enhanceLevel > 0 && (
                        <span className="text-[10px] font-mono text-amber-400 font-bold">
                          +{selectedItem.enhanceLevel}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[9px] text-on-surface-variant mt-0.5">
                      <span className={`px-1 py-0.2 rounded ${currentQuality.badge}`}>
                        {currentQuality.label}
                      </span>
                      <span>·</span>
                      <span className="text-tertiary">
                        {selectedItem.slot ? (SLOT_LABEL[selectedItem.slot] || selectedItem.slot) : (selectedItem.categoryName || '天珍')}
                      </span>
                      {selectedItem.count > 1 && (
                        <>
                          <span>·</span>
                          <span className="font-mono text-on-surface">存量 x{selectedItem.count}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* 词条属性展现 */}
                {selectedItem.stats && Object.keys(selectedItem.stats).length > 0 && (
                  <div className="p-1.5 rounded bg-surface-container-lowest/80 border border-outline-variant/20 space-y-0.5 text-[10px]">
                    <div className="text-[9px] font-bold text-primary flex items-center gap-1 pb-0.5 border-b border-outline-variant/20">
                      <span className="material-symbols-outlined text-[11px]">insights</span>
                      <span>法宝道韵属性</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 pt-0.5">
                      {Object.entries(selectedItem.stats).map(([k, v]) => (
                        <div key={k} className="flex justify-between items-center text-[9px]">
                          <span className="text-on-surface-variant">{STAT_NAMES[k] || k}:</span>
                          <span className="text-emerald-400 font-mono font-bold">
                            {typeof v === 'number' && v > 0 && v < 1 ? `+${(v * 100).toFixed(0)}%` : `+${v}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 风物志说明 */}
                <div className="p-1.5 rounded bg-surface-container-lowest/50 border border-outline-variant/15 text-[10px] text-on-surface-variant/90 leading-relaxed font-serif">
                  <div className="text-[9px] font-bold text-tertiary flex items-center gap-1 mb-0.5">
                    <span className="material-symbols-outlined text-[10px]">history_edu</span>
                    <span>风物志记</span>
                  </div>
                  <p>{selectedItem.description || '九州玄秘遗珍，蕴含丝缕天地灵气。'}</p>
                </div>

                {/* 交互按钮区域 */}
                <div className="flex flex-col gap-1.5 pt-1 border-t border-outline-variant/20">
                  {/* 1. 药品/消耗品使用 */}
                  {selectedItem.actions?.canUse && (
                    <button
                      type="button"
                      onClick={handleUseItem}
                      disabled={isOperating}
                      className="w-full py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-[11px] shadow transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[14px]">medication</span>
                      <span>吞服 · 炼化入体</span>
                    </button>
                  )}

                  {/* 2. 装备穿戴 */}
                  {selectedItem.actions?.canEquip && (
                    <button
                      type="button"
                      onClick={handleEquipItem}
                      disabled={isOperating}
                      className="w-full py-1.5 rounded-lg bg-gradient-to-r from-amber-600 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 text-black font-bold text-[11px] shadow transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[14px]">shield</span>
                      <span>佩戴 · 神兵加持</span>
                    </button>
                  )}

                  {/* 3. 装备卸下 */}
                  {selectedItem.actions?.canUnequip && (
                    <button
                      type="button"
                      onClick={handleUnequipItem}
                      disabled={isOperating}
                      className="w-full py-1.5 rounded-lg bg-surface-container-highest hover:bg-surface-container text-on-surface font-bold text-[11px] border border-outline-variant/40 shadow transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[14px]">remove_moderator</span>
                      <span>卸下收归行囊</span>
                    </button>
                  )}

                  {/* 4. 舍弃物品 */}
                  {selectedItem.actions?.canDiscard && (
                    <button
                      type="button"
                      onClick={handleDiscard}
                      disabled={isOperating}
                      className="w-full py-1 rounded text-on-surface-variant/70 hover:text-red-400 text-[10px] transition-colors cursor-pointer flex items-center justify-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[12px]">delete</span>
                      <span>舍弃废置</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant/50 text-[11px] text-center py-8">
                <span className="material-symbols-outlined text-2xl mb-1 opacity-30">touch_app</span>
                <span>请在左侧点选法宝道具</span>
                <span className="text-[10px] opacity-70">可查验词条并进行穿戴与服用</span>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};
