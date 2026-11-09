import React, { useState, useEffect } from 'react';
import {
  X,
  Save,
  Trash2,
  Plus,
  MessageSquare,
  Sparkles,
  Split,
  MapPin,
  BellRing,
  ArrowUp,
  ArrowDown,
  BookOpen,
  Link2,
  Ban,
  Swords,
  Gift,
} from 'lucide-react';
import {
  DialogueNodeItem,
  DialogueOptionItem,
  DialoguePage,
  DialogueFlowMode,
  DialogueTriggerAction,
  NpcTemplateItem,
  MonsterGroupItem,
  SceneItem,
  StoryNotificationItem,
} from '../../types';
import { getNodePages, serializePagesToContent } from './graphTypes';
import { NpcEncounterConfigPanel } from '../NpcEncounterConfigPanel';
import type { GrantCatalogData } from '../GrantContentEditor';
import {
  NotificationConfigEditor,
  STORY_NOTIFICATION_DEFAULTS,
  STORY_NOTIFICATION_VARIABLES,
  validateNotificationGrants,
} from '../NotificationConfigEditor';

interface DialogueNodeModalProps {
  isOpen: boolean;
  node: DialogueNodeItem | null;
  allNodes: DialogueNodeItem[];
  npcTemplates: NpcTemplateItem[];
  monsterGroups?: MonsterGroupItem[];
  scenes: SceneItem[];
  storyNotifications: StoryNotificationItem[];
  grantCatalog?: GrantCatalogData;
  isRootNode: boolean;
  onClose: () => void;
  onSaveNode: (
    updatedNode: DialogueNodeItem,
    optionsToSave: DialogueOptionItem[],
    optionsToDelete: string[],
    makeRoot: boolean
  ) => Promise<void>;
  onDeleteNode: (nodeId: string) => Promise<void>;
}

export const DialogueNodeModal: React.FC<DialogueNodeModalProps> = ({
  isOpen,
  node,
  allNodes,
  npcTemplates,
  monsterGroups = [],
  scenes,
  storyNotifications,
  grantCatalog = { items: [], companions: [] },
  isRootNode,
  onClose,
  onSaveNode,
  onDeleteNode,
}) => {
  const [npcId, setNpcId] = useState('');
  const [chapterTitle, setChapterTitle] = useState('');
  const [pages, setPages] = useState<DialoguePage[]>([]);
  const [flowMode, setFlowMode] = useState<DialogueFlowMode>('branch');
  const [directNextNodeId, setDirectNextNodeId] = useState('');
  const [quoteBox, setQuoteBox] = useState('');
  const [sceneId, setSceneId] = useState('');
  const [onEnterActions, setOnEnterActions] = useState<DialogueTriggerAction[]>([]);
  const [onCompleteActions, setOnCompleteActions] = useState<DialogueTriggerAction[]>([]);
  const [isRoot, setIsRoot] = useState(false);
  const [options, setOptions] = useState<DialogueOptionItem[]>([]);
  const [deletedOptionIds, setDeletedOptionIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (node && isOpen) {
      setNpcId(node.npc_id || 'speaker');
      setChapterTitle(node.chapter_title || '');

      // 多段台词：优先 node.pages；旧 content 通过 getNodePages 兼容解析
      const initialPages = getNodePages(node);
      setPages(
        initialPages.length > 0
          ? initialPages.map((page) => ({ ...page }))
          : [{ speaker_id: 'speaker', content: '' }]
      );

      setQuoteBox(node.quote_box || '');
      setSceneId(node.scene_id || '');
      setOnEnterActions(
        Array.isArray(node.on_enter_actions) ? node.on_enter_actions.map((a) => ({ ...a })) : []
      );
      setOnCompleteActions(
        Array.isArray(node.on_complete_actions)
          ? node.on_complete_actions.map((a) => ({ ...a }))
          : []
      );
      setIsRoot(isRootNode);

      // 深度拷贝选项以供修改
      const initialOptions = (node.options || []).map((opt) => ({
        ...opt,
        actions: opt.actions ? [...opt.actions] : [],
      }));
      setOptions(initialOptions);

      // 流向模式：有选项 = 分支；否则看是否有直连；都没有 = 结束
      const initialMode: DialogueFlowMode =
        initialOptions.length > 0
          ? 'branch'
          : node.direct_next_node_id
            ? 'direct'
            : 'end';
      setFlowMode(initialMode);
      setDirectNextNodeId(node.direct_next_node_id || '');

      setDeletedOptionIds([]);
      setErrorMsg('');
    }
  }, [node, isOpen, isRootNode]);

  if (!isOpen || !node) return null;

  // ---------------------------------------------------------------------------
  // 多段台词 (Pages) 编辑
  // ---------------------------------------------------------------------------
  const handleAddPage = () => {
    setPages((prev) => [
      ...prev,
      {
        speaker_id: prev[prev.length - 1]?.speaker_id || 'speaker',
        content: '',
      },
    ]);
  };

  const handleUpdatePage = (index: number, patch: Partial<DialoguePage>) => {
    setPages((prev) => prev.map((page, i) => (i === index ? { ...page, ...patch } : page)));
  };

  const handleRemovePage = (index: number) => {
    setPages((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const handleMovePage = (index: number, direction: -1 | 1) => {
    setPages((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const speakerSelectOptions = (currentSpeakerId?: string) => {
    const optionsList = [
      { value: 'speaker', label: `默认同节点 NPC${npcId ? ` (${npcId})` : ''}` },
      { value: 'player', label: '主角' },
      { value: 'narrator', label: '旁白' },
      ...npcTemplates.map((t) => ({ value: t.id, label: `${t.name} (${t.id})` })),
    ];
    if (
      currentSpeakerId &&
      !optionsList.some((option) => option.value === currentSpeakerId)
    ) {
      optionsList.push({
        value: currentSpeakerId,
        label: `自定义：${currentSpeakerId}`,
      });
    }
    return optionsList;
  };

  // 流向模式切换：切到直连/结束时保留 options 状态，保存时统一加入删除列表
  const handleFlowModeChange = (mode: DialogueFlowMode) => {
    setFlowMode(mode);
    if (mode !== 'direct') {
      setDirectNextNodeId('');
    }
  };

  // 添加新选项
  const handleAddOption = () => {
    const newOpt: DialogueOptionItem = {
      id: `opt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      node_id: node.id,
      sort_order: options.length + 1,
      text: '继续对话',
      action_label: '继续',
      style_type: 'NORMAL',
      next_node_id: null,
      actions: [],
    };
    setOptions([...options, newOpt]);
  };

  // 修改单个选项字段
  const handleUpdateOption = (index: number, field: keyof DialogueOptionItem, value: any) => {
    setOptions((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  // 删除单个选项
  const handleRemoveOption = (index: number) => {
    const opt = options[index];
    if (opt.id && !opt.id.startsWith('opt_temp_')) {
      setDeletedOptionIds((prev) => [...prev, opt.id]);
    }
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  // ---------------------------------------------------------------------------
  // 选项战斗配置：与地图 NPC 共用「遭遇模式与实例参数」面板
  // ---------------------------------------------------------------------------
  interface StoryEncounterConfig {
    templateId: string;
    battleMode: 'SOLO' | 'GROUP';
    battleGroupId?: string | null;
    battleLevel: number;
    battleMemberLevels?: Record<string, number>;
    battleReward?: {
      exp?: number;
      gold?: number;
      silver?: number;
      items?: Array<{ id: string; name?: string; count: number }>;
    };
    respawnSeconds?: number;
    onceFlag?: string | null;
  }

  interface StartEncounterAction {
    type: 'START_ENCOUNTER';
    npcId?: string;
    encounter?: StoryEncounterConfig;
    winNodeId?: string;
    loseNodeId?: string;
  }

  const getEncounterAction = (
    option: DialogueOptionItem
  ): StartEncounterAction | undefined => {
    const actions = Array.isArray(option.actions) ? option.actions : [];
    return actions.find(
      (action: any) => action && action.type === 'START_ENCOUNTER'
    ) as StartEncounterAction | undefined;
  };

  const defaultEncounterConfig = (): StoryEncounterConfig => {
    const defaultTemplate =
      npcTemplates.find((tpl) => tpl.id === npcId)?.id || npcTemplates[0]?.id || '';
    return {
      templateId: defaultTemplate,
      battleMode: 'SOLO',
      battleGroupId: null,
      battleLevel: 1,
      battleMemberLevels: {},
      battleReward: { exp: 0, gold: 0, silver: 0, items: [] },
      respawnSeconds: 0,
      onceFlag: null,
    };
  };

  const setOptionBattleEnabled = (index: number, enabled: boolean) => {
    setOptions((prev) => {
      const next = [...prev];
      const option = { ...next[index] };
      const actions = Array.isArray(option.actions) ? [...option.actions] : [];
      const cleaned = actions.filter(
        (action: any) =>
          action?.type !== 'START_ENCOUNTER' && action?.type !== 'START_COMBAT'
      );

      if (enabled) {
        cleaned.push({
          type: 'START_ENCOUNTER',
          npcId: '',
          encounter: defaultEncounterConfig(),
          winNodeId: undefined,
          loseNodeId: undefined,
        });
        // 战斗选项默认给一个醒目的红色“出战”样式
        option.action_label = option.action_label || '出战';
        option.style_type = option.style_type === 'NORMAL' ? 'RED' : option.style_type;
        option.next_node_id = null;
      }

      option.actions = cleaned;
      next[index] = option;
      return next;
    });
  };

  const updateOptionEncounter = (
    index: number,
    patch: Partial<StartEncounterAction>
  ) => {
    setOptions((prev) => {
      const next = [...prev];
      const option = { ...next[index] };
      const actions = Array.isArray(option.actions) ? [...option.actions] : [];
      const actionIndex = actions.findIndex(
        (action: any) => action?.type === 'START_ENCOUNTER'
      );

      if (actionIndex >= 0) {
        actions[actionIndex] = { ...actions[actionIndex], ...patch };
      } else {
        actions.push({ type: 'START_ENCOUNTER', npcId: '', ...patch });
      }

      option.actions = actions;
      next[index] = option;
      return next;
    });
  };

  const updateEncounterConfig = (
    index: number,
    patch: Partial<StoryEncounterConfig>
  ) => {
    const option = options[index];
    const action = getEncounterAction(option);
    const current = action?.encounter || defaultEncounterConfig();
    updateOptionEncounter(index, {
      encounter: { ...current, ...patch },
    });
  };

  const toPanelValue = (encounter?: StoryEncounterConfig) => ({
    battleMode: encounter?.battleMode || 'SOLO',
    battleGroupId: encounter?.battleGroupId || '',
    battleLevel: encounter?.battleLevel || 1,
    battleMemberLevels: encounter?.battleMemberLevels || {},
    respawnSeconds: encounter?.respawnSeconds || 0,
    onceFlag: encounter?.onceFlag || '',
    rewardExp: encounter?.battleReward?.exp || 0,
    rewardGold: encounter?.battleReward?.gold || 0,
    rewardSilver: encounter?.battleReward?.silver || 0,
    rewardItems: (encounter?.battleReward?.items || []).map((item) => ({
      id: item.id,
      name: item.name || item.id,
      count: item.count,
    })),
  });

  const mergeEncounterConfig = (
    encounter: StoryEncounterConfig | undefined,
    patch: Partial<ReturnType<typeof toPanelValue>>
  ): StoryEncounterConfig => {
    const base = encounter || defaultEncounterConfig();
    return {
      ...base,
      battleMode: patch.battleMode ?? base.battleMode,
      battleGroupId:
        patch.battleGroupId !== undefined ? patch.battleGroupId : base.battleGroupId,
      battleLevel: patch.battleLevel ?? base.battleLevel,
      battleMemberLevels: patch.battleMemberLevels ?? base.battleMemberLevels,
      respawnSeconds: patch.respawnSeconds ?? base.respawnSeconds,
      onceFlag: patch.onceFlag !== undefined ? patch.onceFlag : base.onceFlag,
      battleReward: {
        exp: patch.rewardExp ?? base.battleReward?.exp ?? 0,
        gold: patch.rewardGold ?? base.battleReward?.gold ?? 0,
        silver: patch.rewardSilver ?? base.battleReward?.silver ?? 0,
        items: patch.rewardItems ?? base.battleReward?.items ?? [],
      },
    };
  };

  // 提交保存
  const handleSave = async () => {
    // 1. 台词页校验：至少保留 1 句非空台词
    const normalizedPages: DialoguePage[] = pages
      .map((page) => ({
        speaker_id: page.speaker_id?.trim() || undefined,
        content: page.content.trim(),
      }))
      .filter((page) => page.content.length > 0);

    if (normalizedPages.length === 0) {
      setErrorMsg('节点至少需要 1 句非空台词！');
      return;
    }

    // 2. 分支模式下的战斗选项校验
    if (flowMode === 'branch') {
      for (const [index, option] of options.entries()) {
        const action = getEncounterAction(option);
        if (!action) continue;
        if (!action.encounter?.templateId) {
          setErrorMsg(`战斗选项 #${index + 1} 必须选择「战斗角色模板」！`);
          return;
        }
        if (action.encounter.battleMode === 'GROUP' && !action.encounter.battleGroupId) {
          setErrorMsg(`战斗选项 #${index + 1} 的多人战阵必须选择战斗配置！`);
          return;
        }
      }
    }

    // 3. 节点触发器内联发放内容校验（绑定通知资产时由通知管理统一校验）
    const triggerGroups = [
      { label: '进入节点通知', actions: onEnterActions },
      { label: '完成节点通知', actions: onCompleteActions },
    ];
    for (const group of triggerGroups) {
      for (const [index, trigger] of group.actions.entries()) {
        if (trigger.notificationId) continue;
        const triggerError = validateNotificationGrants(
          trigger.grants || [],
          grantCatalog
        );
        if (triggerError) {
          setErrorMsg(`${group.label} 第 ${index + 1} 项：${triggerError}`);
          return;
        }
      }
    }

    // 4. 流向校验
    if (flowMode === 'direct') {
      if (!directNextNodeId) {
        setErrorMsg('线性直连模式必须选择一个“直接跳转至节点”！');
        return;
      }
      if (directNextNodeId === node.id) {
        setErrorMsg('直连目标不能是当前节点自身！');
        return;
      }
    }

    try {
      setSaving(true);
      setErrorMsg('');

      const updatedNode: DialogueNodeItem = {
        ...node,
        npc_id: npcId.trim() || 'speaker',
        chapter_title: chapterTitle.trim() || null,
        content: serializePagesToContent(normalizedPages),
        pages: normalizedPages,
        direct_next_node_id: flowMode === 'direct' ? directNextNodeId : null,
        quote_box: quoteBox.trim() || null,
        scene_id: sceneId || null,
        on_enter_actions: onEnterActions,
        on_complete_actions: onCompleteActions,
      };

      // 3. 分支模式：正常保存 options；直连/结束模式：清空全部旧分支
      const normalizedOptions = options.map((opt, i) => ({
        ...opt,
        sort_order: i + 1,
        node_id: node.id,
      }));

      const persistedOptionIds = new Set<string>();
      (node.options || []).forEach((opt) => {
        if (opt.id && !opt.id.startsWith('opt_temp_')) persistedOptionIds.add(opt.id);
      });
      options.forEach((opt) => {
        if (opt.id && !opt.id.startsWith('opt_temp_')) persistedOptionIds.add(opt.id);
      });

      const optionsToSave = flowMode === 'branch' ? normalizedOptions : [];
      const optionsToDelete =
        flowMode === 'branch'
          ? deletedOptionIds
          : Array.from(new Set([...deletedOptionIds, ...persistedOptionIds]));

      await onSaveNode(updatedNode, optionsToSave, optionsToDelete, isRoot);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  // 删除当前节点
  const handleDelete = async () => {
    if (window.confirm(`确定要彻底删除节点【${node.id}】及其所有分支选项吗？此操作无法撤销。`)) {
      try {
        setSaving(true);
        await onDeleteNode(node.id);
        onClose();
      } catch (err: any) {
        setErrorMsg(err.message || '删除节点失败');
      } finally {
        setSaving(false);
      }
    }
  };

  const EVENT_LABELS: Record<string, string> = {
    ANY: '任意时机',
    ENTER: '进入节点',
    COMPLETE: '完成节点',
  };

  const packageNotifications = storyNotifications.filter(
    (n) => n.package_id === node.package_id
  );

  const addTrigger = (
    setList: React.Dispatch<React.SetStateAction<DialogueTriggerAction[]>>
  ) => {
    setList((prev) => [
      ...prev,
      {
        type: 'SEND_NOTIFICATION',
        once: true,
        title: '',
        content: '',
        grants: [],
      },
    ]);
  };

  const updateTrigger = (
    list: DialogueTriggerAction[],
    setList: React.Dispatch<React.SetStateAction<DialogueTriggerAction[]>>,
    index: number,
    patch: Partial<DialogueTriggerAction>
  ) => {
    setList(list.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const renderTriggerGroup = (
    title: string,
    hint: string,
    list: DialogueTriggerAction[],
    setList: React.Dispatch<React.SetStateAction<DialogueTriggerAction[]>>
  ) => (
    <div className="p-3.5 bg-[#0a0e16] border border-violet-500/25 rounded-xl space-y-2.5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-violet-200 flex items-center gap-1.5">
            <BellRing className="w-3.5 h-3.5" />
            {title}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">{hint}</div>
        </div>
        <button
          type="button"
          onClick={() => addTrigger(setList)}
          className="px-2.5 py-1 rounded-lg bg-violet-500/10 border border-violet-500/30 text-violet-300 hover:bg-violet-500/20 text-xs flex items-center gap-1 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          新增通知
        </button>
      </div>

      {list.length === 0 ? (
        <div className="text-[11px] text-slate-600 py-1">
          暂无触发器。新增后可绑定「通知管理」中的通知，或在本节点内联配置通知内容与发放内容。
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((trigger, index) => {
            const boundNotification = trigger.notificationId
              ? packageNotifications.find((n) => n.id === trigger.notificationId)
              : undefined;

            return (
            <div key={index} className="p-2.5 rounded-lg bg-[#121724] border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-violet-300 font-medium flex items-center gap-1.5">
                  <BellRing className="w-3 h-3" />
                  系统通知 · SEND_NOTIFICATION
                </span>
                <button
                  type="button"
                  onClick={() => setList(list.filter((_, i) => i !== index))}
                  className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-rose-500/10 transition"
                  title="删除该触发器"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <select
                value={trigger.notificationId || ''}
                onChange={(e) =>
                  updateTrigger(list, setList, index, {
                    notificationId: e.target.value || undefined,
                  })
                }
                className="w-full px-2.5 py-1.5 bg-[#090d16] border border-slate-700 rounded-md text-xs text-slate-100 focus:outline-none focus:border-violet-400"
              >
                <option value="">-- 未绑定通知（在本节点内联配置内容与发放）--</option>
                {packageNotifications.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name} [{EVENT_LABELS[n.trigger_event] || n.trigger_event}]
                  </option>
                ))}
              </select>

              {trigger.notificationId ? (
                <div className="text-[10px] text-slate-400 bg-[#0a0e16] border border-slate-800 rounded-md px-2.5 py-1.5 space-y-1">
                  <div>
                    使用通知管理中的配置：
                    <span className="text-violet-200">
                      {' '}
                      {boundNotification?.title || '已绑定通知'}
                    </span>
                  </div>
                  {boundNotification?.content && (
                    <div className="text-slate-500 leading-relaxed">
                      {boundNotification.content}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-[10px] text-amber-300/90">
                    <Gift className="w-3 h-3" />
                    {(boundNotification?.grants?.length || 0) > 0
                      ? `${boundNotification?.grants.length} 项发放内容`
                      : '未配置发放内容'}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-[#0a0e16] border border-slate-800 p-2.5">
                  <div className="text-[10px] text-slate-500 mb-1">
                    内联通知配置：与玩家升级通知使用同一套「通知内容 + 发放内容」逻辑
                  </div>
                  <NotificationConfigEditor
                    value={{
                      enabled: true,
                      title: trigger.title || '',
                      content: trigger.content || '',
                      grants: trigger.grants || [],
                    }}
                    onChange={({ enabled: _enabled, ...patch }) =>
                      updateTrigger(list, setList, index, patch)
                    }
                    catalog={grantCatalog}
                    variables={STORY_NOTIFICATION_VARIABLES}
                    defaults={STORY_NOTIFICATION_DEFAULTS}
                    fixedRules={null}
                    showSteps={false}
                    contentTitle="内联通知内容"
                    titleHelp="留空时使用通知管理中的默认标题"
                    contentHelp="留空时使用通知管理中的默认正文；未知变量会保持原样"
                    grantEmptyText="当前发放内容为空，触发后只发送即时通知"
                  />
                </div>
              )}
              <label className="flex items-center gap-2 text-[11px] text-slate-400">
                <input
                  type="checkbox"
                  checked={trigger.once !== false}
                  onChange={(e) =>
                    updateTrigger(list, setList, index, { once: e.target.checked })
                  }
                  className="rounded text-violet-500 focus:ring-0 w-3.5 h-3.5"
                />
                仅首次触发（推荐，避免重复弹窗）
              </label>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#0e1422] border border-slate-700/80 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl shadow-black/80 overflow-hidden">
        {/* 标题栏 */}
        <div className="px-6 py-4 bg-[#141b2e] border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-100">编辑剧情节点</h3>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-sky-300 border border-slate-700">
                  {node.id}
                </span>
                {isRoot && (
                  <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    <span>剧本起始根节点</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                调整此节点的说话人、台词对白以及引出的有向分支连线
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 表单内容区 */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              {errorMsg}
            </div>
          )}

          {/* 基础信息行：说话人、章节、设为根节点 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 说话人 (npc_id) */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                说话人 / NPC 标识
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={npcId}
                  onChange={(e) => setNpcId(e.target.value)}
                  placeholder="如: tpl_luoqinghan"
                  className="w-full px-3 py-2 bg-[#090d16] border border-slate-700 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-amber-400"
                />
              </div>
              {npcTemplates.length > 0 && (
                <div className="mt-1 flex items-center gap-1">
                  <span className="text-[10px] text-slate-500">快捷选择:</span>
                  <select
                    className="text-[11px] bg-transparent text-sky-400 border-none outline-none cursor-pointer hover:underline"
                    onChange={(e) => e.target.value && setNpcId(e.target.value)}
                    value=""
                  >
                    <option value="" disabled>
                      匹配已有 NPC 模板...
                    </option>
                    {npcTemplates.map((t) => (
                      <option key={t.id} value={t.id} className="bg-slate-900 text-slate-200">
                        {t.name} ({t.id})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* 章节 / 幕次标题 */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                章节段落标题 (选填)
              </label>
              <input
                type="text"
                value={chapterTitle}
                onChange={(e) => setChapterTitle(e.target.value)}
                placeholder="如: 寒月流光 · 初识"
                className="w-full px-3 py-2 bg-[#090d16] border border-slate-700 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* 设为剧本默认根节点 */}
            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 p-2 bg-[#090d16] border border-slate-700 rounded-lg cursor-pointer hover:border-slate-500 transition">
                <input
                  type="checkbox"
                  checked={isRoot}
                  onChange={(e) => setIsRoot(e.target.checked)}
                  className="rounded text-amber-500 focus:ring-0 w-4 h-4"
                />
                <span className="text-xs text-slate-200 font-medium">设为剧本起始根节点</span>
              </label>
            </div>
          </div>

          {/* 剧情发生地图 (scene_id) */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              剧情发生地图 (Node Scene)
            </label>
            <select
              value={sceneId}
              onChange={(e) => setSceneId(e.target.value)}
              className="w-full px-3 py-2 bg-[#090d16] border border-slate-700 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-emerald-400"
            >
              <option value="">-- 未指定（沿用 NPC 实例当前所在地图）--</option>
              <option value="__hidden__">-- 隐藏（该节点期间 NPC 不出现在任何地图）--</option>
              {scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.id})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              绑定剧本的 NPC 只会在玩家当前剧情节点所在地图出现；未指定时回退到 NPC 实例所在地图（兼容旧数据）。
              若本剧本尚未挂载地图 NPC，保存根节点时会在该地图自动生成一个剧情 NPC。
            </p>
          </div>

          {/* 多段线性台词 (pages) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-bold text-slate-100">多段线性台词 (Pages)</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                  共 {pages.length} 句
                </span>
              </div>
              <button
                type="button"
                onClick={handleAddPage}
                className="px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 text-xs flex items-center gap-1 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>添加下一句</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              玩家点击「继续」在本节点内逐句翻页，不会产生新的图节点或连线。发言人默认继承节点 NPC，也可切换为主角 / 旁白 / 其他 NPC。
            </p>

            <div className="space-y-2">
              {pages.map((page, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-[#090d16] border border-slate-800 rounded-xl space-y-2 hover:border-slate-700 transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
                      <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 font-mono text-[10px] flex items-center justify-center font-bold">
                        {idx + 1}
                      </span>
                      第 {idx + 1} 句
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleMovePage(idx, -1)}
                        disabled={idx === 0}
                        className="p-1 rounded text-slate-500 hover:text-sky-300 hover:bg-sky-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
                        title="上移"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMovePage(idx, 1)}
                        disabled={idx === pages.length - 1}
                        className="p-1 rounded text-slate-500 hover:text-sky-300 hover:bg-sky-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
                        title="下移"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemovePage(idx)}
                        disabled={pages.length <= 1}
                        className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
                        title={pages.length <= 1 ? '至少保留 1 句台词' : '删除该句'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                    <div className="md:col-span-4">
                      <select
                        value={page.speaker_id || 'speaker'}
                        onChange={(e) =>
                          handleUpdatePage(idx, { speaker_id: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 bg-[#121724] border border-slate-700 rounded-md text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
                      >
                        {speakerSelectOptions(page.speaker_id).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-8">
                      <textarea
                        rows={2}
                        value={page.content}
                        onChange={(e) => handleUpdatePage(idx, { content: e.target.value })}
                        placeholder="请输入这一句台词..."
                        className="w-full px-2.5 py-1.5 bg-[#121724] border border-slate-700 rounded-md text-xs text-slate-100 focus:outline-none focus:border-cyan-400 leading-relaxed"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 旁白 / 题外语 / 引用框 (quote_box) */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              旁白引用框 (quote_box，选填，用作剧情感悟或副标题)
            </label>
            <input
              type="text"
              value={quoteBox}
              onChange={(e) => setQuoteBox(e.target.value)}
              placeholder="如: “心若止水，神莹内敛；冰魄流转，诸邪不侵。”"
              className="w-full px-3 py-2 bg-[#090d16] border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-amber-400"
            />
          </div>

          {/* 节点触发器：进入 / 完成节点时发送系统通知 */}
          <div className="pt-2 border-t border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BellRing className="w-4 h-4 text-violet-400" />
                <span className="text-sm font-bold text-slate-100">节点触发器 (Node Triggers)</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/30">
                  已接入通知管理
                </span>
              </div>
              <a
                href="/notifications/story-trigger"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-violet-300 hover:text-violet-200 underline underline-offset-2"
              >
                管理通知
              </a>
            </div>
            {renderTriggerGroup(
              '进入节点时',
              '玩家首次进入该节点时触发，可用于剧情推进提示。',
              onEnterActions,
              setOnEnterActions
            )}
            {renderTriggerGroup(
              '完成节点时',
              '玩家选择选项或直连继续离开该节点时触发，可用于任务完成通知。',
              onCompleteActions,
              setOnCompleteActions
            )}
          </div>

          {/* 流向模式：分支 / 直连 / 结束 */}
          <div className="pt-2 border-t border-slate-800 space-y-3">
            <div className="flex items-center gap-2">
              <Split className="w-4 h-4 text-sky-400" />
              <span className="text-sm font-bold text-slate-100">节点流向模式</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/30">
                分支与直连互斥
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {(
                [
                  {
                    value: 'branch' as const,
                    label: '分支选项模式',
                    desc: '翻完台词后由玩家选择',
                    icon: Split,
                    activeClass: 'border-sky-400 bg-sky-500/10 text-sky-200',
                  },
                  {
                    value: 'direct' as const,
                    label: '线性直连模式',
                    desc: '自动进入下一节点',
                    icon: Link2,
                    activeClass: 'border-cyan-400 bg-cyan-500/10 text-cyan-200',
                  },
                  {
                    value: 'end' as const,
                    label: '对话结束模式',
                    desc: '不跳转，直接结束',
                    icon: Ban,
                    activeClass: 'border-slate-400 bg-slate-500/10 text-slate-200',
                  },
                ]
              ).map((mode) => {
                const Icon = mode.icon;
                const active = flowMode === mode.value;
                return (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => handleFlowModeChange(mode.value)}
                    className={`text-left p-2.5 rounded-xl border transition ${
                      active
                        ? `${mode.activeClass} shadow-sm`
                        : 'border-slate-800 bg-[#090d16] text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-xs font-semibold">
                      <Icon className="w-3.5 h-3.5" />
                      {mode.label}
                    </span>
                    <span className="block text-[10px] mt-0.5 opacity-70">{mode.desc}</span>
                  </button>
                );
              })}
            </div>

            {flowMode === 'branch' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Split className="w-4 h-4 text-sky-400" />
                    <span className="text-sm font-bold text-slate-100">
                      分支连线选项 (Dialogue Options)
                    </span>
                    <span className="text-xs text-slate-500">共 {options.length} 项</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddOption}
                    className="px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-300 hover:bg-sky-500/20 text-xs flex items-center gap-1 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>新增分支选项</span>
                  </button>
                </div>

                {options.length === 0 ? (
                  <div className="p-4 rounded-xl bg-[#090d16] border border-dashed border-slate-800 text-center text-xs text-slate-500">
                    当前节点暂无分支选项。玩家翻完所有台词后，对话框将只显示「告辞离去」。
                    点击右上角【新增分支选项】可拉出有向分支连线。
                  </div>
                ) : (
                  <div className="space-y-3">
                    {options.map((opt, idx) => {
                      const encounterAction = getEncounterAction(opt);
                      const battleEnabled = Boolean(encounterAction);

                      return (
                      <div
                        key={opt.id || idx}
                        className="p-3.5 bg-[#090d16] border border-slate-800 rounded-xl space-y-2.5 hover:border-slate-700 transition"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 font-mono text-xs flex items-center justify-center font-bold">
                              {idx + 1}
                            </span>
                            <span className="text-xs font-medium text-slate-300">
                              选项 #{idx + 1}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveOption(idx)}
                            className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-rose-500/10 transition"
                            title="删除该选项"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
                          {/* 选项文本 (text) */}
                          <div className="md:col-span-5">
                            <input
                              type="text"
                              value={opt.text}
                              onChange={(e) => handleUpdateOption(idx, 'text', e.target.value)}
                              placeholder="选项台词文本，如: 诚挚相邀 · 请仙子结伴"
                              className="w-full px-2.5 py-1.5 bg-[#121724] border border-slate-700 rounded-md text-xs text-slate-100 focus:outline-none focus:border-amber-400"
                            />
                          </div>

                          {/* 按钮徽标 (action_label) */}
                          <div className="md:col-span-2">
                            <input
                              type="text"
                              value={opt.action_label || ''}
                              onChange={(e) =>
                                handleUpdateOption(idx, 'action_label', e.target.value)
                              }
                              placeholder="徽标，如: 同行"
                              className="w-full px-2.5 py-1.5 bg-[#121724] border border-slate-700 rounded-md text-xs text-slate-100 focus:outline-none focus:border-amber-400"
                            />
                          </div>

                          {/* 风格样式 (style_type) */}
                          <div className="md:col-span-2">
                            <select
                              value={opt.style_type || 'NORMAL'}
                              onChange={(e) =>
                                handleUpdateOption(idx, 'style_type', e.target.value as any)
                              }
                              className="w-full px-2 py-1.5 bg-[#121724] border border-slate-700 rounded-md text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                            >
                              <option value="NORMAL">默认 (天蓝)</option>
                              <option value="GOLD">重要 (金黄)</option>
                              <option value="RED">危险 (朱红)</option>
                              <option value="GRAY">作罢 (幽灰)</option>
                            </select>
                          </div>

                          {/* 下一跳转节点 (next_node_id - 连线终点)；战斗选项时由胜/败节点接管 */}
                          {!battleEnabled && (
                            <div className="md:col-span-3">
                              <select
                                value={opt.next_node_id || ''}
                                onChange={(e) =>
                                  handleUpdateOption(idx, 'next_node_id', e.target.value || null)
                                }
                                className="w-full px-2 py-1.5 bg-[#121724] border border-sky-500/40 rounded-md text-xs text-sky-300 font-mono focus:outline-none focus:border-sky-400"
                              >
                                <option value="">🔚 对话结束 (无后续)</option>
                                {allNodes
                                  .filter((n) => n.id !== node.id)
                                  .map((n) => (
                                    <option key={n.id} value={n.id}>
                                      → {n.id} {n.chapter_title ? `(${n.chapter_title})` : ''}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          )}
                        </div>

                        {/* 战斗选项：与地图 NPC 共用「遭遇模式与实例参数」面板 */}
                        <div className="pt-2 border-t border-slate-800/70 space-y-2">
                          <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={battleEnabled}
                              onChange={(e) =>
                                setOptionBattleEnabled(idx, e.target.checked)
                              }
                              className="rounded text-rose-500 focus:ring-0 w-3.5 h-3.5"
                            />
                            <span className="flex items-center gap-1.5">
                              <Swords className="w-3.5 h-3.5 text-rose-400" />
                              战斗选项（进入剧情战斗）
                            </span>
                          </label>

                          {battleEnabled && encounterAction && (
                            <div className="space-y-2.5">
                              <NpcEncounterConfigPanel
                                value={toPanelValue(encounterAction.encounter)}
                                onChange={(patch) =>
                                  updateOptionEncounter(idx, {
                                    encounter: mergeEncounterConfig(
                                      encounterAction.encounter,
                                      patch
                                    ),
                                  })
                                }
                                monsterGroups={monsterGroups}
                                items={grantCatalog.items}
                                opponent={{
                                  name:
                                    npcTemplates.find(
                                      (tpl) => tpl.id === encounterAction.encounter?.templateId
                                    )?.name || '',
                                  title:
                                    npcTemplates.find(
                                      (tpl) => tpl.id === encounterAction.encounter?.templateId
                                    )?.title || '',
                                  avatar:
                                    npcTemplates.find(
                                      (tpl) => tpl.id === encounterAction.encounter?.templateId
                                    )?.avatar || '',
                                }}
                                opponentTemplateSelector={
                                  <div>
                                    <label className="block text-[10px] text-slate-400 mb-1">
                                      战斗角色模板 *
                                    </label>
                                    <select
                                      value={encounterAction.encounter?.templateId || ''}
                                      onChange={(e) =>
                                        updateEncounterConfig(idx, {
                                          templateId: e.target.value,
                                        })
                                      }
                                      className="w-full px-2 py-1.5 bg-[#121724] border border-rose-500/40 rounded-md text-xs text-rose-200 focus:outline-none focus:border-rose-400"
                                    >
                                      <option value="">-- 选择 NPC 模板 --</option>
                                      {npcTemplates.map((tpl) => (
                                        <option key={tpl.id} value={tpl.id}>
                                          {tpl.name} ({tpl.id})
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                }
                              />

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                <div>
                                  <label className="block text-[10px] text-slate-400 mb-1">
                                    胜利后节点
                                  </label>
                                  <select
                                    value={encounterAction.winNodeId || ''}
                                    onChange={(e) =>
                                      updateOptionEncounter(idx, {
                                        winNodeId: e.target.value || undefined,
                                      })
                                    }
                                    className="w-full px-2 py-1.5 bg-[#121724] border border-slate-700 rounded-md text-xs text-slate-200 focus:outline-none focus:border-emerald-400"
                                  >
                                    <option value="">-- 战斗后结束对话 --</option>
                                    {allNodes
                                      .filter((n) => n.id !== node.id)
                                      .map((n) => (
                                        <option key={n.id} value={n.id}>
                                          → {n.id} {n.chapter_title ? `(${n.chapter_title})` : ''}
                                        </option>
                                      ))}
                                  </select>
                                </div>

                                <div>
                                  <label className="block text-[10px] text-slate-400 mb-1">
                                    失败后节点
                                  </label>
                                  <select
                                    value={encounterAction.loseNodeId || ''}
                                    onChange={(e) =>
                                      updateOptionEncounter(idx, {
                                        loseNodeId: e.target.value || undefined,
                                      })
                                    }
                                    className="w-full px-2 py-1.5 bg-[#121724] border border-slate-700 rounded-md text-xs text-slate-200 focus:outline-none focus:border-rose-400"
                                  >
                                    <option value="">-- 战斗后结束对话 --</option>
                                    {allNodes
                                      .filter((n) => n.id !== node.id)
                                      .map((n) => (
                                        <option key={n.id} value={n.id}>
                                          → {n.id} {n.chapter_title ? `(${n.chapter_title})` : ''}
                                        </option>
                                      ))}
                                  </select>
                                </div>
                              </div>

                              <p className="text-[10px] text-slate-500">
                                战斗角色按选项保存为一份剧情战斗定义，不创建地图常驻 NPC；节点结束后不会残留在人物列表。
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {flowMode === 'direct' && (
              <div className="p-3.5 rounded-xl bg-cyan-500/5 border border-cyan-500/25 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-cyan-200 flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" />
                    直接跳转至节点 (Linear Next)
                  </span>
                  {(node.options || []).length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/30">
                      保存后删除原有 {node.options?.length} 个分支选项
                    </span>
                  )}
                </div>

                <select
                  value={directNextNodeId}
                  onChange={(e) => setDirectNextNodeId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#090d16] border border-cyan-500/40 rounded-lg text-sm text-cyan-200 font-mono focus:outline-none focus:border-cyan-400"
                >
                  <option value="">-- 请选择下一节点 --</option>
                  {allNodes
                    .filter((n) => n.id !== node.id)
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        → {n.id} {n.chapter_title ? `(${n.chapter_title})` : ''}
                      </option>
                    ))}
                </select>

                <p className="text-[11px] text-slate-400">
                  玩家翻完本节点最后一句台词后，对话框会显示「继续」按钮，点击后直接进入目标节点，无需创建分支选项。
                  保存时原有分支选项会被清理。
                </p>
                {allNodes.filter((n) => n.id !== node.id).length === 0 && (
                  <p className="text-[11px] text-rose-300">
                    当前剧本只有这一个节点，请先创建至少一个其它节点后再设置直连。
                  </p>
                )}
              </div>
            )}

            {flowMode === 'end' && (
              <div className="p-3.5 rounded-xl bg-slate-500/5 border border-slate-600/30 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                  <Ban className="w-3.5 h-3.5" />
                  对话结束模式
                </div>
                <p className="text-[11px] text-slate-400">
                  玩家翻完本节点最后一句台词后，对话框只显示「告辞离去」；不会创建分支选项，也不会跳转下一节点。
                </p>
                {((node.options || []).length > 0 || node.direct_next_node_id) && (
                  <p className="text-[11px] text-rose-300">
                    保存后将清空原有 {node.options?.length || 0} 个分支选项
                    {node.direct_next_node_id ? '，并移除直连' : ''}。
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 底部按钮栏 */}
        <div className="px-6 py-4 bg-[#141b2e] border-t border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="px-3.5 py-2 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            <span>删除节点</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 text-xs font-medium transition"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? '保存中...' : '保存节点与流向'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
