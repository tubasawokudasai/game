import React, { useEffect, useMemo, useState } from 'react';
import {
  NpcItem,
  MonsterGroupItem,
  NpcTemplateItem,
  SceneItem,
  ItemTemplateItem,
  DialoguePackageItem,
  DialogueNodeItem,
  CombatSkillItem,
} from '../types';
import { adminApi } from '../services/api';
import { NpcEncounterConfigPanel } from './NpcEncounterConfigPanel';
import {
  X,
  Swords,
  MessageSquare,
  Gift,
  RefreshCw,
  Plus,
  AlertCircle,
  Package,
  Sparkles,
  Users,
  ScrollText,
  ExternalLink,
} from 'lucide-react';

function parseBattleMemberLevels(raw: unknown): Record<string, number> {
  if (!raw) return {};
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const result: Record<string, number> = {};
  for (const [slot, level] of Object.entries(parsed as Record<string, unknown>)) {
    const slotIndex = Number(slot);
    const value = Number(level);
    if (Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex <= 3 && Number.isFinite(value)) {
      result[String(slotIndex)] = Math.max(1, Math.round(value));
    }
  }
  return result;
}

interface NpcEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  sceneId: string;
  scenes: SceneItem[];
  npc: NpcItem | null;
  onSaved: () => void;
}

export const NpcEditModal: React.FC<NpcEditModalProps> = ({
  isOpen,
  onClose,
  sceneId,
  scenes,
  npc,
  onSaved,
}) => {
  const isEdit = Boolean(npc);

  const [templates, setTemplates] = useState<NpcTemplateItem[]>([]);
  const [monsterGroups, setMonsterGroups] = useState<MonsterGroupItem[]>([]);
  const [availableItems, setAvailableItems] = useState<ItemTemplateItem[]>([]);
  const [dialoguePackages, setDialoguePackages] = useState<DialoguePackageItem[]>([]);
  const [packageNodes, setPackageNodes] = useState<DialogueNodeItem[]>([]);
  const [availableSkills, setAvailableSkills] = useState<CombatSkillItem[]>([]);
  const [loadingDicts, setLoadingDicts] = useState(false);
  const [loadingPackageNodes, setLoadingPackageNodes] = useState(false);
  const [dictError, setDictError] = useState('');

  const [targetSceneId, setTargetSceneId] = useState(sceneId);
  const [templateId, setTemplateId] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [customSkillsEnabled, setCustomSkillsEnabled] = useState(false);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [badge, setBadge] = useState('');
  const [avatar, setAvatar] = useState('');
  const [type, setType] = useState<'dialogue' | 'battle'>('battle');
  /** SOLO：不选战斗配置，NPC 自己上阵；GROUP：复用已有战斗配置（1~4 敌） */
  const [battleMode, setBattleMode] = useState<'SOLO' | 'GROUP'>('SOLO');
  const [quote, setQuote] = useState('');
  const [gossip, setGossip] = useState('');
  const [dialoguePackageId, setDialoguePackageId] = useState('');
  const [dialogueRootNodeId, setDialogueRootNodeId] = useState('');

  const [battleGroupId, setBattleGroupId] = useState('');
  const [battleLevel, setBattleLevel] = useState(1);
  const [battleMemberLevels, setBattleMemberLevels] = useState<Record<string, number>>({});
  const [respawnSeconds, setRespawnSeconds] = useState(0);
  const [onceFlag, setOnceFlag] = useState('');
  const [rewardExp, setRewardExp] = useState(0);
  const [rewardGold, setRewardGold] = useState(0);
  const [rewardSilver, setRewardSilver] = useState(0);
  const [rewardItems, setRewardItems] = useState<Array<{ id: string; name: string; count: number }>>([]);

  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedItemCount, setSelectedItemCount] = useState(1);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const loadDictionaries = async () => {
    setLoadingDicts(true);
    setDictError('');
    try {
      const [templatesRes, groupsRes, itemsRes, pkgRes, skillsRes] = await Promise.all([
        adminApi.getNpcTemplates().catch(() => ({ success: false, data: [] as NpcTemplateItem[] })),
        adminApi.getMonsterGroups().catch(() => ({ success: false, data: [] as MonsterGroupItem[] })),
        adminApi.getItems().catch(() => ({ success: false, data: [] as ItemTemplateItem[] })),
        adminApi.getDialoguePackages().catch(() => ({ success: false, data: [] as DialoguePackageItem[] })),
        adminApi.getSkills({ pageSize: 100 }).catch(() => ({ success: false, data: [] as CombatSkillItem[] })),
      ]);
      if (templatesRes.success) setTemplates(templatesRes.data || []);
      if (groupsRes.success) setMonsterGroups(groupsRes.data || []);
      if (itemsRes.success) {
        setAvailableItems(itemsRes.data || []);
        if (itemsRes.data?.length) setSelectedItemId((prev) => prev || itemsRes.data[0].id);
      }
      if (pkgRes.success) setDialoguePackages(pkgRes.data || []);
      if (skillsRes.success) setAvailableSkills(skillsRes.data || []);
    } catch (err: any) {
      setDictError(err.message || '加载字典失败');
    } finally {
      setLoadingDicts(false);
    }
  };

  // 当选择的剧本改变时，异步加载该剧本下的全部节点以供选择起始根节点
  useEffect(() => {
    if (!dialoguePackageId) {
      setPackageNodes([]);
      return;
    }
    let cancelled = false;
    setLoadingPackageNodes(true);
    adminApi.getDialoguePackage(dialoguePackageId)
      .then((res) => {
        if (!cancelled && res.success && res.data) {
          setPackageNodes(res.data.nodes || []);
        }
      })
      .catch(() => {
        if (!cancelled) setPackageNodes([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingPackageNodes(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dialoguePackageId]);

  useEffect(() => {
    if (!isOpen) return;
    void loadDictionaries();
  }, [isOpen]);

  // 打开弹窗时初始化表单；不依赖字典，避免字典返回后覆盖用户输入
  useEffect(() => {
    if (!isOpen) return;

    if (npc) {
      setTargetSceneId(npc.scene_id || sceneId);
      setTemplateId(npc.template_id || '');
      setName(npc.name || '');
      setTitle(npc.title || '');
      setBadge(npc.badge || '');
      setAvatar(npc.avatar || '');
      setType(npc.type || 'dialogue');
      setBattleMode(npc.battle_group_id ? 'GROUP' : 'SOLO');
      setQuote(npc.quote || '');
      setGossip(npc.gossip || '');
      setDialoguePackageId(npc.dialogue_package_id || '');
      setDialogueRootNodeId(npc.dialogue_root_node_id || '');
      setBattleGroupId(npc.battle_group_id || '');
      setBattleLevel(Number(npc.battle_level) || 1);
      setBattleMemberLevels(
        npc.battle_member_levels || parseBattleMemberLevels(npc.battle_member_levels_json)
      );
      setRespawnSeconds(Number(npc.respawn_seconds) || 0);
      setOnceFlag(npc.once_flag || '');

      // 技能配置
      if (npc.skills_json && npc.skills_json.trim()) {
        try {
          const parsed = JSON.parse(npc.skills_json);
          if (Array.isArray(parsed)) {
            setSelectedSkills(parsed);
            setCustomSkillsEnabled(true);
          } else {
            setSelectedSkills([]);
            setCustomSkillsEnabled(false);
          }
        } catch {
          setSelectedSkills([]);
          setCustomSkillsEnabled(false);
        }
      } else {
        setSelectedSkills([]);
        setCustomSkillsEnabled(false);
      }

      let reward: any = npc.battle_reward;
      if (!reward && npc.battle_reward_json) {
        try {
          reward = JSON.parse(npc.battle_reward_json);
        } catch {
          reward = {};
        }
      }
      setRewardExp(Number(reward?.exp) || 0);
      setRewardGold(Number(reward?.gold ?? reward?.copper) || 0);
      setRewardSilver(Number(reward?.silver) || 0);
      setRewardItems(
        Array.isArray(reward?.items)
          ? reward.items.map((it: any) => ({
              id: String(it.id || ''),
              name: String(it.name || it.id || ''),
              count: Math.max(1, Number(it.count) || 1),
            }))
          : []
      );
    } else {
      setTargetSceneId(sceneId);
      setTemplateId('');
      setName('');
      setTitle('');
      setBadge('');
      setAvatar('');
      setType('battle');
      setBattleMode('SOLO');
      setQuote('');
      setGossip('');
      setDialoguePackageId('');
      setDialogueRootNodeId('');
      setBattleGroupId('');
      setBattleLevel(1);
      setBattleMemberLevels({});
      setRespawnSeconds(0);
      setOnceFlag('');
      setRewardExp(0);
      setRewardGold(0);
      setRewardSilver(0);
      setRewardItems([]);
      setSelectedSkills([]);
      setCustomSkillsEnabled(false);
    }

    setSelectedItemCount(1);
    setErrorMsg('');
  }, [isOpen, npc, sceneId]);

  const battleGroups = useMemo(() => monsterGroups, [monsterGroups]);
  const selectedBattleGroup = useMemo(
    () => battleGroups.find((group) => group.id === battleGroupId) || null,
    [battleGroups, battleGroupId]
  );
  const selectedBattleMembers = useMemo(
    () =>
      [...(selectedBattleGroup?.members || [])].sort(
        (a, b) => Number(a.slot_index) - Number(b.slot_index)
      ),
    [selectedBattleGroup]
  );

  const selectedPackage = useMemo(
    () => dialoguePackages.find((p) => p.id === dialoguePackageId) || null,
    [dialoguePackages, dialoguePackageId]
  );

  // 字典加载较慢时，用战斗配置默认等级补齐尚未设置的槽位；不会覆盖用户已输入值
  useEffect(() => {
    if (
      !isOpen ||
      type !== 'battle' ||
      battleMode !== 'GROUP' ||
      !battleGroupId ||
      selectedBattleMembers.length === 0
    ) {
      return;
    }
    setBattleMemberLevels((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const member of selectedBattleMembers) {
        const key = String(member.slot_index);
        if (next[key] === undefined) {
          next[key] = Math.max(1, Number(member.level) || 1);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [isOpen, type, battleMode, battleGroupId, selectedBattleMembers]);

  const handleBattleGroupChange = (groupId: string) => {
    setBattleGroupId(groupId);
    const group = battleGroups.find((item) => item.id === groupId);
    const levels: Record<string, number> = {};
    for (const member of group?.members || []) {
      levels[String(member.slot_index)] = Math.max(1, Number(member.level) || 1);
    }
    setBattleMemberLevels(levels);
  };

  if (!isOpen) return null;

  const applyTemplate = (id: string) => {
    const template = templates.find((t) => t.id === id);
    setTemplateId(id);
    if (!template) return;
    setName(template.name);
    setTitle(template.title || '');
    setBadge(template.badge || '');
    setAvatar(template.avatar || '');
    if (template.dialogue_package_id) {
      setDialoguePackageId(template.dialogue_package_id);
      setDialogueRootNodeId(template.dialogue_root_node_id || '');
    }
    if (template.quote) setQuote(template.quote);
    if (template.gossip) setGossip(template.gossip);
  };

  const handleAddItem = () => {
    if (!selectedItemId) return;
    const item = availableItems.find((i) => i.id === selectedItemId);
    const count = Math.max(1, Math.floor(selectedItemCount) || 1);
    setRewardItems((prev) => {
      const index = prev.findIndex((it) => it.id === selectedItemId);
      if (index >= 0) {
        return prev.map((it, i) => (i === index ? { ...it, count: it.count + count } : it));
      }
      return [...prev, { id: selectedItemId, name: item?.name || selectedItemId, count }];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!templateId) {
      setErrorMsg('请先选择一个 NPC 模板');
      return;
    }
    if (!name.trim()) {
      setErrorMsg('NPC 姓名不能为空');
      return;
    }
    if (type === 'battle' && battleMode === 'GROUP' && !battleGroupId) {
      setErrorMsg('多人战阵模式必须选择一套战斗配置');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    const battleReward = {
      exp: Math.max(0, Math.round(rewardExp)),
      gold: Math.max(0, Math.round(rewardGold)),
      silver: Math.max(0, Math.round(rewardSilver)),
      items: rewardItems,
    };

    const payload: any = {
      scene_id: targetSceneId,
      template_id: templateId,
      name: name.trim(),
      title: title.trim(),
      badge: badge.trim(),
      avatar: avatar.trim(),
      type,
      battle_group_id: type === 'battle' && battleMode === 'GROUP' ? battleGroupId : null,
      battle_level: Math.max(1, Math.round(battleLevel)),
      battle_member_levels: type === 'battle' && battleMode === 'GROUP' ? battleMemberLevels : {},
      battle_reward: battleReward,
      respawn_seconds: Math.max(0, Math.round(respawnSeconds)),
      once_flag: onceFlag.trim() || null,
      quote: quote.trim(),
      gossip: gossip.trim(),
      dialogue_package_id: type === 'dialogue' ? dialoguePackageId || null : null,
      dialogue_root_node_id: type === 'dialogue' ? dialogueRootNodeId || null : null,
      skills_json: customSkillsEnabled ? JSON.stringify(selectedSkills) : null,
    };

    try {
      if (isEdit && npc) {
        await adminApi.updateNpc(npc.id, payload);
      } else {
        await adminApi.createNpc(payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || '保存 NPC 失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#10151f] border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-[#0b0f17]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              {type === 'battle' ? <Swords className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                {isEdit ? `编辑地图 NPC · ${npc?.name}` : '放置地图 NPC'}
              </h2>
              <p className="text-xs text-slate-400">从模板生成实例，并按需覆盖名称/战斗配置/奖励</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {dictError && (
          <div className="mx-6 mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{dictError}</span>
            </div>
            <button type="button" onClick={loadDictionaries} className="text-amber-400 hover:underline flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> 重试
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="mx-6 mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs text-slate-200">
          {/* 模板与场景 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 mb-1.5 font-medium">NPC 模板 *</label>
              <select
                required
                value={templateId}
                onChange={(e) => applyTemplate(e.target.value)}
                disabled={loadingDicts}
                className="w-full px-3 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-400 disabled:opacity-50"
              >
                <option value="">-- 选择模板 --</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} ({template.id})
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-500 mt-1">选择后自动填充名称/称号/立绘，可再手动修改</p>
            </div>

            <div>
              <label className="block text-slate-400 mb-1.5 font-medium">驻留场景 *</label>
              <select
                value={targetSceneId}
                onChange={(e) => setTargetSceneId(e.target.value)}
                className="w-full px-3 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-400"
              >
                {scenes.map((scene) => (
                  <option key={scene.id} value={scene.id}>
                    {scene.name} ({scene.id})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 基础信息 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 mb-1.5 font-medium">NPC 姓名 *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1.5 font-medium">道号 / 称号</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1.5 font-medium">头衔印章</label>
              <input
                type="text"
                value={badge}
                onChange={(e) => setBadge(e.target.value)}
                className="w-full px-3 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1.5 font-medium">立绘 URL</label>
              <input
                type="text"
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
                className="w-full px-3 py-2 bg-[#0a0e16] border border-slate-700 rounded-xl text-slate-100 font-mono text-xs focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* 技能法诀配置 */}
          <div className="p-4 bg-[#0a0e16] border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-sm text-slate-200">装配战斗技能</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400 cursor-pointer flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={customSkillsEnabled}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setCustomSkillsEnabled(enabled);
                      if (enabled && selectedSkills.length === 0) {
                        const tpl = templates.find((t) => t.id === templateId);
                        if (tpl?.skills_json) {
                          try {
                            const parsed = JSON.parse(tpl.skills_json);
                            if (Array.isArray(parsed)) setSelectedSkills(parsed);
                          } catch {}
                        }
                      }
                    }}
                    className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-0"
                  />
                  <span>独立覆盖模板技能</span>
                </label>
              </div>
            </div>

            {!customSkillsEnabled ? (
              <div className="text-xs text-slate-500 bg-slate-900/60 p-3 rounded-lg border border-slate-800/80 leading-relaxed">
                <span className="text-amber-400/90 font-medium">默认继承模板技能：</span>
                {(() => {
                  const tpl = templates.find((t) => t.id === templateId);
                  if (!tpl || !tpl.skills_json) return ' 未选择模板或模板未配置技能（战斗中默认普攻）';
                  try {
                    const parsed = JSON.parse(tpl.skills_json);
                    if (!Array.isArray(parsed) || parsed.length === 0) return ' 模板未配置技能（默认普攻）';
                    return parsed
                      .map((k) => availableSkills.find((s) => s.skill_key === k)?.name || k)
                      .join('、');
                  } catch {
                    return ' 模板技能解析异常';
                  }
                })()}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1 bg-slate-900/40 rounded-lg border border-slate-800">
                  {availableSkills.map((skill) => {
                    const isChecked = selectedSkills.includes(skill.skill_key);
                    return (
                      <label
                        key={skill.skill_key}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition ${
                          isChecked
                            ? 'bg-amber-500/15 border-amber-500/50 text-amber-200'
                            : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedSkills([...selectedSkills, skill.skill_key]);
                            } else {
                              setSelectedSkills(selectedSkills.filter((k) => k !== skill.skill_key));
                            }
                          }}
                          className="rounded bg-slate-800 border-slate-700 text-amber-500 focus:ring-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold truncate">{skill.name}</div>
                          <div className="text-[10px] opacity-60 font-mono">{skill.cost_mp}MP · {skill.target_type}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <div className="text-[11px] text-slate-500">
                  已为当前 NPC 实例选定 {selectedSkills.length} 门技能，战斗遭遇或出战时将按此装配施展法诀
                </div>
              </div>
            )}
          </div>

          {/* 交互类型 */}
          <div>
            <label className="block text-slate-400 mb-2 font-medium">交互类型</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setType('battle')}
                className={`p-3 rounded-xl border text-left flex items-start gap-3 transition ${
                  type === 'battle'
                    ? 'bg-amber-500/10 border-amber-500/60 text-amber-200'
                    : 'bg-[#0a0e16] border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 mt-0.5">
                  <Swords className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-100">战斗遭遇</div>
                  <div className="text-[11px] opacity-75 mt-0.5">单人遭遇或多敌战阵，玩家点击后进入实时战斗</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setType('dialogue')}
                className={`p-3 rounded-xl border text-left flex items-start gap-3 transition ${
                  type === 'dialogue'
                    ? 'bg-sky-500/10 border-sky-500/60 text-sky-200'
                    : 'bg-[#0a0e16] border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="p-2 rounded-lg bg-sky-500/20 text-sky-400 mt-0.5">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-100">对话人物</div>
                  <div className="text-[11px] opacity-75 mt-0.5">走神识对话树，不进入战斗</div>
                </div>
              </button>
            </div>
          </div>

          {type === 'battle' ? (
            <NpcEncounterConfigPanel
              value={{
                battleMode,
                battleGroupId,
                battleLevel,
                battleMemberLevels,
                respawnSeconds,
                onceFlag,
                rewardExp,
                rewardGold,
                rewardSilver,
                rewardItems,
              }}
              onChange={(patch) => {
                if (patch.battleMode !== undefined) setBattleMode(patch.battleMode);
                if (patch.battleGroupId !== undefined) setBattleGroupId(patch.battleGroupId);
                if (patch.battleLevel !== undefined) setBattleLevel(patch.battleLevel);
                if (patch.battleMemberLevels !== undefined) {
                  setBattleMemberLevels(patch.battleMemberLevels);
                }
                if (patch.respawnSeconds !== undefined) setRespawnSeconds(patch.respawnSeconds);
                if (patch.onceFlag !== undefined) setOnceFlag(patch.onceFlag);
                if (patch.rewardExp !== undefined) setRewardExp(patch.rewardExp);
                if (patch.rewardGold !== undefined) setRewardGold(patch.rewardGold);
                if (patch.rewardSilver !== undefined) setRewardSilver(patch.rewardSilver);
                if (patch.rewardItems !== undefined) setRewardItems(patch.rewardItems);
              }}
              monsterGroups={monsterGroups}
              items={availableItems}
              opponent={{ name, title, avatar }}
              loading={loadingDicts}
            />
          ) : (
            <div className="p-4 bg-[#0a0e16] border border-sky-500/30 rounded-xl space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2 text-sky-300 font-bold">
                  <ScrollText className="w-4 h-4" />
                  <span>剧情剧本与有向图对话挂载</span>
                </div>
                <a
                  href="/dialogues"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 transition"
                >
                  <span>剧本管理中心</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* 关联剧本 */}
              <div>
                <label className="block text-slate-300 mb-1 font-medium text-xs">
                  关联剧情剧本 (Dialogue Package)
                </label>
                <select
                  value={dialoguePackageId}
                  onChange={(e) => {
                    const pkgId = e.target.value;
                    setDialoguePackageId(pkgId);
                    setDialogueRootNodeId('');
                  }}
                  disabled={loadingDicts}
                  className="w-full px-3 py-2 bg-[#121722] border border-slate-700 rounded-xl text-sky-200 text-xs focus:outline-none focus:border-sky-400 disabled:opacity-50"
                >
                  <option value="">-- 不关联独立剧本（仅使用默认闲聊台词）--</option>
                  {dialoguePackages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      [{pkg.category === 'MAIN' ? '主线' : pkg.category === 'BRANCH' ? '支线' : pkg.category === 'ENCOUNTER' ? '奇遇' : '设施'}] {pkg.name} ({pkg.node_count || 0} 个节点) [ID: {pkg.id}]
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  选择后，玩家点击该 NPC 时将进入该剧本的有向图分支对话树，享受道具发放、任务流转与剧情判定。
                </p>
              </div>

              {/* 若选了剧本，展示起始节点与剧本卡片 */}
              {selectedPackage && (
                <div className="p-3 bg-[#121722] border border-sky-500/20 rounded-xl space-y-3">
                  <div>
                    <label className="block text-slate-300 mb-1 font-medium text-xs">
                      起始对话节点 (Root Node)
                    </label>
                    <select
                      value={dialogueRootNodeId}
                      onChange={(e) => setDialogueRootNodeId(e.target.value)}
                      disabled={loadingPackageNodes}
                      className="w-full px-3 py-1.5 bg-[#0a0e16] border border-slate-700 rounded-lg text-sky-200 text-xs focus:outline-none focus:border-sky-400"
                    >
                      <option value="">-- 使用剧本默认根节点 ({selectedPackage.default_root_node_id || '未设'}) --</option>
                      {packageNodes.map((node) => (
                        <option key={node.id} value={node.id}>
                          {node.chapter_title ? `${node.chapter_title} · ` : ''}{node.content.slice(0, 30)}... [ID: {node.id}]
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="text-[11px] text-slate-400 bg-sky-950/20 border border-sky-900/40 rounded-lg p-2.5 space-y-1">
                    <div className="font-semibold text-sky-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{selectedPackage.name}</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                        {selectedPackage.category}
                      </span>
                    </div>
                    {selectedPackage.description && (
                      <p className="text-slate-400 line-clamp-2">{selectedPackage.description}</p>
                    )}
                    <div className="text-slate-500 text-[10px] pt-1">
                      当前共 {selectedPackage.node_count || packageNodes.length} 个拓扑节点，默认根节点：
                      <span className="font-mono text-sky-400">{selectedPackage.default_root_node_id || '未设'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 闲聊台词与备用台词 */}
              <div className="pt-2 border-t border-slate-800 space-y-2.5">
                <div className="text-xs text-slate-400 font-medium">兜底 / 闲聊台词（未命中剧本或剧本结束后播放）</div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">默认对话台词</label>
                  <textarea
                    rows={2}
                    value={quote}
                    onChange={(e) => setQuote(e.target.value)}
                    placeholder="如：道友请了，九州仙途漫漫，且行且珍惜。"
                    className="w-full px-3 py-1.5 bg-[#121722] border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-sky-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">探听异闻台词 (蓝框备用)</label>
                  <textarea
                    rows={2}
                    value={gossip}
                    onChange={(e) => setGossip(e.target.value)}
                    placeholder="如：近来坊市灵脉略有波动，不知何故。"
                    className="w-full px-3 py-1.5 bg-[#121722] border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-sky-400"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-500">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-400/70" />
              模板负责基础属性，实例负责场景/等级/奖励
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition flex items-center gap-1.5 shadow-lg shadow-amber-500/20 disabled:opacity-50"
              >
                {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isEdit ? '保存修改' : '确认放置'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
