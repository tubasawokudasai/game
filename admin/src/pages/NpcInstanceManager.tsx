import React, { useEffect, useState } from 'react';
import { adminApi } from '../services/api';
import { NpcInstanceItem, CombatSkillItem } from '../types';
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Mail,
  RefreshCw,
  Search,
  Shield,
  Swords,
  Trash2,
  UserRound,
  Sparkles,
  Edit2,
  X,
} from 'lucide-react';

/**
 * NPC 实例管理
 *
 * npc_instances 是"每个从 npc_templates 创建出来的 NPC"的统一台账：
 * - WORLD：地图场景驻留 NPC
 * - PLAYER：玩家拥有的角色（发放/剧情入队）
 * - BATTLE：战斗配置槽位引用的敌人实例
 * - MAIL：系统邮件已发放、等待玩家领取的实例
 *
 * 这里可以查看归属玩家、发放者（created_by）、来源（source）与状态，
 * 并对非地图实例执行禁用/删除。
 */

const INSTANCE_TYPE_LABEL: Record<string, string> = {
  WORLD: '地图驻留',
  PLAYER: '玩家拥有',
  BATTLE: '战斗槽位',
  MAIL: '邮件待领取',
};

const INSTANCE_TYPE_STYLE: Record<string, string> = {
  WORLD: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  PLAYER: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  BATTLE: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
  MAIL: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
};

const NPC_ROLE_LABEL: Record<string, string> = {
  MAP: '地图常驻',
  STORY: '玩家剧情',
  STORY_BATTLE: '剧情战斗',
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: '生效中',
  PENDING: '待领取',
  MERGED: '已合并',
  DISABLED: '已禁用',
};

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  PENDING: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  MERGED: 'bg-slate-700/50 text-slate-300 border-slate-600',
  DISABLED: 'bg-red-500/15 text-red-300 border-red-500/40',
};

const SOURCE_LABEL: Record<string, string> = {
  WORLD: '地图初始化',
  MAIL_GRANT: '系统邮件发放',
  DIALOGUE: '剧情自动生成',
  DIALOGUE_JOIN: '剧情入队',
  MONSTER_GROUP: '战斗配置生成',
  MIGRATION: '历史数据迁移',
  ADMIN: '后台创建',
};

function TypeIcon({ type }: { type: string }) {
  if (type === 'PLAYER') return <UserRound className="w-3.5 h-3.5" />;
  if (type === 'BATTLE') return <Swords className="w-3.5 h-3.5" />;
  if (type === 'MAIL') return <Mail className="w-3.5 h-3.5" />;
  return <Shield className="w-3.5 h-3.5" />;
}

export const NpcInstanceManager: React.FC = () => {
  const [items, setItems] = useState<NpcInstanceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(30);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [keyword, setKeyword] = useState('');
  const [instanceType, setInstanceType] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');

  // 技能配置弹窗状态
  const [allSkills, setAllSkills] = useState<CombatSkillItem[]>([]);
  const [skillModalItem, setSkillModalItem] = useState<NpcInstanceItem | null>(null);
  const [modalCustomSkills, setModalCustomSkills] = useState(false);
  const [modalSelectedSkills, setModalSelectedSkills] = useState<string[]>([]);
  const [savingSkills, setSavingSkills] = useState(false);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ type, text });
    window.setTimeout(() => setToast(null), 3200);
  };

  const loadInstances = async (targetPage = page) => {
    setLoading(true);
    try {
      const res = await adminApi.getNpcInstances({
        page: targetPage,
        pageSize,
        keyword: keyword.trim() || undefined,
        instanceType: instanceType || undefined,
        status: status || undefined,
        source: source || undefined,
      });
      setItems(res.data || []);
      setTotal(res.total || 0);
      setPage(res.page || targetPage);
      setTotalPages(res.totalPages || 1);
    } catch (err: any) {
      showToast(err.message || '加载 NPC 实例失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInstances(1);
  }, [instanceType, status, source]);

  useEffect(() => {
    adminApi.getSkills({ pageSize: 100 }).then((res) => {
      if (res.success && res.data) {
        setAllSkills(res.data);
      }
    }).catch(() => {});
  }, []);

  const openSkillModal = (item: NpcInstanceItem) => {
    setSkillModalItem(item);
    if (item.skills_json && item.skills_json.trim()) {
      try {
        const parsed = JSON.parse(item.skills_json);
        if (Array.isArray(parsed)) {
          setModalSelectedSkills(parsed);
          setModalCustomSkills(true);
          return;
        }
      } catch {}
    }
    setModalSelectedSkills([]);
    setModalCustomSkills(false);
  };

  const handleSaveSkills = async () => {
    if (!skillModalItem) return;
    setSavingSkills(true);
    try {
      const skillsJson = modalCustomSkills ? JSON.stringify(modalSelectedSkills) : null;
      await adminApi.updateNpcInstance(skillModalItem.npc_id, {
        skills_json: skillsJson,
      });
      showToast(`实例【${skillModalItem.name}】技能配置已保存`);
      setSkillModalItem(null);
      await loadInstances(page);
    } catch (err: any) {
      showToast(err.message || '保存技能配置失败', 'error');
    } finally {
      setSavingSkills(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadInstances(1);
  };

  const toggleStatus = async (item: NpcInstanceItem) => {
    const nextStatus = item.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED';
    setActingId(item.npc_id);
    try {
      const res = await adminApi.updateNpcInstance(item.npc_id, { status: nextStatus });
      showToast(res.message || 'NPC 实例状态已更新');
      await loadInstances(page);
    } catch (err: any) {
      showToast(err.message || '更新 NPC 实例失败', 'error');
    } finally {
      setActingId(null);
    }
  };

  const removeInstance = async (item: NpcInstanceItem) => {
    const confirmMessage = item.instance_type === 'WORLD'
      ? `确定删除地图 NPC 实例【${item.name}】吗？删除后该地图角色将彻底移除。`
      : `确定删除 NPC 实例【${item.name}】吗？对应的伙伴/战斗槽位会一并解除。`;

    if (!window.confirm(confirmMessage)) {
      return;
    }
    setActingId(item.npc_id);
    try {
      const res = await adminApi.deleteNpcInstance(item.npc_id);
      showToast(res.message || 'NPC 实例已删除');
      await loadInstances(page);
    } catch (err: any) {
      showToast(err.message || '删除 NPC 实例失败', 'error');
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-6">
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

      <div className="bg-[#121722] border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Boxes className="w-5 h-5 text-violet-400" />
              <span>NPC 实例管理</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              每个从 <span className="text-slate-300 font-mono">npc_templates</span> 创建出来的
              NPC 都会在这里留痕：地图驻留、玩家拥有、战斗槽位、邮件待领取。
            </p>
          </div>
          <button
            onClick={() => loadInstances(page)}
            disabled={loading}
            className="self-start md:self-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs flex items-center gap-2 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>刷新实例台账</span>
          </button>
        </div>

        <form
          onSubmit={handleSearch}
          className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 pt-3 border-t border-slate-800/80"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索实例 ID / NPC 名 / 归属玩家 / 模板名..."
              className="w-full pl-9 pr-4 py-2 bg-[#090d14] border border-slate-700/80 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-400"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={instanceType}
              onChange={(e) => setInstanceType(e.target.value)}
              className="px-3 py-2 bg-[#090d14] border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-violet-400"
            >
              <option value="">全部类型</option>
              <option value="WORLD">WORLD · 地图驻留</option>
              <option value="PLAYER">PLAYER · 玩家拥有</option>
              <option value="BATTLE">BATTLE · 战斗槽位</option>
              <option value="MAIL">MAIL · 邮件待领取</option>
            </select>

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="px-3 py-2 bg-[#090d14] border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-violet-400"
            >
              <option value="">全部状态</option>
              <option value="ACTIVE">ACTIVE · 生效中</option>
              <option value="PENDING">PENDING · 待领取</option>
              <option value="MERGED">MERGED · 已合并</option>
              <option value="DISABLED">DISABLED · 已禁用</option>
            </select>

            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="px-3 py-2 bg-[#090d14] border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-violet-400"
            >
              <option value="">全部来源</option>
              {Object.entries(SOURCE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {value} · {label}
                </option>
              ))}
            </select>

            <button
              type="submit"
              className="px-4 py-2 bg-violet-500 hover:bg-violet-400 text-slate-950 font-bold rounded-xl text-xs transition"
            >
              搜索
            </button>
          </div>
        </form>
      </div>

      <div className="bg-[#121722] border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#0e131c] text-slate-400 border-b border-slate-800 uppercase text-[11px] font-semibold">
              <tr>
                <th className="px-4 py-3">NPC 实例</th>
                <th className="px-4 py-3">模板</th>
                <th className="px-4 py-3">类型 / 状态</th>
                <th className="px-4 py-3">归属玩家</th>
                <th className="px-4 py-3">发放者 / 来源</th>
                <th className="px-4 py-3">场景 / 等级</th>
                <th className="px-4 py-3">装配技能</th>
                <th className="px-4 py-3">创建时间</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-violet-400" />
                      <span>正在读取 NPC 实例台账...</span>
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                    暂无符合条件的 NPC 实例
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const typeStyle = INSTANCE_TYPE_STYLE[item.instance_type] || INSTANCE_TYPE_STYLE.WORLD;
                  const statusStyle = STATUS_STYLE[item.status] || STATUS_STYLE.ACTIVE;
                  const busy = actingId === item.npc_id;
                  const canToggle = item.instance_type !== 'MAIL' && item.status !== 'PENDING';

                  return (
                    <tr key={item.npc_id} className="hover:bg-slate-800/30 transition">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center text-violet-300 flex-shrink-0">
                            {item.avatar ? (
                              <img src={item.avatar} alt={item.name} className="w-full h-full object-cover" />
                            ) : (
                              <Boxes className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-100 truncate">{item.name}</div>
                            <div className="font-mono text-[10px] text-slate-500 truncate">
                              {item.npc_id}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="text-slate-200">{item.template_name || item.template_id}</div>
                        <div className="font-mono text-[10px] text-slate-500">
                          {item.template_key || item.template_id}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <span className={`px-2 py-0.5 rounded-full border text-[10px] inline-flex items-center gap-1 ${typeStyle}`}>
                            <TypeIcon type={item.instance_type} />
                            {INSTANCE_TYPE_LABEL[item.instance_type] || item.instance_type}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full border text-[10px] ${statusStyle}`}>
                            {STATUS_LABEL[item.status] || item.status}
                          </span>
                          {item.npc_role && (
                            <span className="px-2 py-0.5 rounded-full border text-[10px] bg-slate-800 text-slate-300 border-slate-700">
                              {NPC_ROLE_LABEL[item.npc_role] || item.npc_role}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        {item.owner_player_id ? (
                          <>
                            <div className="text-slate-200">{item.owner_name || '未知玩家'}</div>
                            <div className="font-mono text-[10px] text-slate-500">
                              {item.owner_player_id}
                            </div>
                          </>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="text-slate-200">{item.created_by}</div>
                        <div className="text-[10px] text-slate-500">
                          {SOURCE_LABEL[item.source] || item.source}
                          {item.source_ref ? ` · ${item.source_ref}` : ''}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="text-slate-200">{item.scene_name || item.scene_id || '—'}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          Lv.{item.level}
                          {item.battle_group_id ? ` · ${item.battle_group_id}` : ''}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        {(() => {
                          const hasCustom = Boolean(item.skills_json && item.skills_json.trim());
                          let skillKeys: string[] = [];
                          if (hasCustom) {
                            try {
                              const p = JSON.parse(item.skills_json!);
                              if (Array.isArray(p)) skillKeys = p;
                            } catch {}
                          } else if (item.template_skills_json && item.template_skills_json.trim()) {
                            try {
                              const p = JSON.parse(item.template_skills_json);
                              if (Array.isArray(p)) skillKeys = p;
                            } catch {}
                          }

                          return (
                            <div className="flex flex-col gap-1 items-start">
                              <div className="flex items-center gap-1">
                                {hasCustom ? (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                    独立装配
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-800 text-slate-400 border border-slate-700">
                                    继承模板
                                  </span>
                                )}
                                <span className="text-[11px] text-slate-300 font-medium">
                                  {skillKeys.length > 0
                                    ? skillKeys
                                        .map((k) => allSkills.find((s) => s.skill_key === k)?.name || k)
                                        .join('、')
                                    : '默认普攻'}
                                </span>
                              </div>
                              <button
                                onClick={() => openSkillModal(item)}
                                className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 transition"
                              >
                                <Edit2 className="w-3 h-3" />
                                <span>配置技能</span>
                              </button>
                            </div>
                          );
                        })()}
                      </td>

                      <td className="px-4 py-3 text-slate-500 font-mono text-[10px]">
                        {item.created_at || '—'}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            disabled={busy || !canToggle}
                            onClick={() => toggleStatus(item)}
                            className={`px-2.5 py-1.5 rounded-lg border text-[10px] transition disabled:opacity-40 ${
                              item.status === 'DISABLED'
                                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                            }`}
                            title={
                              !canToggle
                                ? '待领取的邮件实例请等待玩家领取或直接删除'
                                : item.status === 'DISABLED'
                                  ? '恢复生效'
                                  : '禁用实例'
                            }
                          >
                            {item.status === 'DISABLED' ? '启用' : '禁用'}
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => removeInstance(item)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-300 hover:bg-red-500/10 border border-transparent hover:border-red-500/30 transition disabled:opacity-30 disabled:cursor-not-allowed"
                            title="删除实例"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 bg-[#0e131c] border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div>
            共 <span className="font-mono text-slate-200 font-bold">{total}</span> 条实例，
            第 <span className="font-mono text-slate-200 font-bold">{page}</span> /{' '}
            <span className="font-mono">{totalPages}</span> 页
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1 || loading}
              onClick={() => loadInstances(page - 1)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              上一页
            </button>
            <button
              disabled={page >= totalPages || loading}
              onClick={() => loadInstances(page + 1)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      {/* 技能装配独立弹窗 */}
      {skillModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#151a26] border border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-slate-100 text-base">
                  配置 NPC 实例技能 · {skillModalItem.name}
                </h3>
              </div>
              <button
                onClick={() => setSkillModalItem(null)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                <div>
                  <div className="text-xs font-semibold text-slate-200">覆盖模板默认技能</div>
                  <div className="text-[11px] text-slate-500">开启后此实例装配独立技能，否则回退继承其模板技能</div>
                </div>
                <input
                  type="checkbox"
                  checked={modalCustomSkills}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setModalCustomSkills(checked);
                    if (checked && modalSelectedSkills.length === 0 && skillModalItem.template_skills_json) {
                      try {
                        const parsed = JSON.parse(skillModalItem.template_skills_json);
                        if (Array.isArray(parsed)) setModalSelectedSkills(parsed);
                      } catch {}
                    }
                  }}
                  className="rounded bg-slate-800 border-slate-700 text-amber-500 w-4 h-4 cursor-pointer focus:ring-0"
                />
              </div>

              {!modalCustomSkills ? (
                <div className="text-xs text-slate-400 bg-slate-900/40 p-4 rounded-xl border border-slate-800/80 leading-relaxed">
                  <div className="text-amber-400 font-semibold mb-1">当前继承的模板技能：</div>
                  <div>
                    {(() => {
                      if (!skillModalItem.template_skills_json) return '模板未配置技能（战斗中默认普攻）';
                      try {
                        const parsed = JSON.parse(skillModalItem.template_skills_json);
                        if (!Array.isArray(parsed) || parsed.length === 0) return '模板未配置技能（默认普攻）';
                        return parsed
                          .map((k) => allSkills.find((s) => s.skill_key === k)?.name || k)
                          .join('、');
                      } catch {
                        return '模板技能数据异常';
                      }
                    })()}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="block text-xs font-medium text-slate-300">
                    勾选此实例装配的技能招式（出战 / 遭遇时将按序施展）：
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto p-1 bg-slate-900/40 rounded-xl border border-slate-800">
                    {allSkills.map((skill) => {
                      const isChecked = modalSelectedSkills.includes(skill.skill_key);
                      return (
                        <label
                          key={skill.skill_key}
                          className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition ${
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
                                setModalSelectedSkills([...modalSelectedSkills, skill.skill_key]);
                              } else {
                                setModalSelectedSkills(
                                  modalSelectedSkills.filter((k) => k !== skill.skill_key)
                                );
                              }
                            }}
                            className="rounded bg-slate-800 border-slate-700 text-amber-500 mt-0.5 focus:ring-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-slate-200 truncate">{skill.name}</div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                              {skill.cost_mp} MP · {skill.target_type} · {skill.skill_kind}
                            </div>
                            {skill.description && (
                              <div className="text-[10px] text-slate-400 mt-1 line-clamp-1">
                                {skill.description}
                              </div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    已勾选 <span className="text-amber-400 font-bold">{modalSelectedSkills.length}</span> 门技能
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSkillModalItem(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl transition"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={savingSkills}
                  onClick={handleSaveSkills}
                  className="px-5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-semibold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition disabled:opacity-50"
                >
                  {savingSkills ? '保存中...' : '确认装配技能'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
