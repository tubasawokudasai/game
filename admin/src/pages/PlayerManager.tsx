import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../services/api';
import { PlayerItem, SceneItem } from '../types';
import { PlayerEditModal } from '../components/PlayerEditModal';
import {
  Users,
  Search,
  RefreshCw,
  Edit,
  Shield,
  Coins,
  MapPin,
  CheckCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Filter,
  Gift,
  Trash2,
} from 'lucide-react';

export const PlayerManager: React.FC = () => {
  const navigate = useNavigate();
  const [players, setPlayers] = useState<PlayerItem[]>([]);
  const [scenes, setScenes] = useState<SceneItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // 筛选字段
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');

  // 弹窗
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [playerToDelete, setPlayerToDelete] = useState<PlayerItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Toast
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3000);
  };

  const loadPlayers = async (targetPage = page) => {
    setLoading(true);
    try {
      const res = await adminApi.getPlayers({
        page: targetPage,
        pageSize,
        keyword: keyword.trim() || undefined,
        status: statusFilter || undefined,
        zoneId: zoneFilter || undefined,
      });
      setPlayers(res.list || []);
      setTotal(res.total || 0);
      setPage(res.page);
      setTotalPages(res.totalPages || 1);
    } catch (err: any) {
      showToast(err.message || '加载玩家列表失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadScenes = async () => {
    try {
      const data = await adminApi.getScenes();
      setScenes(data.scenes || []);
    } catch {
      // 容错处理
    }
  };

  useEffect(() => {
    loadPlayers(1);
    loadScenes();
  }, [statusFilter, zoneFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadPlayers(1);
  };

  const handleEditPlayer = (p: PlayerItem) => {
    setSelectedPlayer(p);
    setIsModalOpen(true);
  };

  const handleDeletePlayer = async () => {
    if (!playerToDelete) return;
    setIsDeleting(true);
    try {
      const res = await adminApi.deletePlayer(playerToDelete.id);
      showToast(res.message || '玩家档案已删除', 'success');
      setPlayerToDelete(null);
      // 如果当前页只有这一条且不是第一页，则往前跳一页
      const nextPage = players.length === 1 && page > 1 ? page - 1 : page;
      loadPlayers(nextPage);
    } catch (err: any) {
      showToast(err.message || '删除玩家失败', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ONLINE':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            ONLINE 在线
          </span>
        );
      case 'MEDITATING':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-sky-500/20 text-sky-300 border border-sky-500/40">
            打坐中
          </span>
        );
      case 'BANNED':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/20 text-red-300 border border-red-500/40">
            封禁中
          </span>
        );
      case 'OFFLINE':
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
            离线
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast 提示 */}
      {toastMsg && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-sm border backdrop-blur-md transition-all ${
            toastMsg.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/40'
              : 'bg-red-950/90 text-red-200 border-red-500/40'
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

      {/* 控制与过滤顶栏 */}
      <div className="bg-[#121722] border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Users className="w-5 h-5 text-sky-400" />
              <span>修仙道友名册与 GM 属性维护</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              全服修仙者档案中心：支持即时编辑玩家境界战力、货币灵石、行囊归属与空间传送。
            </p>
          </div>

          <button
            onClick={() => loadPlayers(page)}
            disabled={loading}
            className="self-start md:self-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs flex items-center gap-2 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>刷新名册</span>
          </button>
        </div>

        {/* 搜索与多维度筛选 */}
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-3 border-t border-slate-800/80">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="通过道号、账号名、UUID 检索..."
              className="w-full pl-9 pr-4 py-2 bg-[#090d14] border border-slate-700/80 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-400"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-[#090d14] border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-sky-400"
            >
              <option value="">全部状态</option>
              <option value="ONLINE">ONLINE (在线)</option>
              <option value="OFFLINE">OFFLINE (离线)</option>
              <option value="MEDITATING">MEDITATING (打坐)</option>
              <option value="BANNED">BANNED (已封禁)</option>
            </select>

            <button
              type="submit"
              className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-xl text-xs transition"
            >
              搜索
            </button>
          </div>
        </form>
      </div>

      {/* 玩家列表表格 */}
      <div className="bg-[#121722] border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#0e131c] text-slate-400 border-b border-slate-800 uppercase text-[11px] font-semibold">
              <tr>
                <th className="px-4 py-3">道号 / 账号名</th>
                <th className="px-4 py-3">境界与等级</th>
                <th className="px-4 py-3">战力</th>
                <th className="px-4 py-3">通宝财富 (元宝/银/铜)</th>
                <th className="px-4 py-3">所在场景</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading && players.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
                      <span>正在翻阅九州道册...</span>
                    </div>
                  </td>
                </tr>
              ) : players.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    暂无符合条件的道友记录
                  </td>
                </tr>
              ) : (
                players.map((p) => {
                  const sceneName = scenes.find((s) => s.id === p.area_id)?.name || p.area_id;

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-800/30 transition group cursor-pointer"
                      onClick={() => handleEditPlayer(p)}
                    >
                      {/* 道号与账号 */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400 font-bold flex-shrink-0">
                            {p.nickname.slice(0, 1)}
                          </div>
                          <div>
                            <div className="font-bold text-slate-100 flex items-center gap-1.5">
                              <span>{p.nickname}</span>
                              {p.is_guest ? (
                                <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-slate-400 border border-slate-700">
                                  散修试玩
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  正统仙门
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-[10px] text-slate-500 block">
                              {p.username || p.id}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 境界与等级 */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-amber-300">{p.realm}</div>
                        <div className="text-[11px] text-slate-400">
                          Lv.{p.level} · {p.sect}
                        </div>
                      </td>

                      {/* 战力 */}
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-bold text-amber-400">
                          {p.combat_power.toLocaleString()}
                        </span>
                      </td>

                      {/* 财富 */}
                      <td className="px-4 py-3">
                        <div className="font-mono text-[11px] space-y-0.5">
                          <div className="text-amber-300">元宝: {p.ingot.toLocaleString()}</div>
                          <div className="text-slate-300">纹银: {p.silver.toLocaleString()}</div>
                        </div>
                      </td>

                      {/* 场景 */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-slate-200">
                          <MapPin className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                          <span>{sceneName}</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500 block">
                          {p.zone_id}
                        </span>
                      </td>

                      {/* 状态 */}
                      <td className="px-4 py-3">{getStatusBadge(p.status)}</td>

                      {/* 操作 */}
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => navigate('/grants', { state: { player: p } })}
                            className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-medium inline-flex items-center gap-1 transition"
                            title="通过系统邮件向该玩家发放道具 / 角色"
                          >
                            <Gift className="w-3.5 h-3.5" />
                            <span>系统发放</span>
                          </button>
                          <button
                            onClick={() => handleEditPlayer(p)}
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-sky-500/20 hover:text-sky-300 text-slate-300 border border-slate-700 text-xs font-medium inline-flex items-center gap-1 transition"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            <span>修改档案</span>
                          </button>
                          <button
                            onClick={() => setPlayerToDelete(p)}
                            className="px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-medium inline-flex items-center gap-1 transition"
                            title="删除该玩家档案及全部数据"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>删除</span>
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

        {/* 分页控制栏 */}
        <div className="p-4 bg-[#0e131c] border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div>
            共 <span className="font-mono text-slate-200 font-bold">{total}</span> 位道友记录，
            第 <span className="font-mono text-slate-200 font-bold">{page}</span> /{' '}
            <span className="font-mono">{totalPages}</span> 页
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1 || loading}
              onClick={() => loadPlayers(page - 1)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>上一页</span>
            </button>

            <button
              disabled={page >= totalPages || loading}
              onClick={() => loadPlayers(page + 1)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition"
            >
              <span>下一页</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 玩家编辑抽屉/弹窗 */}
      <PlayerEditModal
        isOpen={isModalOpen}
        player={selectedPlayer}
        scenes={scenes}
        onClose={() => setIsModalOpen(false)}
        onRefresh={() => loadPlayers(page)}
      />

      {/* 删除玩家确认弹窗 */}
      {playerToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-[#121722] border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-100">确认删除该修仙道友？</h3>
                <p className="text-xs text-slate-400 mt-0.5">将永久清除其境界、行囊、剧情进度与所有关联数据</p>
              </div>
            </div>

            <div className="bg-[#0a0e16] p-3 rounded-xl border border-slate-800 space-y-1.5 text-xs">
              <div className="text-slate-300">
                确定要删除【<span className="text-amber-300 font-bold">{playerToDelete.nickname}</span>】吗？
              </div>
              <div className="font-mono text-[11px] text-slate-500">
                账号 / ID: {playerToDelete.username || playerToDelete.id}
              </div>
              <div className="text-[11px] text-slate-400">
                境界: <span className="text-amber-400">{playerToDelete.realm} (Lv.{playerToDelete.level})</span> · 门派: {playerToDelete.sect}
              </div>
            </div>

            <p className="text-[11px] text-rose-400/90 leading-relaxed">
              ⚠️ 此操作不可逆，请谨慎确认。
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setPlayerToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
              >
                取消
              </button>
              <button
                onClick={handleDeletePlayer}
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
