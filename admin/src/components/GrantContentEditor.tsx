import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CompanionTemplateItem,
  GrantItemType,
  ItemTemplateItem,
} from '../types';
import {
  Check,
  ChevronDown,
  Coins,
  Package,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UserPlus,
} from 'lucide-react';

/**
 * 后台通用「发放内容」编辑器。
 *
 * 从系统发放页 (/grants) 抽离，支持：
 * - 道具 / 角色 / 货币三类发放项；
 * - 多发放项添加、删除；
 * - 道具库搜索、品质与类型展示；
 * - 角色等级/境界；
 * - 货币数量。
 *
 * 道具、角色、货币三类发放项共用同一套编辑与校验交互；
 * 默认全部开放，个别场景可通过 allowedTypes 收窄。
 */

export interface GrantDraft {
  uid: string;
  type: GrantItemType;
  // ITEM
  itemId: string;
  count: number;
  // COMPANION
  memberKey: string;
  level: number;
  realm: string;
  // CURRENCY
  silver: number;
  ingot: number;
  copper: number;
}

export interface GrantCatalogData {
  items: ItemTemplateItem[];
  companions: CompanionTemplateItem[];
}

export interface GrantContentEditorProps {
  drafts: GrantDraft[];
  onChange: (drafts: GrantDraft[]) => void;
  catalog: GrantCatalogData;
  /** 允许的发放类型；默认道具 / 角色 / 货币全部开放 */
  allowedTypes?: GrantItemType[];
  /** 最少保留几项；允许空发放内容时传 0 */
  minItems?: number;
  title?: string;
  hint?: string;
  step?: string;
  addLabel?: string;
  emptyText?: string;
  notice?: React.ReactNode;
  footerNote?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  /** 是否禁止重复选择同一道具；系统发放默认保持原行为 */
  preventDuplicateItems?: boolean;
}

const ITEM_TYPE_LABEL: Record<string, string> = {
  CONSUMABLE: '丹药 / 消耗品',
  EQUIPMENT: '装备',
  MATERIAL: '材料',
  SPECIAL: '符箓 / 特殊',
  SKILL_BOOK: '功法秘籍',
};

const QUALITY_LABEL: Record<string, string> = {
  COMMON: '凡品',
  RARE: '灵品',
  EPIC: '地阶',
  LEGENDARY: '天阶',
  MYTHIC: '神品',
};

const QUALITY_STYLE: Record<string, string> = {
  COMMON: 'bg-slate-700/60 text-slate-200 border-slate-600',
  RARE: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  EPIC: 'bg-violet-500/15 text-violet-300 border-violet-500/40',
  LEGENDARY: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  MYTHIC: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
};

const ROLE_LABEL: Record<string, string> = {
  DPS: '输出',
  HEALER: '治疗',
  TANK: '承伤',
};

const GRANT_TYPE_META: Array<{
  type: GrantItemType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  desc: string;
}> = [
  { type: 'ITEM', label: '道具', icon: Package, desc: '从道具库选择名称与数量' },
  { type: 'COMPANION', label: '角色', icon: UserPlus, desc: '从 NPC 模板库选择人物并设置等级' },
  { type: 'CURRENCY', label: '货币', icon: Coins, desc: '发放纹银 / 元宝 / 铜钱' },
];

let draftSeq = 0;

export const createGrantDraft = (type: GrantItemType = 'ITEM'): GrantDraft => ({
  uid: `grant_draft_${Date.now()}_${++draftSeq}`,
  type,
  itemId: '',
  count: 1,
  memberKey: '',
  level: 1,
  realm: '',
  silver: 0,
  ingot: 0,
  copper: 0,
});

/* -------------------------------------------------------------------------- */
/* 道具搜索选择器                                                              */
/* -------------------------------------------------------------------------- */

interface ItemPickerProps {
  value: string;
  items: ItemTemplateItem[];
  onChange: (itemId: string) => void;
}

const ItemPicker: React.FC<ItemPickerProps> = ({ value, items, onChange }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => items.find((item) => item.id === value) || null,
    [items, value]
  );

  useEffect(() => {
    if (!open) return;

    const handleOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    window.requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  const filteredItems = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) => {
      return (
        item.name.toLowerCase().includes(keyword) ||
        item.id.toLowerCase().includes(keyword) ||
        (item.description || '').toLowerCase().includes(keyword)
      );
    });
  }, [items, query]);

  return (
    <div ref={rootRef} className="relative mt-1">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full px-3 py-2 bg-[#090d14] border border-slate-700/80 rounded-xl text-xs text-left flex items-center justify-between gap-2 focus:outline-none focus:border-amber-400 transition"
      >
        <span className={`truncate ${selected ? 'text-slate-200' : 'text-slate-500'}`}>
          {selected?.name || value || '请选择道具...'}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-500 flex-shrink-0 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {selected && (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
          <span
            className={`px-1.5 py-0.5 rounded border ${
              QUALITY_STYLE[selected.quality || 'COMMON'] || QUALITY_STYLE.COMMON
            }`}
          >
            {QUALITY_LABEL[selected.quality || 'COMMON'] || selected.quality}
          </span>
          <span className="font-mono text-slate-500">{selected.id}</span>
          <span className="text-slate-500">{selected.description || '暂无说明'}</span>
        </div>
      )}

      {open && (
        <div className="absolute z-40 mt-1 w-full rounded-xl border border-slate-700 bg-[#0b1018] shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-slate-800">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索道具名称 / ID..."
                className="w-full pl-8 pr-2 py-1.5 bg-[#090d14] border border-slate-700/80 rounded-lg text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto p-1">
            {filteredItems.length === 0 ? (
              <div className="px-3 py-6 text-center text-[11px] text-slate-500">
                {items.length === 0 ? '道具库暂无数据' : '没有匹配的道具'}
              </div>
            ) : (
              filteredItems.map((item) => {
                const active = item.id === value;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onChange(item.id);
                      setOpen(false);
                    }}
                    className={`w-full flex items-start justify-between gap-2 px-2.5 py-2 rounded-lg text-left transition ${
                      active
                        ? 'bg-amber-500/10 border border-amber-500/30'
                        : 'border border-transparent hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-200 truncate">
                          {item.name}
                        </span>
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded border ${
                            QUALITY_STYLE[item.quality || 'COMMON'] || QUALITY_STYLE.COMMON
                          }`}
                        >
                          {QUALITY_LABEL[item.quality || 'COMMON'] || item.quality}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">
                        <span className="font-mono">{item.id}</span>
                        <span className="mx-1">·</span>
                        {ITEM_TYPE_LABEL[item.type || 'MATERIAL'] || item.type}
                      </div>
                    </div>
                    {active && <Check className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 发放内容编辑器                                                              */
/* -------------------------------------------------------------------------- */

export const GrantContentEditor: React.FC<GrantContentEditorProps> = ({
  drafts,
  onChange,
  catalog,
  allowedTypes = ['ITEM', 'COMPANION', 'CURRENCY'],
  minItems = 1,
  title = '发放内容',
  hint,
  step,
  addLabel,
  emptyText,
  notice,
  footerNote,
  icon: HeaderIcon = Sparkles,
  preventDuplicateItems = false,
}) => {
  const companionMap = useMemo(
    () => new Map(catalog.companions.map((companion) => [companion.member_key, companion])),
    [catalog.companions]
  );

  const allowedMeta = GRANT_TYPE_META.filter((meta) => allowedTypes.includes(meta.type));
  const typeLabels = allowedMeta.map((meta) => meta.label).join(' / ');
  const resolvedAddLabel =
    addLabel ||
    (allowedTypes.length === 1 ? `添加${typeLabels}` : `添加发放项（${typeLabels}）`);
  const itemDraftCount = drafts.filter((draft) => draft.type === 'ITEM' && draft.itemId).length;

  // 选择仍然可用的第一种类型作为新增项的默认类型：
  // 例如道具已被“禁止重复”耗尽时，新增项自动落到角色或货币。
  const availableTypes = allowedTypes.filter((type) => {
    if (type === 'ITEM') {
      return (
        catalog.items.length > 0 &&
        (!preventDuplicateItems || itemDraftCount < catalog.items.length)
      );
    }
    if (type === 'COMPANION') return catalog.companions.length > 0;
    return true;
  });
  const defaultType: GrantItemType = availableTypes[0] || allowedTypes[0] || 'ITEM';
  const canRemove = drafts.length > minItems;
  const addDisabled = availableTypes.length === 0;

  const updateDraft = (uid: string, patch: Partial<GrantDraft>) => {
    onChange(drafts.map((draft) => (draft.uid === uid ? { ...draft, ...patch } : draft)));
  };

  const handleTypeChange = (draft: GrantDraft, type: GrantItemType) => {
    if (type === 'ITEM') {
      const usedItemIds = new Set(
        drafts
          .filter((item) => item.uid !== draft.uid && item.type === 'ITEM' && item.itemId)
          .map((item) => item.itemId)
      );
      const firstAvailable = preventDuplicateItems
        ? catalog.items.find((item) => !usedItemIds.has(item.id))
        : catalog.items[0];

      updateDraft(draft.uid, {
        type,
        itemId: draft.itemId || firstAvailable?.id || '',
        count: draft.count || 1,
      });
      return;
    }

    if (type === 'COMPANION') {
      const first = catalog.companions[0];
      updateDraft(draft.uid, {
        type,
        memberKey: draft.memberKey || first?.member_key || '',
        level: draft.memberKey ? draft.level : 1,
        realm: draft.memberKey ? draft.realm : '',
      });
      return;
    }

    updateDraft(draft.uid, { type });
  };

  const handleAdd = () => {
    if (addDisabled) return;

    const draft = createGrantDraft(defaultType);
    if (defaultType === 'ITEM') {
      const usedItemIds = new Set(
        drafts.filter((item) => item.type === 'ITEM' && item.itemId).map((item) => item.itemId)
      );
      const firstAvailable = preventDuplicateItems
        ? catalog.items.find((item) => !usedItemIds.has(item.id))
        : catalog.items[0];
      draft.itemId = firstAvailable?.id || '';
    }
    if (defaultType === 'COMPANION') {
      draft.memberKey = catalog.companions[0]?.member_key || '';
    }
    onChange([...drafts, draft]);
  };

  return (
    <section className="bg-[#121722] border border-slate-800 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <HeaderIcon className="w-4 h-4 text-violet-400" />
          {title}
          {hint && (
            <span className="text-[10px] font-normal text-slate-500">{hint}</span>
          )}
        </h3>
        {step && <span className="text-[10px] text-slate-500 font-mono">{step}</span>}
      </div>

      {notice}

      {drafts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-[#0d121b] px-4 py-8 text-center">
          <Package className="w-6 h-6 text-slate-600 mx-auto mb-2" />
          <div className="text-xs text-slate-400">{emptyText || '当前未添加发放内容'}</div>
          <div className="text-[10px] text-slate-600 mt-1">点击下方按钮添加</div>
        </div>
      ) : (
        <div className="space-y-3">
          {drafts.map((draft, index) => {
            const selectedCompanion = companionMap.get(draft.memberKey);

            const otherItemIds = new Set(
              drafts
                .filter(
                  (item) =>
                    item.uid !== draft.uid && item.type === 'ITEM' && item.itemId
                )
                .map((item) => item.itemId)
            );
            const selectableItems = preventDuplicateItems
              ? catalog.items.filter(
                  (item) => item.id === draft.itemId || !otherItemIds.has(item.id)
                )
              : catalog.items;

            return (
              <div
                key={draft.uid}
                className="rounded-2xl border border-slate-800 bg-[#0d121b] p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-slate-800 text-slate-300 text-[10px] flex items-center justify-center font-mono">
                      {String(index + 1).padStart(2, '0')}
                    </span>

                    <div className="flex flex-wrap gap-1.5">
                      {GRANT_TYPE_META.map((meta) => {
                        const Icon = meta.icon;
                        const allowed = allowedTypes.includes(meta.type);
                        return (
                          <button
                            key={meta.type}
                            type="button"
                            disabled={!allowed}
                            title={allowed ? undefined : `当前发放场景不支持${meta.label}`}
                            onClick={() => {
                              if (allowed) handleTypeChange(draft, meta.type);
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[10px] border flex items-center gap-1.5 transition ${
                              draft.type === meta.type
                                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                                : allowed
                                  ? 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                                  : 'bg-slate-900/30 border-slate-800/70 text-slate-600 cursor-not-allowed opacity-50'
                            }`}
                          >
                            <Icon className="w-3 h-3" />
                            {meta.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!canRemove}
                    onClick={() =>
                      onChange(drafts.filter((item) => item.uid !== draft.uid))
                    }
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
                    title={canRemove ? '移除该发放项' : `至少保留 ${minItems} 项`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {draft.type === 'ITEM' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="block md:col-span-2">
                      <span className="text-[10px] text-slate-500">道具名称</span>
                      <ItemPicker
                        value={draft.itemId}
                        items={selectableItems}
                        onChange={(itemId) => updateDraft(draft.uid, { itemId })}
                      />
                    </div>

                    <label className="block">
                      <span className="text-[10px] text-slate-500">发放数量</span>
                      <input
                        type="number"
                        min={1}
                        max={99999}
                        value={draft.count}
                        onChange={(event) =>
                          updateDraft(draft.uid, {
                            count: Math.max(
                              1,
                              Math.min(99999, Math.floor(Number(event.target.value) || 1))
                            ),
                          })
                        }
                        className="mt-1 w-full px-3 py-2 bg-[#090d14] border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                      />
                    </label>
                  </div>
                )}

                {draft.type === 'COMPANION' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <label className="block md:col-span-3">
                        <span className="text-[10px] text-slate-500">NPC / 角色模板</span>
                        <select
                          value={draft.memberKey}
                          onChange={(event) =>
                            updateDraft(draft.uid, {
                              memberKey: event.target.value,
                              level: draft.level || 1,
                              realm: draft.realm || '',
                            })
                          }
                          className="mt-1 w-full px-3 py-2 bg-[#090d14] border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                        >
                          <option value="">请选择角色...</option>
                          {catalog.companions.map((companion) => (
                            <option key={companion.member_key} value={companion.member_key}>
                              {companion.name}（{ROLE_LABEL[companion.role] || companion.role}）
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <span className="text-[10px] text-slate-500">领取等级</span>
                        <input
                          type="number"
                          min={1}
                          max={9999}
                          value={draft.level}
                          onChange={(event) =>
                            updateDraft(draft.uid, {
                              level: Math.max(
                                1,
                                Math.min(9999, Math.floor(Number(event.target.value) || 1))
                              ),
                            })
                          }
                          className="mt-1 w-full px-3 py-2 bg-[#090d14] border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                        />
                      </label>

                      <label className="block md:col-span-2">
                        <span className="text-[10px] text-slate-500">
                          境界（实例级，可留空）
                        </span>
                        <input
                          value={draft.realm}
                          onChange={(event) =>
                            updateDraft(draft.uid, { realm: event.target.value })
                          }
                          placeholder="例如：金丹中期"
                          className="mt-1 w-full px-3 py-2 bg-[#090d14] border border-slate-700/80 rounded-xl text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-400"
                        />
                      </label>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="text-[10px] text-slate-500">
                        角色领取后进入同道名册并保持休息，可在队伍整备中手动上阵
                      </span>

                      {selectedCompanion && (
                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                          {selectedCompanion.avatar && (
                            <img
                              src={selectedCompanion.avatar}
                              alt={selectedCompanion.name}
                              className="w-7 h-7 rounded object-cover border border-slate-700"
                            />
                          )}
                          <span>{selectedCompanion.title || '暂无称号'}</span>
                          <span className="text-slate-600">·</span>
                          <span className="font-mono text-slate-500">
                            1级 HP {selectedCompanion.base_hp ?? '—'} / ATK{' '}
                            {selectedCompanion.base_attack ?? '—'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {draft.type === 'CURRENCY' && (
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { key: 'silver' as const, label: '纹银', color: 'text-slate-300' },
                      { key: 'ingot' as const, label: '元宝', color: 'text-amber-300' },
                      { key: 'copper' as const, label: '铜钱', color: 'text-orange-300' },
                    ].map((currency) => (
                      <label key={currency.key} className="block">
                        <span className={`text-[10px] ${currency.color}`}>
                          {currency.label}
                        </span>
                        <input
                          type="number"
                          min={0}
                          value={draft[currency.key]}
                          onChange={(event) =>
                            updateDraft(draft.uid, {
                              [currency.key]: Math.max(0, Number(event.target.value) || 0),
                            })
                          }
                          className="mt-1 w-full px-3 py-2 bg-[#090d14] border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                        />
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={handleAdd}
        disabled={addDisabled}
        className="w-full py-2.5 rounded-xl border border-dashed border-slate-700 text-slate-400 hover:text-amber-300 hover:border-amber-500/40 hover:bg-amber-500/5 text-xs flex items-center justify-center gap-2 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-slate-700 disabled:hover:text-slate-400 disabled:hover:bg-transparent"
      >
        <Plus className="w-4 h-4" />
        {addDisabled ? '暂无可添加的发放项' : resolvedAddLabel}
      </button>

      {footerNote}
    </section>
  );
};

export default GrantContentEditor;
