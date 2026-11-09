import React, { useEffect, useMemo, useState } from 'react';
import { Gift, Package, Plus, Swords, Users, X } from 'lucide-react';
import type { ItemTemplateItem, MonsterGroupItem } from '../types';

export interface EncounterRewardItem {
  id: string;
  name: string;
  count: number;
}

export interface EncounterConfigValue {
  battleMode: 'SOLO' | 'GROUP';
  battleGroupId: string;
  battleLevel: number;
  battleMemberLevels: Record<string, number>;
  respawnSeconds: number;
  onceFlag: string;
  rewardExp: number;
  rewardGold: number;
  rewardSilver: number;
  rewardItems: EncounterRewardItem[];
}

export interface NpcEncounterConfigPanelProps {
  value: EncounterConfigValue;
  onChange: (patch: Partial<EncounterConfigValue>) => void;
  monsterGroups: MonsterGroupItem[];
  items: ItemTemplateItem[];
  opponent: { name: string; title?: string; avatar?: string };
  /** 剧情战斗选项需要先选择对手模板；地图 NPC 不需要 */
  opponentTemplateSelector?: React.ReactNode;
  loading?: boolean;
}

/**
 * 「遭遇模式与实例参数」共享面板。
 * 放置地图 NPC（NpcEditModal）与剧情战斗选项（DialogueNodeModal）复用同一套布局和字段。
 */
export const NpcEncounterConfigPanel: React.FC<NpcEncounterConfigPanelProps> = ({
  value,
  onChange,
  monsterGroups,
  items,
  opponent,
  opponentTemplateSelector,
  loading = false,
}) => {
  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedItemCount, setSelectedItemCount] = useState(1);

  const selectedBattleGroup = useMemo(
    () => monsterGroups.find((group) => group.id === value.battleGroupId) || null,
    [monsterGroups, value.battleGroupId]
  );

  const selectedBattleMembers = useMemo(
    () =>
      [...(selectedBattleGroup?.members || [])].sort(
        (a, b) => Number(a.slot_index) - Number(b.slot_index)
      ),
    [selectedBattleGroup]
  );

  useEffect(() => {
    if (!selectedItemId && items.length > 0) {
      setSelectedItemId(items[0].id);
    }
  }, [items, selectedItemId]);

  useEffect(() => {
    if (value.battleMode !== 'GROUP' || !value.battleGroupId || selectedBattleMembers.length === 0) {
      return;
    }
    const missing = selectedBattleMembers.filter(
      (member) => value.battleMemberLevels[String(member.slot_index)] === undefined
    );
    if (missing.length === 0) return;
    const next = { ...value.battleMemberLevels };
    for (const member of missing) {
      next[String(member.slot_index)] = Math.max(1, Number(member.level) || 1);
    }
    onChange({ battleMemberLevels: next });
    // value/onChange 由父组件每次渲染创建，这里只在缺失槽位时补齐
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.battleMode, value.battleGroupId, value.battleMemberLevels, selectedBattleMembers]);

  const handleBattleGroupChange = (groupId: string) => {
    const group = monsterGroups.find((item) => item.id === groupId);
    const levels: Record<string, number> = {};
    for (const member of group?.members || []) {
      levels[String(member.slot_index)] = Math.max(1, Number(member.level) || 1);
    }
    onChange({ battleGroupId: groupId, battleMemberLevels: levels });
  };

  const handleAddItem = () => {
    if (!selectedItemId) return;
    const item = items.find((i) => i.id === selectedItemId);
    const count = Math.max(1, Math.floor(selectedItemCount) || 1);
    const existing = value.rewardItems.find((it) => it.id === selectedItemId);
    if (existing) {
      onChange({
        rewardItems: value.rewardItems.map((it) =>
          it.id === selectedItemId ? { ...it, count: it.count + count } : it
        ),
      });
    } else {
      onChange({
        rewardItems: [
          ...value.rewardItems,
          { id: selectedItemId, name: item?.name || selectedItemId, count },
        ],
      });
    }
  };

  return (
    <div className="p-4 bg-[#0a0e16] border border-amber-500/30 rounded-xl space-y-4">
      <div className="flex items-center gap-2 text-amber-300 font-bold pb-2 border-b border-slate-800">
        <Swords className="w-4 h-4" />
        <span>遭遇模式与实例参数</span>
      </div>

      <div>
        <label className="block text-slate-300 mb-2 font-medium">遭遇模式</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onChange({ battleMode: 'SOLO', battleGroupId: '', battleMemberLevels: {} })}
            className={`p-3 rounded-xl border text-left transition ${
              value.battleMode === 'SOLO'
                ? 'bg-amber-500/10 border-amber-500/60 text-amber-200'
                : 'bg-[#121722] border-slate-800 text-slate-400 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-1.5 font-bold text-sm text-slate-100">
              <Swords className="w-4 h-4 text-amber-400" />
              <span>单人遭遇</span>
              <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                免战阵
              </span>
            </div>
            <div className="text-[11px] opacity-75 mt-1">
              不用选战斗配置，当前 NPC 自身就是唯一敌人
            </div>
          </button>
          <button
            type="button"
            onClick={() => onChange({ battleMode: 'GROUP' })}
            className={`p-3 rounded-xl border text-left transition ${
              value.battleMode === 'GROUP'
                ? 'bg-amber-500/10 border-amber-500/60 text-amber-200'
                : 'bg-[#121722] border-slate-800 text-slate-400 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-1.5 font-bold text-sm text-slate-100">
              <Users className="w-4 h-4 text-sky-400" />
              <span>多人战阵</span>
            </div>
            <div className="text-[11px] opacity-75 mt-1">
              复用已有战斗配置，1~4 名敌人组队上阵
            </div>
          </button>
        </div>
      </div>

      {value.battleMode === 'GROUP' ? (
        <div>
          <label className="block text-slate-300 mb-1 font-medium">战斗配置 *</label>
          <select
            required
            value={value.battleGroupId}
            onChange={(e) => handleBattleGroupChange(e.target.value)}
            disabled={loading}
            className="w-full px-3 py-2 bg-[#121722] border border-slate-700 rounded-xl text-amber-200 focus:outline-none focus:border-amber-400 disabled:opacity-50"
          >
            <option value="">-- 选择战斗配置 --</option>
            {monsterGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name} ({group.enemyCount} 个敌人) [ID: {group.id}]
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500 mt-1">
            选择后会列出该配置的全部敌人；这里设置的等级只对当前战斗角色生效，未填则使用战斗配置默认等级。
          </p>
        </div>
      ) : (
        <div className="p-3 bg-[#121722] border border-slate-800 rounded-xl space-y-2">
          {opponentTemplateSelector && <div className="pb-1">{opponentTemplateSelector}</div>}
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-300 font-medium">唯一对手</span>
            <span className="text-slate-500">取自战斗角色模板与立绘</span>
          </div>
          <div className="flex items-center gap-3">
            {opponent.avatar ? (
              <img
                src={opponent.avatar}
                alt={opponent.name}
                className="w-9 h-11 rounded object-contain bg-slate-900/60 border border-slate-700"
              />
            ) : (
              <div className="w-9 h-11 rounded bg-slate-800 border border-slate-700" />
            )}
            <div className="min-w-0">
              <div className="font-bold text-sm text-slate-100 truncate">
                {opponent.name || '（请先选择战斗角色模板）'}
              </div>
              <div className="text-[10px] text-slate-500 truncate">
                {opponent.title || '江湖中人'} · 前排 · Lv.{Math.max(1, Math.round(value.battleLevel))}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            无需创建战斗配置：等级取下方「遭遇等级」，属性/品质/境界/技能沿用该模板；奖励、重生冷却与一次性标记与多人战阵共用。
          </p>
        </div>
      )}

      {value.battleMode === 'GROUP' && selectedBattleMembers.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-300 font-medium">敌方阵容等级</span>
            <span className="text-[10px] text-slate-500">
              共 {selectedBattleMembers.length} 个槽位 · 逐槽覆盖
            </span>
          </div>
          <div className="space-y-1.5">
            {selectedBattleMembers.map((member) => {
              const key = String(member.slot_index);
              const currentLevel =
                value.battleMemberLevels[key] ?? Math.max(1, Number(member.level) || 1);
              return (
                <div
                  key={key}
                  className="flex items-center gap-2 p-2 rounded-lg bg-[#121722] border border-slate-800"
                >
                  <span className="w-6 text-center text-[10px] font-mono text-amber-400">
                    {member.slot_index}
                  </span>
                  {member.template_avatar ? (
                    <img
                      src={member.template_avatar}
                      alt={member.template_name || ''}
                      className="w-7 h-8 rounded object-contain bg-slate-900/60 border border-slate-700"
                    />
                  ) : (
                    <div className="w-7 h-8 rounded bg-slate-800 border border-slate-700" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-200 truncate">
                        {member.template_name || member.template_id}
                      </span>
                      {member.is_boss && (
                        <span className="text-[9px] px-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          BOSS
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {member.position === 'BACK' ? '后排' : '前排'} ·{' '}
                      {member.quality_label || '普通'} · 默认 Lv.{member.level}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500">等级</span>
                    <input
                      type="number"
                      min="1"
                      max="9999"
                      value={currentLevel}
                      onChange={(e) => {
                        const next = Math.max(1, Math.min(9999, Number(e.target.value) || 1));
                        onChange({
                          battleMemberLevels: {
                            ...value.battleMemberLevels,
                            [key]: next,
                          },
                        });
                      }}
                      className="w-20 px-2 py-1 bg-[#0a0e16] border border-slate-700 rounded-lg text-center text-amber-300 font-mono text-xs focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-slate-400 mb-1 font-medium">
            {value.battleMode === 'SOLO' ? '遭遇等级（同时用于战斗）' : '展示等级'}
          </label>
          <input
            type="number"
            min="1"
            value={value.battleLevel}
            onChange={(e) => onChange({ battleLevel: Number(e.target.value) || 1 })}
            className="w-full px-3 py-1.5 bg-[#121722] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-amber-400"
          />
        </div>
        <div>
          <label className="block text-slate-400 mb-1 font-medium">重生冷却 (秒)</label>
          <input
            type="number"
            min="0"
            value={value.respawnSeconds}
            onChange={(e) => onChange({ respawnSeconds: Number(e.target.value) || 0 })}
            className="w-full px-3 py-1.5 bg-[#121722] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-amber-400"
          />
          <span className="text-[10px] text-slate-500">0 = 无冷却常驻</span>
        </div>
        <div>
          <label className="block text-slate-400 mb-1 font-medium">一次性击败标记</label>
          <input
            type="text"
            value={value.onceFlag}
            onChange={(e) => onChange({ onceFlag: e.target.value })}
            placeholder="如: flag_boss_dead"
            className="w-full px-3 py-1.5 bg-[#121722] border border-slate-700 rounded-lg text-slate-100 font-mono text-xs focus:outline-none focus:border-amber-400"
          />
        </div>
      </div>

      <div className="pt-2 border-t border-slate-800 space-y-3">
        <div className="text-slate-300 font-medium flex items-center gap-1.5">
          <Gift className="w-3.5 h-3.5 text-amber-400" />
          <span>胜利奖励</span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">修为经验</label>
            <input
              type="number"
              min="0"
              value={value.rewardExp}
              onChange={(e) => onChange({ rewardExp: Number(e.target.value) || 0 })}
              className="w-full px-3 py-1.5 bg-[#121722] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-amber-400"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">铜钱 (Gold)</label>
            <input
              type="number"
              min="0"
              value={value.rewardGold}
              onChange={(e) => onChange({ rewardGold: Number(e.target.value) || 0 })}
              className="w-full px-3 py-1.5 bg-[#121722] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-amber-400"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">纹银 (Silver)</label>
            <input
              type="number"
              min="0"
              value={value.rewardSilver}
              onChange={(e) => onChange({ rewardSilver: Number(e.target.value) || 0 })}
              className="w-full px-3 py-1.5 bg-[#121722] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-amber-400"
            />
          </div>
        </div>

        <div className="flex gap-2 items-center">
          <div className="flex-1">
            <select
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              disabled={loading || items.length === 0}
              className="w-full px-3 py-1.5 bg-[#121722] border border-slate-700 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-amber-400 disabled:opacity-50"
            >
              {items.length === 0 ? (
                <option value="">{loading ? '加载道具字典...' : '暂无道具'}</option>
              ) : (
                items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.id})
                  </option>
                ))
              )}
            </select>
          </div>
          <input
            type="number"
            min="1"
            value={selectedItemCount}
            onChange={(e) => setSelectedItemCount(Math.max(1, Number(e.target.value) || 1))}
            className="w-20 px-2 py-1.5 bg-[#121722] border border-slate-700 rounded-lg text-slate-100 text-xs text-center focus:outline-none focus:border-amber-400"
          />
          <button
            type="button"
            onClick={handleAddItem}
            disabled={!selectedItemId || loading}
            className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-medium flex items-center gap-1 transition disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" /> 添加
          </button>
        </div>

        <div className="p-3 bg-[#121722] border border-slate-800 rounded-xl min-h-[48px]">
          {value.rewardItems.length === 0 ? (
            <div className="text-slate-500 text-center text-xs py-1 flex items-center justify-center gap-1.5">
              <Package className="w-3.5 h-3.5 opacity-50" />
              <span>暂未配置掉落道具</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {value.rewardItems.map((item, index) => (
                <span
                  key={`${item.id}_${index}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/30 text-xs"
                >
                  {item.name} <span className="font-mono text-amber-400">×{item.count}</span>
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        rewardItems: value.rewardItems.filter((_, i) => i !== index),
                      })
                    }
                    className="text-slate-400 hover:text-red-400 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
