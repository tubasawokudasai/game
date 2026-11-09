import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { adminApi } from '../services/api';
import {
  GrantContentEditor,
  type GrantDraft,
  createGrantDraft,
} from '../components/GrantContentEditor';
import {
  AdminStats,
  CompanionTemplateItem,
  ItemTemplateItem,
  PlayerItem,
  SystemGrantItemPayload,
  SystemGrantResponse,
} from '../types';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Coins,
  Gift,
  Package,
  RefreshCw,
  Search,
  Send,
  Sword,
  Users,
} from 'lucide-react';

/**
 * 后台系统发放页 (SystemGrant)
 *
 * 业务链路：
 * 1. 选择收件玩家（或全服 / 在线）
 * 2. 编辑系统邮件标题与正文
 * 3. 动态添加发放项：道具 / 角色 / 货币
 * 4. 后端写入带附件的系统邮件
 * 5. 玩家在游戏内邮箱点击"领取"后，才真正落库到背包 / 队伍 / 钱庄
 *
 * 设计说明：发放项采用数组 + 类型分支渲染，后续扩展"装备/称号/灵宠"时，
 * 新增一个 GrantDraft 类型分支与对应表单即可，邮件与领取链路无需重写。
 */

export const SystemGrant: React.FC = () => {
  const location = useLocation();
  const presetPlayer = (location.state as { player?: PlayerItem } | null)?.player || null;

  const [catalog, setCatalog] = useState<{
    items: ItemTemplateItem[];
    companions: CompanionTemplateItem[];
  }>({ items: [], companions: [] });
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  // 收件人
  const [receiverMode, setReceiverMode] = useState<'single' | 'all' | 'online'>('single');
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerItem | null>(presetPlayer);
  const [keyword, setKeyword] = useState('');
  const [playerOptions, setPlayerOptions] = useState<PlayerItem[]>([]);
  const [searching, setSearching] = useState(false);

  // 邮件
  const [senderName, setSenderName] = useState('天道宗师 (GM)');
  const [title, setTitle] = useState('【系统发放】仙途福泽');
  const [content, setContent] = useState(
    '道友仙鉴：天道垂青，特赐下仙缘福泽。请查收随信赏赐，领取后即刻生效。'
  );
  const [expireDays, setExpireDays] = useState(30);

  // 发放项
  const [drafts, setDrafts] = useState<GrantDraft[]>([createGrantDraft('ITEM')]);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SystemGrantResponse | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ type, text });
    window.setTimeout(() => setToast(null), 3600);
  };

  const loadCatalog = async () => {
    setLoading(true);
    try {
      const [catalogRes, statsRes] = await Promise.all([
        adminApi.getGrantCatalog(),
        adminApi.getStats().catch(() => null),
      ]);
      setCatalog({
        items: catalogRes.items || [],
        companions: catalogRes.companions || [],
      });
      if (statsRes) setStats(statsRes);
    } catch (err: any) {
      showToast(err.message || '加载发放模版目录失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadPlayerOptions = async (kw = '') => {
    setSearching(true);
    try {
      const res = await adminApi.getPlayers({
        page: 1,
        pageSize: 12,
        keyword: kw.trim() || undefined,
      });
      setPlayerOptions(res.list || []);
    } catch (err: any) {
      showToast(err.message || '检索玩家失败', 'error');
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    loadCatalog();
    loadPlayerOptions();
  }, []);

  // 模版加载后为空白发放项补默认值（不覆盖用户已选内容）
  useEffect(() => {
    if (catalog.items.length === 0 && catalog.companions.length === 0) return;
    setDrafts((prev) =>
      prev.map((draft) => {
        if (draft.type === 'ITEM' && !draft.itemId && catalog.items[0]) {
          return { ...draft, itemId: catalog.items[0].id };
        }
        if (draft.type === 'COMPANION' && !draft.memberKey && catalog.companions[0]) {
          return {
            ...draft,
            memberKey: catalog.companions[0].member_key,
            level: 1,
            realm: '',
          };
        }
        return draft;
      })
    );
  }, [catalog]);

  const itemMap = useMemo(
    () => new Map(catalog.items.map((item) => [item.id, item])),
    [catalog.items]
  );
  const companionMap = useMemo(
    () => new Map(catalog.companions.map((c) => [c.member_key, c])),
    [catalog.companions]
  );

  const applyMailPreset = (preset: 'compensation' | 'activity' | 'welcome') => {
    if (preset === 'compensation') {
      setTitle('【系统补偿】仙途致歉与补偿');
      setContent('道友仙鉴：近日九州灵脉波动，给道友带来不便，特奉上薄礼以表歉意。感谢道友一路同行。');
    } else if (preset === 'activity') {
      setTitle('【活动奖励】仙盟论道嘉奖');
      setContent('道友仙鉴：道友于仙盟论道中表现卓绝，特此颁下活动嘉奖。愿道友道心澄明，早日登临绝顶。');
    } else {
      setTitle('【初入仙途】宗门接引礼');
      setContent('道友仙鉴：恭喜道友踏入长乐仙途，宗门特备接引薄礼，愿道友仙路顺遂、道法精进。');
    }
  };

  const validate = (): string[] => {
    const errors: string[] = [];
    if (receiverMode === 'single' && !selectedPlayer) {
      errors.push('请先选择一位收件玩家');
    }
    if (!title.trim()) errors.push('邮件标题不能为空');
    if (!content.trim()) errors.push('邮件正文不能为空');
    if (drafts.length === 0) errors.push('至少需要添加一项发放内容');

    for (const [index, draft] of drafts.entries()) {
      const label = `第 ${index + 1} 项发放`;
      if (draft.type === 'ITEM') {
        if (!draft.itemId) errors.push(`${label}：请选择道具`);
        if (!Number.isFinite(draft.count) || draft.count < 1) errors.push(`${label}：数量必须大于 0`);
      } else if (draft.type === 'COMPANION') {
        if (!draft.memberKey) errors.push(`${label}：请选择 NPC 模板`);
        if (!Number.isFinite(draft.level) || draft.level < 1) errors.push(`${label}：角色等级必须大于 0`);
      } else {
        if (draft.silver + draft.ingot + draft.copper <= 0) {
          errors.push(`${label}：至少填写一种货币数量`);
        }
      }
    }

    return errors;
  };

  const buildGrantPayload = (): SystemGrantItemPayload[] =>
    drafts.map((draft) => {
      if (draft.type === 'ITEM') {
        return {
          type: 'ITEM',
          itemId: draft.itemId,
          count: Math.max(1, Math.round(draft.count)),
        };
      }
      if (draft.type === 'COMPANION') {
        return {
          type: 'COMPANION',
          memberKey: draft.memberKey,
          level: Math.max(1, Math.round(draft.level)),
          realm: draft.realm.trim() || undefined,
        };
      }
      return {
        type: 'CURRENCY',
        silver: Math.max(0, Math.round(draft.silver)),
        ingot: Math.max(0, Math.round(draft.ingot)),
        copper: Math.max(0, Math.round(draft.copper)),
      };
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validate();
    if (errors.length > 0) {
      showToast(errors[0], 'error');
      return;
    }

    if (
      receiverMode === 'all' &&
      !window.confirm(
        `确认向全服 ${stats?.totalPlayers ?? '所有'} 位在册修仙者发送系统发放邮件吗？`
      )
    ) {
      return;
    }

    if (
      receiverMode === 'online' &&
      !window.confirm('确认向当前所有在线修仙者发送系统发放邮件吗？')
    ) {
      return;
    }

    setSubmitting(true);
    setResult(null);
    try {
      const res = await adminApi.sendSystemGrant({
        receiverMode,
        receiverId: receiverMode === 'single' ? selectedPlayer?.id : undefined,
        senderName: senderName.trim() || '天道宗师 (GM)',
        title: title.trim(),
        content: content.trim(),
        expireDays,
        grants: buildGrantPayload(),
      });
      setResult(res);
      showToast(res.message || '系统发放已写入邮箱，等待玩家领取', 'success');
    } catch (err: any) {
      showToast(err.message || '系统发放失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const receiverSummary =
    receiverMode === 'single'
      ? selectedPlayer
        ? `${selectedPlayer.nickname} (${selectedPlayer.id})`
        : '尚未选择收件玩家'
      : receiverMode === 'all'
        ? `全服 ${stats?.totalPlayers ?? '—'} 位在册修仙者`
        : '当前所有在线修仙者';

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-sm border backdrop-blur-md ${
            toast.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/40'
              : 'bg-red-950/90 text-red-200 border-red-500/40'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-400" />
          )}
          <span>{toast.text}</span>
        </div>
      )}

      {/* 页头 */}
      <div className="bg-[#121722] border border-slate-800 rounded-2xl p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Gift className="w-5 h-5 text-amber-400" />
              <span>系统发放 · 邮件直达</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              选择道具、角色或货币，以系统邮件形式发放。玩家点击
              <span className="text-amber-300 font-semibold">「领取附件」</span>
              后才会写入背包 / 队伍 / 钱庄。
            </p>
          </div>
          <button
            onClick={loadCatalog}
            disabled={loading}
            className="self-start md:self-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs flex items-center gap-2 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>刷新模版目录</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          {/* 收件人 */}
          <section className="bg-[#121722] border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-400" />
                收件人
              </h3>
              <span className="text-[10px] text-slate-500 font-mono">STEP 01</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'single' as const, label: '指定玩家', desc: '单人定向发放' },
                { key: 'all' as const, label: '全服玩家', desc: '所有在册道友' },
                { key: 'online' as const, label: '在线玩家', desc: '当前长连接道友' },
              ].map((mode) => (
                <button
                  key={mode.key}
                  type="button"
                  onClick={() => setReceiverMode(mode.key)}
                  className={`p-3 rounded-xl border text-left transition ${
                    receiverMode === mode.key
                      ? 'bg-sky-500/10 border-sky-500/40 text-sky-200'
                      : 'bg-[#0d121b] border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-semibold">{mode.label}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{mode.desc}</div>
                </button>
              ))}
            </div>

            {receiverMode === 'single' ? (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          loadPlayerOptions(keyword);
                        }
                      }}
                      placeholder="按道号 / UUID / 账号名搜索..."
                      className="w-full pl-9 pr-3 py-2 bg-[#090d14] border border-slate-700/80 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-400"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => loadPlayerOptions(keyword)}
                    disabled={searching}
                    className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-xl text-xs transition disabled:opacity-50"
                  >
                    {searching ? '检索中...' : '搜索'}
                  </button>
                </div>

                {selectedPlayer && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-sky-500/10 border border-sky-500/30">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-300 font-bold">
                        {selectedPlayer.nickname.slice(0, 1)}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-100">
                          {selectedPlayer.nickname}
                          <span className="ml-2 text-[10px] text-amber-300 font-normal">
                            {selectedPlayer.realm} · Lv.{selectedPlayer.level}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-slate-500">
                          {selectedPlayer.id} · {selectedPlayer.sect}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedPlayer(null)}
                      className="text-[10px] text-slate-400 hover:text-red-300 transition"
                    >
                      取消选择
                    </button>
                  </div>
                )}

                {playerOptions.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                    {playerOptions.map((player) => (
                      <button
                        key={player.id}
                        type="button"
                        onClick={() => setSelectedPlayer(player)}
                        className={`p-2.5 rounded-xl border text-left transition ${
                          selectedPlayer?.id === player.id
                            ? 'bg-sky-500/15 border-sky-500/50'
                            : 'bg-[#0d121b] border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="text-xs font-semibold text-slate-200 truncate">
                          {player.nickname}
                          <span className="ml-1.5 text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                            {player.is_guest ? '散修' : '正式'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono truncate">
                          {player.id} · {player.realm}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200/90 leading-relaxed">
                {receiverMode === 'all'
                  ? `将向全服 ${stats?.totalPlayers ?? '—'} 位在册道友各发送一封系统邮件，请谨慎操作。`
                  : '将向当前保持 WebSocket 长连接的道友发送；离线玩家不会收到，可改用全服模式。'}
              </div>
            )}
          </section>

          {/* 邮件内容 */}
          <section className="bg-[#121722] border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Send className="w-4 h-4 text-amber-400" />
                系统邮件
              </h3>
              <span className="text-[10px] text-slate-500 font-mono">STEP 02</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                { key: 'compensation' as const, label: '系统补偿' },
                { key: 'activity' as const, label: '活动奖励' },
                { key: 'welcome' as const, label: '新手接引' },
              ].map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => applyMailPreset(preset.key)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800/70 hover:bg-amber-500/15 hover:text-amber-300 text-slate-300 border border-slate-700 text-[10px] transition"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="block">
                <span className="text-[10px] text-slate-500">发件人</span>
                <input
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  className="mt-1 w-full px-3 py-2 bg-[#090d14] border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="text-[10px] text-slate-500">邮件标题</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full px-3 py-2 bg-[#090d14] border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-[10px] text-slate-500">邮件正文</span>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                className="mt-1 w-full px-3 py-2 bg-[#090d14] border border-slate-700/80 rounded-xl text-xs text-slate-200 leading-relaxed focus:outline-none focus:border-amber-400"
              />
            </label>

            <label className="block w-40">
              <span className="text-[10px] text-slate-500">有效期（天）</span>
              <input
                type="number"
                min={1}
                max={365}
                value={expireDays}
                onChange={(e) => setExpireDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                className="mt-1 w-full px-3 py-2 bg-[#090d14] border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-400"
              />
            </label>
          </section>

          {/* 发放内容：复用通用 GrantContentEditor */}
          <GrantContentEditor
            drafts={drafts}
            onChange={setDrafts}
            catalog={catalog}
            title="发放内容"
            hint="可混合添加，玩家一次领取全部"
            step="STEP 03"
          />
        </div>

        {/* 右侧：预览与提交 */}
        <div className="space-y-6">
          <section className="bg-[#121722] border border-slate-800 rounded-2xl p-5 space-y-4 sticky top-20">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              发放预览
            </h3>

            <div className="space-y-2 text-[11px]">
              <div className="flex items-start justify-between gap-2 py-2 border-b border-slate-800">
                <span className="text-slate-500 flex-shrink-0">收件人</span>
                <span className="text-slate-200 text-right">{receiverSummary}</span>
              </div>
              <div className="flex items-start justify-between gap-2 py-2 border-b border-slate-800">
                <span className="text-slate-500 flex-shrink-0">邮件标题</span>
                <span className="text-amber-200 text-right">{title || '—'}</span>
              </div>
              <div className="flex items-start justify-between gap-2 py-2 border-b border-slate-800">
                <span className="text-slate-500 flex-shrink-0">有效期</span>
                <span className="text-slate-200">{expireDays} 天</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[10px] text-slate-500">发放清单</div>
              {drafts.map((draft, index) => {
                let name = '未选择';
                let detail = '';
                if (draft.type === 'ITEM') {
                  name = itemMap.get(draft.itemId)?.name || '未选择道具';
                  detail = `x${draft.count}`;
                } else if (draft.type === 'COMPANION') {
                  name = companionMap.get(draft.memberKey)?.name || '未选择角色';
                  detail = `Lv.${draft.level}`;
                } else {
                  name = '货币补给';
                  detail = [
                    draft.silver ? `纹银 ${draft.silver}` : '',
                    draft.ingot ? `元宝 ${draft.ingot}` : '',
                    draft.copper ? `铜钱 ${draft.copper}` : '',
                  ]
                    .filter(Boolean)
                    .join(' / ');
                }

                return (
                  <div
                    key={draft.uid}
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
              })}
            </div>

            {/*发放仅写入玩家邮箱，玩家需在游戏内邮箱点击「领取附件」后才会生效。角色领取后进入名册休息，不自动出战；重复领取只提升等级。*/}

            <button
              type="submit"
              disabled={submitting || loading}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold text-sm hover:brightness-110 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  正在写入系统邮件...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  发送系统发放邮件
                </>
              )}
            </button>

            {result && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                <div className="flex items-center gap-2 text-xs text-emerald-300 font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  {result.message}
                </div>
                <div className="text-[10px] text-emerald-200/80 font-mono">
                  收件人数：{result.recipientCount} · 邮件数：{result.mailIds.length}
                </div>
                <div className="space-y-1">
                  {result.grants.map((grant, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between text-[10px] text-slate-300"
                    >
                      <span className="flex items-center gap-1.5">
                        {grant.type === 'ITEM' ? (
                          <Package className="w-3 h-3 text-amber-400" />
                        ) : grant.type === 'COMPANION' ? (
                          <Sword className="w-3 h-3 text-violet-400" />
                        ) : (
                          <Coins className="w-3 h-3 text-emerald-400" />
                        )}
                        {grant.name}
                      </span>
                      <span className="font-mono text-slate-500">{grant.detail}</span>
                    </div>
                  ))}
                </div>
                {result.tip && (
                  <div className="text-[10px] text-emerald-200/60 leading-relaxed">{result.tip}</div>
                )}
                <button
                  type="button"
                  onClick={() => setResult(null)}
                  className="w-full py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-200 text-[10px] border border-emerald-500/30 transition flex items-center justify-center gap-1"
                >
                  继续发放
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </section>
        </div>
      </form>
    </div>
  );
};
