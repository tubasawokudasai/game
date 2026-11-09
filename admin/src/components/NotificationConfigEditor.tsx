import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CheckCircle2, Clock3, Info } from 'lucide-react';
import {
  GrantContentEditor,
  createGrantDraft,
  type GrantCatalogData,
  type GrantDraft,
} from './GrantContentEditor';
import type {
  LevelUpNotificationFixedRules,
  LevelUpNotificationVariable,
  NotificationGrant,
} from '../types';

/**
 * 后台「通知管理」通用通知配置组件。
 *
 * 从「玩家升级通知」页面抽离，统一所有通知事件的配置逻辑：
 * - 基础配置：固定业务规则 + 启用状态；
 * - 通知内容配置：已注册变量插入、标题、正文；
 * - 发放内容：复用 GrantContentEditor（道具 / 角色 / 货币），可为空。
 *
 * 剧情通知等其它通知事件直接复用本组件，保证与玩家升级通知行为一致。
 */

/** 通知配置中与「内容 + 发放」相关的通用字段 */
export interface NotificationConfigValue {
  enabled: boolean;
  title: string;
  content: string;
  grants: NotificationGrant[];
}

export interface NotificationContentDefaults {
  title: string;
  content: string;
}

/**
 * 剧情类通知（剧情通知资产 / 剧情节点触发器）共用的变量与默认文案。
 * 与后端 STORY_NOTIFICATION_VARIABLES / DEFAULT_STORY_NOTIFICATION_CONFIG 保持一致。
 */
export const STORY_NOTIFICATION_VARIABLES: LevelUpNotificationVariable[] = [
  { token: '{playerName}', label: '玩家名称', sample: '暮云清歌' },
  { token: '{chapterTitle}', label: '剧情节点章节', sample: '寒月流光 · 初识' },
  { token: '{packageName}', label: '剧本名称', sample: '寒月流光 · 初识清寒' },
  { token: '{nodeId}', label: '节点 ID', sample: 'node_luoqinghan_01' },
];

export const STORY_NOTIFICATION_DEFAULTS: NotificationContentDefaults = {
  title: '剧情推进',
  content: '少侠在【{chapterTitle}】中的抉择，已引动九州风云。',
};

const MAX_GRANTS = 20;
const MAX_CURRENCY = 999_999_999;

/* -------------------------------------------------------------------------- */
/* 发放内容：配置与草稿互转                                                    */
/* -------------------------------------------------------------------------- */

export const grantToDraft = (grant: NotificationGrant, index: number): GrantDraft => {
  if (grant.type === 'COMPANION') {
    return {
      ...createGrantDraft('COMPANION'),
      uid: `grant_${index}_${grant.memberKey}`,
      type: 'COMPANION',
      memberKey: grant.memberKey,
      level: grant.level,
      realm: grant.realm || '',
    };
  }

  if (grant.type === 'CURRENCY') {
    return {
      ...createGrantDraft('CURRENCY'),
      uid: `grant_${index}_currency`,
      type: 'CURRENCY',
      silver: grant.silver,
      ingot: grant.ingot,
      copper: grant.copper,
    };
  }

  return {
    ...createGrantDraft('ITEM'),
    uid: `grant_${index}_${grant.itemId}`,
    type: 'ITEM',
    itemId: grant.itemId,
    count: grant.quantity,
  };
};

export const grantsToDrafts = (grants?: NotificationGrant[] | null): GrantDraft[] => {
  if (!grants || grants.length === 0) {
    // 与系统发放保持一致的初始形态：保留一张空白道具卡片，
    // 不填写内容时保存即为空发放内容，不会创建奖励邮件。
    return [createGrantDraft('ITEM')];
  }

  return grants.map(grantToDraft);
};

/** 空白发放项（未选道具 / 未选角色 / 货币全为 0）视为「不发放」，保存时忽略 */
export const isDraftEmpty = (draft: GrantDraft): boolean => {
  if (draft.type === 'ITEM') return !draft.itemId;
  if (draft.type === 'COMPANION') return !draft.memberKey;
  return draft.silver + draft.ingot + draft.copper <= 0;
};

export const draftsToGrants = (drafts: GrantDraft[]): NotificationGrant[] =>
  drafts
    .filter((draft) => !isDraftEmpty(draft))
    .map((draft) => {
      if (draft.type === 'COMPANION') {
        return {
          type: 'COMPANION',
          memberKey: draft.memberKey,
          level: draft.level,
          realm: draft.realm.trim(),
        };
      }
      if (draft.type === 'CURRENCY') {
        return {
          type: 'CURRENCY',
          silver: draft.silver,
          ingot: draft.ingot,
          copper: draft.copper,
        };
      }
      return { type: 'ITEM', itemId: draft.itemId, quantity: draft.count };
    });

/**
 * 前端发放内容校验，与服务端保持同一套规则。
 * 返回错误文案；为空表示校验通过。
 */
export const validateNotificationGrants = (
  grants: NotificationGrant[] | undefined,
  catalog: GrantCatalogData
): string | null => {
  if (!grants) return null;
  if (grants.length > MAX_GRANTS) return `发放内容最多配置 ${MAX_GRANTS} 项`;

  const itemMap = new Map(catalog.items.map((item) => [item.id, item]));
  const companionMap = new Map(
    catalog.companions.map((companion) => [companion.member_key, companion])
  );

  const seenItemIds = new Set<string>();
  for (const [index, grant] of grants.entries()) {
    const label = `第 ${index + 1} 项发放`;

    if (grant.type === 'ITEM') {
      const item = itemMap.get(grant.itemId);
      if (!item) return `${label}：道具 ${grant.itemId} 不存在或不可发放`;
      if (seenItemIds.has(grant.itemId)) return `${label}：道具【${item.name}】重复添加`;
      seenItemIds.add(grant.itemId);
      if (!Number.isInteger(grant.quantity) || grant.quantity <= 0) {
        return `${label}：道具【${item.name}】的数量必须为正整数`;
      }
      if (grant.quantity > 99999) {
        return `${label}：道具【${item.name}】的数量不能超过 99999`;
      }
      continue;
    }

    if (grant.type === 'COMPANION') {
      const companion = companionMap.get(grant.memberKey);
      if (!companion) return `${label}：角色 ${grant.memberKey} 不存在或不可发放`;
      if (!Number.isInteger(grant.level) || grant.level <= 0) {
        return `${label}：角色【${companion.name}】的等级必须为正整数`;
      }
      if (grant.level > 9999) {
        return `${label}：角色【${companion.name}】的等级不能超过 9999`;
      }
      if ((grant.realm || '').trim().length > 64) {
        return `${label}：角色【${companion.name}】的境界不能超过 64 个字符`;
      }
      continue;
    }

    if (
      ![grant.silver, grant.ingot, grant.copper].every(
        (value) => Number.isInteger(value) && value >= 0
      )
    ) {
      return `${label}：纹银 / 元宝 / 铜钱数量必须为非负整数`;
    }
    if (Math.max(grant.silver, grant.ingot, grant.copper) > MAX_CURRENCY) {
      return `${label}：单项货币数量不能超过 ${MAX_CURRENCY}`;
    }
    if (grant.silver + grant.ingot + grant.copper <= 0) {
      return `${label}：至少需要填写一种货币数量`;
    }
  }

  return null;
};

/* -------------------------------------------------------------------------- */
/* 变量预览                                                                    */
/* -------------------------------------------------------------------------- */

export const renderNotificationPreview = (
  text: string,
  variables: LevelUpNotificationVariable[]
): string => {
  const samples = new Map(variables.map((variable) => [variable.token, variable.sample]));
  return String(text || '').replace(/\{[^{}]+\}/g, (token) => samples.get(token) ?? token);
};

/* -------------------------------------------------------------------------- */
/* 配置编辑器                                                                  */
/* -------------------------------------------------------------------------- */

export interface NotificationConfigEditorProps {
  value: NotificationConfigValue;
  onChange: (patch: Partial<NotificationConfigValue>) => void;
  catalog: GrantCatalogData;
  /** 已注册的可用变量（由后端 / 通知事件提供） */
  variables: LevelUpNotificationVariable[];
  /** 默认文案，仅用于输入框 placeholder */
  defaults?: NotificationContentDefaults;
  /** 固定业务规则（只读展示）；为空时隐藏基础配置卡片 */
  fixedRules?: LevelUpNotificationFixedRules | null;
  /** 是否展示 STEP 序号；嵌入节点触发器等场景可关闭 */
  showSteps?: boolean;
  /** 通知内容配置标题 */
  contentTitle?: string;
  /** 标题输入框下方提示；节点内联触发器可留空回退默认文案 */
  titleHelp?: string;
  /** 正文输入框下方提示 */
  contentHelp?: string;
  grantHint?: string;
  grantEmptyText?: string;
  grantFooterNote?: React.ReactNode;
}

export const NotificationConfigEditor: React.FC<NotificationConfigEditorProps> = ({
  value,
  onChange,
  catalog,
  variables,
  defaults,
  fixedRules,
  showSteps = true,
  contentTitle = '通知内容配置',
  titleHelp = '不能为空',
  contentHelp = '不能为空；未知变量会保持原样，不会执行表达式',
  grantHint,
  grantEmptyText = '当前发放内容为空，触发后只发送即时通知',
  grantFooterNote,
}) => {
  const [grantDrafts, setGrantDrafts] = useState<GrantDraft[]>(() => grantsToDrafts(value.grants));
  const lastEmittedGrantsRef = useRef<string>(JSON.stringify(value.grants || []));

  // 外部配置加载 / 重置时，重新生成草稿；内部编辑触发的 onChange 不会被覆盖
  useEffect(() => {
    const incoming = JSON.stringify(value.grants || []);
    if (incoming !== lastEmittedGrantsRef.current) {
      setGrantDrafts(grantsToDrafts(value.grants));
      lastEmittedGrantsRef.current = incoming;
    }
  }, [value.grants]);

  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  const grantCount = useMemo(
    () => grantDrafts.filter((draft) => !isDraftEmpty(draft)).length,
    [grantDrafts]
  );

  const handleGrantDraftsChange = (nextDrafts: GrantDraft[]) => {
    setGrantDrafts(nextDrafts);
    const grants = draftsToGrants(nextDrafts);
    lastEmittedGrantsRef.current = JSON.stringify(grants);
    onChange({ grants });
  };

  const insertVariable = (token: string, field: 'title' | 'content') => {
    const current = field === 'title' ? value.title : value.content;
    const element = field === 'title' ? titleRef.current : contentRef.current;

    if (!element) {
      onChange({ [field]: current + token } as Partial<NotificationConfigValue>);
      return;
    }

    const start = element.selectionStart ?? current.length;
    const end = element.selectionEnd ?? start;
    const next = current.slice(0, start) + token + current.slice(end);
    onChange({ [field]: next } as Partial<NotificationConfigValue>);

    window.requestAnimationFrame(() => {
      element.focus();
      const caret = start + token.length;
      element.setSelectionRange(caret, caret);
    });
  };

  return (
    <>
      {/* 基础配置 */}
      {fixedRules && (
        <section className="bg-[#121722] border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Info className="w-4 h-4 text-sky-400" />
              基础配置
            </h3>
            {showSteps && (
              <span className="text-[10px] text-slate-500 font-mono">STEP 01</span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { label: '通知名称', value: fixedRules.eventName, mono: false },
              { label: '事件编码', value: fixedRules.eventCode, mono: true },
              { label: '触发条件', value: fixedRules.triggerCondition, mono: false },
              { label: '执行动作', value: fixedRules.action, mono: false },
              { label: '通知对象', value: fixedRules.target, mono: false },
            ].map((field) => (
              <div
                key={field.label}
                className="rounded-xl bg-[#0d121b] border border-slate-800 px-3 py-2.5"
              >
                <div className="text-[10px] text-slate-500">{field.label}</div>
                <div
                  className={`mt-1 text-xs text-slate-200 ${
                    field.mono ? 'font-mono text-amber-300' : ''
                  }`}
                >
                  {field.value}
                </div>
              </div>
            ))}

            <div className="rounded-xl bg-[#0d121b] border border-slate-800 px-3 py-2.5 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] text-slate-500">启用状态</div>
                <div className="mt-1 text-xs text-slate-200">
                  {value.enabled ? '已启用，触发时发送通知' : '已关闭，触发时不发送通知'}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(value.enabled)}
                onClick={() => onChange({ enabled: !value.enabled })}
                className={`relative w-12 h-6 rounded-full border transition flex-shrink-0 ${
                  value.enabled
                    ? 'bg-emerald-500/25 border-emerald-400/60'
                    : 'bg-slate-800 border-slate-600'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-[18px] h-[18px] rounded-full transition-all ${
                    value.enabled ? 'left-[26px] bg-emerald-300' : 'left-0.5 bg-slate-400'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="text-[10px] text-slate-500 leading-relaxed">
            触发条件、执行动作与通知对象为固定业务规则，当前不支持规则编辑器；
            关闭启用状态后将同时停止即时通知与奖励邮件。
          </div>
        </section>
      )}

      {/* 通知内容 */}
      <section className="bg-[#121722] border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-400" />
            {contentTitle}
          </h3>
          {showSteps && (
            <span className="text-[10px] text-slate-500 font-mono">
              {fixedRules ? 'STEP 02' : 'STEP 01'}
            </span>
          )}
        </div>

        <div className="rounded-xl bg-sky-500/5 border border-sky-500/20 p-3">
          <div className="text-[10px] text-sky-300/90 mb-2">
            可用变量（点击插入到光标位置，仅支持以下已注册变量）
          </div>
          <div className="flex flex-wrap gap-1.5">
            {variables.map((variable) => (
              <span
                key={variable.token}
                className="inline-flex items-center gap-1 text-[10px] text-slate-300"
              >
                <button
                  type="button"
                  onClick={() => insertVariable(variable.token, 'title')}
                  className="px-2 py-1 rounded-md bg-slate-800/80 border border-slate-700 hover:border-amber-500/50 hover:text-amber-300 font-mono transition"
                  title={`插入到标题：${variable.label}`}
                >
                  {variable.token}
                </button>
                <button
                  type="button"
                  onClick={() => insertVariable(variable.token, 'content')}
                  className="px-2 py-1 rounded-md bg-slate-800/40 border border-slate-700/70 text-slate-400 hover:text-amber-300 hover:border-amber-500/40 transition"
                  title={`插入到内容：${variable.label}`}
                >
                  正文
                </button>
                <span className="text-slate-600">·</span>
                <span className="text-slate-500">{variable.label}</span>
              </span>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="text-[10px] text-slate-500">通知标题</span>
          <input
            ref={titleRef}
            value={value.title}
            maxLength={64}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder={defaults?.title}
            className="mt-1 w-full px-3 py-2 bg-[#090d14] border border-slate-700/80 rounded-xl text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-400"
          />
          <span className="text-[10px] text-slate-600 mt-1 block">
            {(value.title || '').length}/64 · {titleHelp}
          </span>
        </label>

        <label className="block">
          <span className="text-[10px] text-slate-500">通知内容</span>
          <textarea
            ref={contentRef}
            value={value.content}
            maxLength={1000}
            rows={4}
            onChange={(e) => onChange({ content: e.target.value })}
            placeholder={defaults?.content}
            className="mt-1 w-full px-3 py-2 bg-[#090d14] border border-slate-700/80 rounded-xl text-xs text-slate-200 leading-relaxed placeholder-slate-600 focus:outline-none focus:border-amber-400"
          />
          <span className="text-[10px] text-slate-600 mt-1 block">
            {(value.content || '').length}/1000 · {contentHelp}
          </span>
        </label>
      </section>

      {/* 发放内容：复用系统发放页的 GrantContentEditor（道具 / 角色 / 货币） */}
      <GrantContentEditor
        drafts={grantDrafts}
        onChange={handleGrantDraftsChange}
        catalog={catalog}
        minItems={0}
        title="发放内容"
        hint={grantHint ?? (grantCount > 0 ? `已配置 ${grantCount} 项发放内容` : '可为空')}
        step={showSteps ? (fixedRules ? 'STEP 03' : 'STEP 02') : undefined}
        addLabel="添加发放项（道具 / 角色 / 货币）"
        emptyText={grantEmptyText}
        preventDuplicateItems
        footerNote={
          grantFooterNote ?? (
            <div className="text-[10px] text-slate-600 leading-relaxed">
              未选择道具 / 角色或货币全为 0 的空白发放项不会被保存；
              发放内容只在玩家于邮箱点击「领取」后生效。
            </div>
          )
        }
      />
    </>
  );
};

/* -------------------------------------------------------------------------- */
/* 通知预览                                                                    */
/* -------------------------------------------------------------------------- */

export interface NotificationPreviewPanelProps {
  title: string;
  content: string;
  variables: LevelUpNotificationVariable[];
  grants: NotificationGrant[];
  catalog: GrantCatalogData;
  enabled: boolean;
  updatedAt?: string | null;
  updatedBy?: string | null;
  showMeta?: boolean;
  heading?: string;
  /** 奖励邮件说明前缀，如「升级成功后创建」 */
  mailSummaryPrefix?: string;
  grantListTitle?: string;
  className?: string;
  footer?: React.ReactNode;
}

export const NotificationPreviewPanel: React.FC<NotificationPreviewPanelProps> = ({
  title,
  content,
  variables,
  grants = [],
  catalog,
  enabled,
  updatedAt,
  updatedBy,
  showMeta = true,
  heading = '通知预览',
  mailSummaryPrefix = '触发成功后创建',
  grantListTitle = '发放清单',
  className = '',
  footer,
}) => {
  const itemMap = useMemo(() => new Map(catalog.items.map((item) => [item.id, item])), [catalog.items]);
  const companionMap = useMemo(
    () => new Map(catalog.companions.map((companion) => [companion.member_key, companion])),
    [catalog.companions]
  );
  const grantCount = grants.length;

  return (
    <section
      className={`bg-[#121722] border border-slate-800 rounded-2xl p-5 space-y-4 ${className}`}
    >
      <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        {heading}
      </h3>

      <div className="rounded-xl border border-amber-500/30 bg-gradient-to-b from-amber-500/10 to-transparent p-4">
        <div className="flex items-center gap-2 text-[10px] text-amber-300/80 mb-2">
          <Bell className="w-3.5 h-3.5" />
          即时通知
        </div>
        <div className="text-sm font-bold text-amber-200 break-words">
          {renderNotificationPreview(title, variables) || '（通知标题为空）'}
        </div>
        <div className="mt-1 text-xs text-slate-300 leading-relaxed break-words">
          {renderNotificationPreview(content, variables) || '（通知内容为空）'}
        </div>
      </div>

      <div className="space-y-2 text-[11px]">
        <div className="flex items-start justify-between gap-2 py-2 border-b border-slate-800">
          <span className="text-slate-500 flex-shrink-0">启用状态</span>
          <span className={enabled ? 'text-emerald-300 text-right' : 'text-slate-400 text-right'}>
            {enabled ? '启用' : '关闭'}
          </span>
        </div>
        <div className="flex items-start justify-between gap-2 py-2 border-b border-slate-800">
          <span className="text-slate-500 flex-shrink-0">奖励邮件</span>
          <span className="text-slate-200 text-right">
            {grantCount > 0
              ? `${mailSummaryPrefix}（${grantCount} 项发放内容）`
              : '不创建'}
          </span>
        </div>
        {showMeta && (
          <>
            <div className="flex items-start justify-between gap-2 py-2 border-b border-slate-800">
              <span className="text-slate-500 flex-shrink-0">最近修改</span>
              <span className="text-slate-400 text-right flex items-center gap-1">
                <Clock3 className="w-3 h-3" />
                {updatedAt
                  ? String(updatedAt).replace('T', ' ').replace(/\.\d+Z?$/, '')
                  : '—'}
              </span>
            </div>
            <div className="flex items-start justify-between gap-2 py-2 border-b border-slate-800">
              <span className="text-slate-500 flex-shrink-0">修改人</span>
              <span className="text-slate-300 text-right font-mono">{updatedBy || '—'}</span>
            </div>
          </>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-[10px] text-slate-500">{grantListTitle}</div>
        {grantCount === 0 ? (
          <div className="rounded-lg bg-[#0d121b] border border-slate-800 px-3 py-2 text-[11px] text-slate-500">
            无发放内容
          </div>
        ) : (
          grants.map((grant, index) => {
            let name = '';
            let detail = '';

            if (grant.type === 'ITEM') {
              name = itemMap.get(grant.itemId)?.name || grant.itemId;
              detail = `x${grant.quantity}`;
            } else if (grant.type === 'COMPANION') {
              name = companionMap.get(grant.memberKey)?.name || grant.memberKey;
              detail = grant.realm
                ? `Lv.${grant.level} · ${grant.realm}`
                : `Lv.${grant.level}`;
            } else {
              name = '货币补给';
              detail =
                [
                  grant.silver ? `纹银 ${grant.silver}` : '',
                  grant.ingot ? `元宝 ${grant.ingot}` : '',
                  grant.copper ? `铜钱 ${grant.copper}` : '',
                ]
                  .filter(Boolean)
                  .join(' / ') || '未填写';
            }

            return (
              <div
                key={`${index}_${name}_${detail}`}
                className="flex items-center justify-between gap-2 p-2 rounded-xl bg-[#0d121b] border border-slate-800"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 h-5 rounded bg-slate-800 text-[9px] text-slate-400 flex items-center justify-center font-mono flex-shrink-0">
                    {index + 1}
                  </span>
                  <span className="text-xs text-slate-200 truncate">{name}</span>
                </div>
                <span className="text-[10px] text-amber-300/90 font-mono flex-shrink-0">
                  {detail}
                </span>
              </div>
            );
          })
        )}
      </div>

      {footer}
    </section>
  );
};

export default NotificationConfigEditor;
