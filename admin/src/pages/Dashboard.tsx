import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../services/api';
import { AdminStats } from '../types';
import { Users, MapPin, UserCheck, Shield, Sparkles, Compass, Database, Activity, RefreshCw } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getStats();
      setStats(data);
    } catch (err) {
      console.error('加载统计数据失败:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <div className="space-y-6">
      {/* 顶部迎宾 Banner */}
      <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 rounded-2xl p-6 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-medium mb-2 border border-amber-500/30">
              <Sparkles className="w-3.5 h-3.5" />
              <span>万界法度 · 总枢管理台</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-100">万象录 · 管理总控台</h2>
            <p className="text-sm text-slate-400 mt-1">
              掌控全大千世界地理山川、大区都城与常驻生灵，调阅并运维所有飞升道友资料。
            </p>
          </div>
          <button
            onClick={fetchStats}
            disabled={loading}
            className="self-start md:self-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-sm flex items-center gap-2 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>刷新数据</span>
          </button>
        </div>
      </div>

      {/* 统计指标卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 总玩家 */}
        <div className="bg-[#121722] border border-slate-800/80 rounded-2xl p-5 hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">总玩家体量</span>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-100">
              {loading ? '--' : stats?.totalPlayers.toLocaleString()}
            </span>
            <span className="text-xs text-slate-400 ml-2">位道友</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-1">
            <span>正籍：{stats?.registeredPlayers || 0} / 散修：{stats?.guestPlayers || 0}</span>
          </div>
        </div>

        {/* 技能法诀 */}
        <div
          onClick={() => navigate('/skills')}
          className="bg-[#121722] border border-slate-800/80 rounded-2xl p-5 hover:border-amber-500/40 transition cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">战斗技能法诀</span>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-100">
              {loading ? '--' : (stats?.totalSkills ?? 0).toLocaleString()}
            </span>
            <span className="text-xs text-slate-400 ml-2">门法诀</span>
          </div>
          <div className="mt-2 text-xs text-amber-400/80">
            进入技能管理工作台 &rarr;
          </div>
        </div>

        {/* 地图场景 */}
        <div className="bg-[#121722] border border-slate-800/80 rounded-2xl p-5 hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">大千山川场景</span>
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
              <MapPin className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-100">
              {loading ? '--' : stats?.totalScenes.toLocaleString()}
            </span>
            <span className="text-xs text-slate-400 ml-2">处地脉</span>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            涵盖州域、都城与繁华坊市
          </div>
        </div>

        {/* 常驻 NPC */}
        <div className="bg-[#121722] border border-slate-800/80 rounded-2xl p-5 hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">九州仙真生灵</span>
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-100">
              {loading ? '--' : stats?.totalNpcs.toLocaleString()}
            </span>
            <span className="text-xs text-slate-400 ml-2">位 NPC</span>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            驻留各大门派与城池
          </div>
        </div>
      </div>

      {/* 快捷导航入口 (带具体 URL 路由跳转) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          onClick={() => navigate('/maps')}
          className="group cursor-pointer bg-[#121722] border border-slate-800 hover:border-amber-500/40 rounded-2xl p-6 transition shadow-lg relative overflow-hidden"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-4 group-hover:scale-105 transition">
                <Compass className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-100 group-hover:text-amber-300 transition flex items-center gap-2">
                <span>地图场景管理与可视化编辑</span>
                <span className="font-mono text-xs text-slate-500 bg-slate-900 px-2 py-0.5 rounded">/maps</span>
              </h3>
              <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
                维护九州地图网格（512×512 空间网格体系），动态增删改场景、调整地貌坐标、等级归属与全景图志。
              </p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-800/80 flex items-center text-xs font-medium text-amber-400">
            <span>进入地图工作台 (/maps) &rarr;</span>
          </div>
        </div>

        <div
          onClick={() => navigate('/players')}
          className="group cursor-pointer bg-[#121722] border border-slate-800 hover:border-sky-500/40 rounded-2xl p-6 transition shadow-lg relative overflow-hidden"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center mb-4 group-hover:scale-105 transition">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-100 group-hover:text-sky-300 transition flex items-center gap-2">
                <span>玩家列表与属性深度维护 (GM)</span>
                <span className="font-mono text-xs text-slate-500 bg-slate-900 px-2 py-0.5 rounded">/players</span>
              </h3>
              <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
                检索道友档案，修改境界功力、金银财富、气血内力数值，支持一键脱离卡死传送与违规封禁。
              </p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-800/80 flex items-center text-xs font-medium text-sky-400">
            <span>进入玩家运维台 (/players) &rarr;</span>
          </div>
        </div>
      </div>

      {/* 底层架构状态 */}
      <div className="bg-[#121722] border border-slate-800 rounded-2xl p-6">
        <h4 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
          <Database className="w-4 h-4 text-amber-400" />
          <span>服务引擎与集群状态</span>
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-400">
          <div className="p-3 rounded-xl bg-[#090d14] border border-slate-800/80 flex items-center gap-3">
            <Activity className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <div>
              <p className="text-slate-200 font-medium">Cloudflare Workers</p>
              <p className="text-[11px] text-slate-500">全球边缘网关 HTTP + DO</p>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-[#090d14] border border-slate-800/80 flex items-center gap-3">
            <Database className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <div>
              <p className="text-slate-200 font-medium">Cloudflare D1 (SQLite)</p>
              <p className="text-[11px] text-slate-500">分布式强类型关系数据库</p>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-[#090d14] border border-slate-800/80 flex items-center gap-3">
            <Sparkles className="w-4 h-4 text-sky-400 flex-shrink-0" />
            <div>
              <p className="text-slate-200 font-medium">Durable Objects</p>
              <p className="text-[11px] text-slate-500">ZoneDO 场景会话与世界传音</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
