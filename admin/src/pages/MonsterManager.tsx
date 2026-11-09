import React, { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../services/api';
import {
  ConfigMember,
  MonsterGroupItem,
  NpcAttributeConfigResponse,
  NpcSlotPreviewMember,
  NpcTemplateItem,
} from '../types';
import {
  Swords,
  Plus,
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  Crown,
  Layers,
  AlertTriangle,
  CheckCircle,
  X,
  Users,
} from 'lucide-react';

function makeSlot(slotIndex: number, template?: NpcTemplateItem, level = 1): ConfigMember {
  return {
    slot_index: slotIndex,
    template_id: template?.id || '',
    template_name: template?.name || '',
    template_avatar: template?.avatar || '',
    level,
    position: 'FRONT',
    is_boss: slotIndex === 0,
    quality: null,
    realm: null,
    hp_override: null,
    mp_override: null,
    attack_override: null,
    defense_override: null,
    speed_override: null,
    hp: 0,
    mp: 0,
    attack: 0,
    matk: 0,
    defense: 0,
    mdef: 0,
    speed: 0,
    crit: 0,
    combatPower: 0,
  };
}

export const MonsterManager: React.FC = () => {
  const [groups, setGroups] = useState<MonsterGroupItem[]>([]);
  const [templates, setTemplates] = useState<NpcTemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<MonsterGroupItem | null>(null);
  const [groupId, setGroupId] = useState('');
  const [groupName, setGroupName] = useState('');
  const [slots, setSlots] = useState<Array<ConfigMember | null>>([null, null, null, null]);
  const [modalError, setModalError] = useState('');
  const [saving, setSaving] = useState(false);
  const [attributeConfig, setAttributeConfig] = useState<NpcAttributeConfigResponse | null>(null);
  const [previewMembers, setPreviewMembers] = useState<Record<number, NpcSlotPreviewMember>>({});
  const [previewLoading, setPreviewLoading] = useState(false);

  const [deletingGroup, setDeletingGroup] = useState<MonsterGroupItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3000);
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [groupsRes, templatesRes, attributeConfigRes] = await Promise.all([
        adminApi.getMonsterGroups(),
        adminApi.getNpcTemplates(),
        adminApi.getNpcAttributeConfig().catch(() => null),
      ]);
      setGroups(groupsRes.data || []);
      setTemplates(templatesRes.data || []);
      setAttributeConfig(attributeConfigRes?.data || null);
    } catch (err: any) {
      showToast(err.message || '加载战斗配置失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);


  const filteredGroups = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return groups;
    return groups.filter(
      (g) => g.name.toLowerCase().includes(kw) || g.id.toLowerCase().includes(kw)
    );
  }, [groups, keyword]);

  const templateMap = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);

  // 槽位属性预览统一走后端计算服务，前端不再硬编码成长率/品质倍率
  useEffect(() => {
    if (!isModalOpen) {
      setPreviewMembers({});
      return;
    }
    const activeSlots = slots
      .map((slot, index) => (slot ? { ...slot, slot_index: index } : null))
      .filter(Boolean) as ConfigMember[];
    if (activeSlots.length === 0) {
      setPreviewMembers({});
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await adminApi.previewNpcAttributeSlots(
          activeSlots.map((slot) => ({
            slot_index: slot.slot_index,
            template_id: slot.template_id,
            level: slot.level,
            quality: slot.quality || null,
            realm: slot.realm || null,
            hp_override: slot.hp_override,
            mp_override: slot.mp_override,
            attack_override: slot.attack_override,
            defense_override: slot.defense_override,
            speed_override: slot.speed_override,
          }))
        );
        if (cancelled) return;
        const next: Record<number, NpcSlotPreviewMember> = {};
        for (const member of res.data?.members || []) {
          next[member.slot_index] = member;
        }
        setPreviewMembers(next);
      } catch {
        if (!cancelled) setPreviewMembers({});
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isModalOpen, slots]);

  const getMemberPreview = (member: ConfigMember) => {
    const template = templateMap.get(member.template_id);
    const preview = previewMembers[member.slot_index];
    return {
      name: template?.name || member.template_name || '未选择模板',
      avatar: template?.avatar || member.template_avatar || '',
      hp: preview?.hp ?? member.hp,
      mp: preview?.mp ?? member.mp,
      attack: preview?.attack ?? member.attack,
      matk: preview?.matk ?? member.matk ?? 0,
      defense: preview?.defense ?? member.defense,
      mdef: preview?.mdef ?? member.mdef ?? 0,
      speed: preview?.speed ?? member.speed,
      crit: preview?.crit ?? member.crit ?? 0,
      quality: preview?.quality || member.quality,
      combatPower: preview?.combatPower ?? member.combatPower ?? 0,
    };
  };

  const handleOpenCreate = () => {
    const id = `group_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setEditingGroup(null);
    setGroupId(id);
    setGroupName('');
    setSlots([makeSlot(0, templates[0], 1), null, null, null]);
    setModalError('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (group: MonsterGroupItem) => {
    setEditingGroup(group);
    setGroupId(group.id);
    setGroupName(group.name);
    const next: Array<ConfigMember | null> = [null, null, null, null];
    (group.members || []).forEach((member, index) => {
      const slot = Number.isInteger(member.slot_index) && member.slot_index >= 0 && member.slot_index <= 3
        ? member.slot_index
        : index;
      next[slot] = { ...member, slot_index: slot };
    });
    setSlots(next);
    setModalError('');
    setIsModalOpen(true);
  };

  const updateSlot = (slotIndex: number, patch: Partial<ConfigMember>) => {
    setSlots((prev) => {
      const next = [...prev];
      const current = next[slotIndex];
      if (!current) return prev;
      next[slotIndex] = { ...current, ...patch };
      return next;
    });
  };

  const toggleSlot = (slotIndex: number) => {
    setSlots((prev) => {
      const next = [...prev];
      if (next[slotIndex]) {
        if (next.filter(Boolean).length <= 1) {
          showToast('至少保留 1 个战斗槽位', 'error');
          return prev;
        }
        next[slotIndex] = null;
      } else {
        const usedTemplateIds = new Set(next.filter(Boolean).map((s) => s!.template_id));
        const template = templates.find((t) => !usedTemplateIds.has(t.id)) || templates[0];
        next[slotIndex] = makeSlot(slotIndex, template, 1);
      }
      return next;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) {
      setModalError('战斗配置名称不能为空');
      return;
    }

    const members = slots
      .map((slot, index) => (slot ? { ...slot, slot_index: index } : null))
      .filter(Boolean) as ConfigMember[];

    if (members.length === 0) {
      setModalError('至少配置 1 个战斗槽位');
      return;
    }
    if (members.some((m) => !m.template_id)) {
      setModalError('每个启用的槽位都必须选择 NPC 模板');
      return;
    }

    setSaving(true);
    setModalError('');
    try {
      const payload = {
        id: groupId.trim(),
        name: groupName.trim(),
        members: members.map((m) => ({
          slot_index: m.slot_index,
          template_id: m.template_id,
          level: Math.max(1, Number(m.level) || 1),
          position: m.position,
          is_boss: Boolean(m.is_boss),
          quality: m.quality || null,
          realm: m.realm || null,
          hp_override: m.hp_override,
          mp_override: m.mp_override,
          attack_override: m.attack_override,
          defense_override: m.defense_override,
          speed_override: m.speed_override,
        })),
      };

      if (editingGroup) {
        await adminApi.updateMonsterGroup(editingGroup.id, payload as any);
        showToast(`战斗配置【${groupName}】已更新`);
      } else {
        await adminApi.createMonsterGroup(payload as any);
        showToast(`战斗配置【${groupName}】已创建`);
      }
      setIsModalOpen(false);
      await loadAll();
    } catch (err: any) {
      setModalError(err.message || '保存战斗配置失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingGroup) return;
    setIsDeleting(true);
    try {
      await adminApi.deleteMonsterGroup(deletingGroup.id);
      showToast(`战斗配置【${deletingGroup.name}】已删除`);
      setDeletingGroup(null);
      await loadAll();
    } catch (err: any) {
      showToast(err.message || '删除战斗配置失败', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {toastMsg && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-sm border backdrop-blur-md ${
            toastMsg.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
              : 'bg-red-950/90 border-red-500/40 text-red-200'
          }`}
        >
          {toastMsg.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-400" />
          )}
          <span>{toastMsg.text}</span>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#121722] border border-slate-800 rounded-2xl p-5 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <Swords className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">战斗配置</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              从 NPC 模板库选择 1~4 个 NPC，按等级与覆盖属性生成战斗实例；地图 NPC 直接引用这里的配置
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadAll}
            disabled={loading}
            className="p-2.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 rounded-xl transition border border-slate-700 disabled:opacity-50"
            title="刷新"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleOpenCreate}
            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl flex items-center gap-2 transition shadow-lg shadow-amber-500/20 text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>新建战斗配置</span>
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 bg-[#121722] border border-slate-800 rounded-xl p-3 text-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索配置名称、ID..."
            className="w-full pl-9 pr-3 py-1.5 bg-[#0a0e16] border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-amber-400"
          />
        </div>
        <div className="text-xs text-slate-400">
          共 <span className="font-mono text-amber-300 font-bold">{groups.length}</span> 套战斗配置
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading ? (
          <div className="col-span-full py-16 text-center text-slate-500 text-xs flex flex-col items-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-amber-400/60" />
            <span>正在加载战斗配置...</span>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-500 text-xs bg-[#121722] border border-slate-800 rounded-2xl">
            暂无战斗配置，先到「NPC 模板库」建模板，再回来新建配置
          </div>
        ) : (
          filteredGroups.map((group) => (
            <div
              key={group.id}
              className="bg-[#121722] border border-slate-800 hover:border-slate-700 rounded-2xl p-5 flex flex-col justify-between space-y-4 transition shadow-md"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                      <span>{group.name}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                        {group.enemyCount} 个实例
                      </span>
                    </h3>
                    <p className="font-mono text-[11px] text-slate-500 mt-1">ID: {group.id}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleOpenEdit(group)}
                      className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 transition"
                      title="编辑配置"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeletingGroup(group)}
                      className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition"
                      title="删除配置"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 p-2.5 bg-[#0a0e16] border border-slate-800 rounded-xl space-y-2">
                  <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
                    <span>敌方实例槽位</span>
                    <span className="text-amber-400/80 font-mono text-[10px]">
                      总气血: {group.totalHp.toLocaleString()}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5">
                    {[0, 1, 2, 3].map((slotIndex) => {
                      const member = (group.members || []).find((m) => m.slot_index === slotIndex);
                      if (!member) {
                        return (
                          <div
                            key={slotIndex}
                            className="h-20 rounded-lg border border-dashed border-slate-800 bg-[#0d121a]/50 flex flex-col items-center justify-center text-[10px] text-slate-600"
                          >
                            <span>空槽</span>
                            <span className="font-mono text-[9px]">{slotIndex}</span>
                          </div>
                        );
                      }
                      return (
                        <div
                          key={slotIndex}
                          className="h-20 rounded-lg border border-slate-700 bg-[#121722] p-1.5 flex flex-col justify-between relative overflow-hidden"
                        >
                          {member.is_boss && (
                            <Crown className="w-3 h-3 text-amber-400 absolute top-1 right-1" />
                          )}
                          <div className="flex items-center gap-1">
                            <span
                              className={`text-[9px] font-bold px-1 rounded ${
                                member.position === 'BACK'
                                  ? 'bg-purple-500/20 text-purple-300'
                                  : 'bg-sky-500/20 text-sky-300'
                              }`}
                            >
                              {member.position === 'BACK' ? '后' : '前'}
                            </span>
                            <span className="text-[10px] text-slate-200 truncate">
                              {member.template_name || member.template_id}
                            </span>
                          </div>
                          <div className="text-[9px] font-mono text-slate-400 space-y-0.5">
                            <div>
                              Lv.{member.level} · {member.quality_label || member.effective_quality || '普通'}
                              {member.realm ? ` · ${member.realm}` : ''}
                            </div>
                            <div>HP {member.hp.toLocaleString()}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="text-[10px] text-slate-600 flex justify-between items-center pt-2 border-t border-slate-800">
                <span>估算战力 ~{group.totalCombatPower.toLocaleString()}</span>
                <span>
                  {group.referencedNpcs?.length
                    ? `被 ${group.referencedNpcs.length} 个地图 NPC 引用`
                    : '暂无地图 NPC 引用'}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 编辑弹窗 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-[#10151f] border border-slate-800 rounded-2xl w-full max-w-5xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-[#0b0f17]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-100">
                    {editingGroup ? `编辑战斗配置 · ${editingGroup.name}` : '新建战斗配置'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    选择 NPC 模板并设置等级/境界/品质；属性留空时由统一计算服务按数据库成长值生成
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs text-slate-200">
              {modalError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1.5 font-medium">战斗配置名称 *</label>
                  <input
                    type="text"
                    required
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="例如: 演武剑阵"
                    className="w-full px-3 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1.5 font-medium">配置 ID *</label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingGroup)}
                    value={groupId}
                    onChange={(e) => setGroupId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-amber-300 font-mono disabled:opacity-50 focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              {templates.length === 0 && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span>还没有 NPC 模板，请先到「NPC 模板库」创建模板。</span>
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-slate-200 flex items-center gap-2">
                    <Users className="w-4 h-4 text-amber-400" />
                    <span>敌方实例槽位 (0 ~ 3)</span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    已启用 <span className="text-amber-300 font-bold">{slots.filter(Boolean).length}</span> / 4
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[0, 1, 2, 3].map((slotIndex) => {
                    const slot = slots[slotIndex];
                    const preview = slot ? getMemberPreview(slot) : null;
                    return (
                      <div
                        key={slotIndex}
                        className={`rounded-2xl border p-4 transition ${
                          slot
                            ? 'bg-[#0a0e16] border-slate-700 shadow-md'
                            : 'bg-[#0d121a]/40 border-dashed border-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center font-mono font-bold text-xs">
                              {slotIndex}
                            </span>
                            <span className="font-bold text-slate-200">
                              槽位 {slotIndex} {slot?.is_boss ? '(Boss)' : ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {slot && (
                              <label className="flex items-center gap-1 text-[11px] text-amber-300 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={Boolean(slot.is_boss)}
                                  onChange={(e) => updateSlot(slotIndex, { is_boss: e.target.checked })}
                                  className="rounded border-slate-700 text-amber-500 focus:ring-0"
                                />
                                Boss
                              </label>
                            )}
                            <button
                              type="button"
                              onClick={() => toggleSlot(slotIndex)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
                                slot
                                  ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30'
                                  : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30'
                              }`}
                            >
                              {slot ? '清空' : '+ 启用'}
                            </button>
                          </div>
                        </div>

                        {slot && (
                          <div className="mt-3 space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] text-slate-400 mb-1">NPC 模板 *</label>
                                <select
                                  value={slot.template_id}
                                  onChange={(e) => {
                                    const template = templateMap.get(e.target.value);
                                    updateSlot(slotIndex, {
                                      template_id: e.target.value,
                                      template_name: template?.name || '',
                                      template_avatar: template?.avatar || '',
                                    });
                                  }}
                                  className="w-full px-2.5 py-1.5 bg-[#121722] border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-amber-400"
                                >
                                  <option value="">-- 选择模板 --</option>
                                  {templates.map((template) => (
                                    <option key={template.id} value={template.id}>
                                      {template.name} ({template.id})
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-400 mb-1">等级</label>
                                <input
                                  type="number"
                                  min="1"
                                  max="200"
                                  value={slot.level}
                                  onChange={(e) => updateSlot(slotIndex, { level: Math.max(1, Number(e.target.value) || 1) })}
                                  className="w-full px-2.5 py-1.5 bg-[#121722] border border-slate-700 rounded-lg text-amber-300 font-mono text-xs focus:outline-none focus:border-amber-400"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="block text-[10px] text-slate-400 mb-1">站位</label>
                                <select
                                  value={slot.position}
                                  onChange={(e) => updateSlot(slotIndex, { position: e.target.value as 'FRONT' | 'BACK' })}
                                  className="w-full px-2.5 py-1.5 bg-[#121722] border border-slate-700 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-amber-400"
                                >
                                  <option value="FRONT">FRONT 前排</option>
                                  <option value="BACK">BACK 后排</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-400 mb-1">品质覆盖</label>
                                <select
                                  value={slot.quality || ''}
                                  onChange={(e) => updateSlot(slotIndex, { quality: e.target.value || null })}
                                  className="w-full px-2.5 py-1.5 bg-[#121722] border border-slate-700 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-amber-400"
                                >
                                  <option value="">继承模板品质</option>
                                  {attributeConfig?.qualities.map((item) => (
                                    <option key={item.id} value={item.id}>
                                      {item.label} ×{item.statMultiplier}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-400 mb-1">境界</label>
                                <input
                                  value={slot.realm || ''}
                                  onChange={(e) => updateSlot(slotIndex, { realm: e.target.value || null })}
                                  placeholder="如: 金丹中期"
                                  className="w-full px-2.5 py-1.5 bg-[#121722] border border-slate-700 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-amber-400"
                                />
                              </div>
                            </div>

                            <div className="text-[10px] font-mono text-slate-400 bg-[#121722] border border-slate-800 rounded-lg px-2 py-1.5">
                              {previewLoading ? (
                                <span className="text-slate-500">正在由属性服务计算...</span>
                              ) : preview ? (
                                <>
                                  <div className="flex items-center justify-between">
                                    <span className="text-emerald-300">
                                      {preview.quality || 'COMMON'} {slot.realm ? `· ${slot.realm}` : ''}
                                    </span>
                                    <span>战力 ~{Number(preview.combatPower || 0).toLocaleString()}</span>
                                  </div>
                                  <div className="mt-0.5">
                                    HP {preview.hp.toLocaleString()} · MP {preview.mp.toLocaleString()} · 物攻 {preview.attack} · 法攻 {preview.matk} · 物防 {preview.defense} · 法防 {preview.mdef} · 速 {preview.speed} · 暴击 {(preview.crit * 100).toFixed(1)}%
                                  </div>
                                </>
                              ) : (
                                <span className="text-slate-500">选择模板后自动预览</span>
                              )}
                            </div>

                            <div className="pt-2 border-t border-slate-800">
                              <div className="text-[10px] text-slate-500 mb-1.5">
                                属性覆盖（留空则由统一属性计算服务按模板成长生成）
                              </div>
                              <div className="grid grid-cols-5 gap-1.5">
                                {[
                                  { key: 'hp_override', label: '气血', baseKey: 'base_hp' },
                                  { key: 'mp_override', label: '内力', baseKey: 'base_mp' },
                                  { key: 'attack_override', label: '攻击', baseKey: 'base_attack' },
                                  { key: 'defense_override', label: '防御', baseKey: 'base_defense' },
                                  { key: 'speed_override', label: '速度', baseKey: 'base_speed' },
                                ].map((field) => {
                                  const template = templateMap.get(slot.template_id);
                                  const base = template ? (template as any)[field.baseKey] : 0;
                                  return (
                                    <div key={field.key}>
                                      <label className="block text-[9px] text-slate-500 mb-0.5">{field.label}</label>
                                      <input
                                        type="number"
                                        min="0"
                                        value={(slot as any)[field.key] ?? ''}
                                        placeholder={String(base)}
                                        onChange={(e) => {
                                          const raw = e.target.value;
                                          updateSlot(slotIndex, {
                                            [field.key]: raw === '' ? null : Math.max(0, Number(raw)),
                                          } as any);
                                        }}
                                        className="w-full px-1.5 py-1 bg-[#121722] border border-slate-700 rounded text-center text-[10px] font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition flex items-center gap-1.5 shadow-lg shadow-amber-500/20 disabled:opacity-50"
                >
                  {saving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingGroup ? '保存修改' : '确认创建'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 删除确认 */}
      {deletingGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-[#121722] border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-100">确认删除战斗配置？</h3>
                <p className="text-xs text-slate-400 mt-0.5">被地图 NPC 引用时会拒绝删除</p>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed bg-[#0a0e16] p-3 rounded-xl border border-slate-800">
              确定要删除【<span className="text-amber-300 font-bold">{deletingGroup.name}</span>】
              (ID: {deletingGroup.id}) 吗？
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeletingGroup(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-400 text-white font-bold text-xs transition flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeleting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>确认删除</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
