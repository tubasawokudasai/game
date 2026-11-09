import { NpcType } from '../types/game';

export interface NpcTypeMeta {
  key: string;
  label: string;
  icon: string;
  actionText: string;
  badgeClass: string;
  btnClass: string;
  emptyDesc: string;
}

/**
 * 剧情对话特化元数据（当 NPC 为剧情对话或关联剧情剧本时使用）
 */
export const STORY_DIALOGUE_META: NpcTypeMeta = {
  key: 'story',
  label: '剧情',
  icon: 'auto_stories',
  actionText: '剧情',
  badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-[0_0_8px_rgba(245,158,11,0.2)]',
  btnClass: 'bg-gradient-to-r from-amber-950/60 to-amber-900/40 text-amber-300 border border-amber-600/50 hover:border-amber-400 hover:text-amber-200 shadow-sm',
  emptyDesc: '「当前场景暂无剧情仙家」',
};

/**
 * NPC 类型元数据配置表（易于后续灵活扩展新类型，如 trade, task 等）
 */
export const NPC_TYPE_CONFIG: Record<string, NpcTypeMeta> = {
  dialogue: {
    key: 'dialogue',
    label: '对话',
    icon: 'chat_bubble',
    actionText: '交谈',
    badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    btnClass: 'bg-surface-container-highest text-primary hover:bg-primary-container hover:text-on-primary-container',
    emptyDesc: '「当前场景暂无仙家对谈」',
  },
  battle: {
    key: 'battle',
    label: '战斗',
    icon: 'swords',
    actionText: '切磋',
    badgeClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    btnClass: 'bg-rose-950/40 text-rose-300 border border-rose-700/50 hover:bg-rose-900/60 hover:text-rose-100',
    emptyDesc: '「当前场景暂无切磋仙家」',
  },
};

/**
 * 默认 NPC 类型
 */
export const DEFAULT_NPC_TYPE = 'dialogue';

/**
 * 获取 NPC 类型的元数据配置，支持未预置类型的动态兜底扩展
 * 若 NPC 关联剧情（isStoryNpc 为 true 或拥有 storyPackageId），优先返回剧情专属元数据与图标
 */
export function getNpcTypeMeta(type?: NpcType, isStory?: boolean): NpcTypeMeta {
  if (isStory) {
    return STORY_DIALOGUE_META;
  }
  const normalizedKey = (type || DEFAULT_NPC_TYPE).toLowerCase();
  if (NPC_TYPE_CONFIG[normalizedKey]) {
    return NPC_TYPE_CONFIG[normalizedKey];
  }

  // 兜底动态生成
  return {
    key: normalizedKey,
    label: normalizedKey.toUpperCase(),
    icon: 'person',
    actionText: '互动',
    badgeClass: 'bg-primary/10 text-primary border-primary/30',
    btnClass: 'bg-surface-container-highest text-primary hover:bg-primary-container',
    emptyDesc: '「暂无此类仙家」',
  };
}

/**
 * 江湖人物分类导航 Tab 定义（预置 + 支持动态识别未知类型）
 */
export interface NpcCategoryTabItem {
  key: string;
  label: string;
}

export const BASE_NPC_TABS: NpcCategoryTabItem[] = [
  { key: 'all', label: '全部' },
  { key: 'dialogue', label: '对话' },
  { key: 'battle', label: '战斗' },
];
