import React, { useEffect } from 'react';
import { useCombatStore } from '../store/useCombatStore';
import { BattleCanvas } from '../stage/BattleCanvas';
import { CombatFloatingNumbers } from './CombatFloatingNumbers';
import { CombatActionBar } from './action-bar/CombatActionBar';
import { Trophy, Skull, ArrowRight, DoorOpen } from 'lucide-react';

export const CombatView: React.FC = () => {
  const {
    isActive,
    phase,
    battleResult,
    selectTarget,
    finishCombat,
    options,
    autoBattle,
    battleSpeed,
    script,
    playNext,
    mode,
    pvpQueue,
  } = useCombatStore();

  // 待播放演出条数：SCRIPT 用完整脚本，实时回合制（PVP/PVE）用本回合战报
  const pendingMoves = mode === 'SCRIPT' ? script.length : pvpQueue.length;

  // 自动演出：SCRIPT 按服务端战报逐条播放；PVP 每回合战报同样自动播放。
  // PVP 的"操作"是每回合选技能，不是逐条点演出，因此不受 autoBattle 开关影响。
  useEffect(() => {
    if (!isActive) return;
    if (mode === 'SCRIPT' && !autoBattle) return;
    if (phase !== 'READY' || pendingMoves === 0) return;

    const timer = setTimeout(() => playNext(), 480 / battleSpeed);
    return () => clearTimeout(timer);
  }, [isActive, mode, autoBattle, phase, pendingMoves, battleSpeed, playNext]);

  if (!isActive) return null;

  const isDuel = options?.isDuel;
  const winTitle = options?.winTitle || (isDuel ? '切 磋 得 胜' : '大 获 全 胜');
  const winDesc =
    options?.winDesc ||
    (isDuel
      ? '承让承让！双方收剑入鞘，抱拳致礼。\n切磋论道以武会友，道心与法诀造诣大有精进！'
      : '幽冥守卫已然崩碎，血炼阵眼熄灭！\n长乐灵脉浩荡无缺，返回向墨芳复命！');
  const winButtonText = options?.winButtonText || (isDuel ? '抱拳致礼 · 论道功毕' : '凯旋回城 · 寻墨老领赏');

  const loseTitle = options?.loseTitle || (isDuel ? '切 磋 惜 败' : '力 战 不 支');
  const loseDesc =
    options?.loseDesc ||
    (isDuel
      ? '道友道法精妙，技高一筹！\n虽败犹荣，一番对决受益匪浅，当好生修持砥砺！'
      : '幽冥煞气侵入心脉，伤势极重……\n苏凝香以玉笛护住心脉，速回悬壶馆调养！');
  const loseButtonText = options?.loseButtonText || (isDuel ? '抱拳致礼 · 论道功毕' : '退避悬壶馆疗伤');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 font-serif">
      {/* 竖屏主视口容器 (最大支持手机比例 576px，超出两边留黑边，如同主流手游设计) */}
      <div className="relative w-full max-w-[500px] h-full flex flex-col justify-between overflow-hidden shadow-2xl border-x border-teal-900/40">
        {/* ===================================================================== */}
        {/* 1. 顶部阵营横幅 (如截图: 敌方战队·幽冥敌众 vs 我方战队·四象生生)        */}
        {/* ===================================================================== */}
        <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-3 pt-3 pointer-events-none">
          {/* 敌方战队 */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-sm border border-red-700/80 bg-gradient-to-r from-red-950/90 to-slate-900/80 shadow-[0_2px_8px_rgba(220,38,38,0.5)] backdrop-blur-sm">
            <span className="text-red-400 text-xs">♨</span>
            <span className="text-[12px] font-bold text-red-200 tracking-wider">
              {options?.groupTitle || '敌方战队 · 幽冥敌众'}
            </span>
          </div>

          {/* 我方战队 */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-sm border border-teal-700/80 bg-gradient-to-l from-teal-950/90 to-slate-900/80 shadow-[0_2px_8px_rgba(20,184,166,0.5)] backdrop-blur-sm">
            <span className="text-[12px] font-bold text-teal-200 tracking-wider">
              {options?.myCampTitle || '我方战队 · 四象生生'}
            </span>
            <div className="w-4 h-4 rounded-full border border-teal-400 bg-teal-500/20 flex items-center justify-center text-[10px] text-teal-300">
              ☯
            </div>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* 2. 核心战场区域 (Canvas + 飘字)                                       */}
        {/* ===================================================================== */}
        <div className="relative flex-1 w-full min-h-0 overflow-hidden">
          <BattleCanvas onSelectTarget={selectTarget} />
          <CombatFloatingNumbers />
        </div>

        {/* ===================================================================== */}
        {/* 3. 中间古韵战报卷轴                                                    */}
        {/* ===================================================================== */}
        {/*<BattleLogScroll />*/}

        {/* ===================================================================== */}
        {/* 4. 底部控制台操作栏                                                    */}
        {/* ===================================================================== */}
        <CombatActionBar />

        {/* ===================================================================== */}
        {/* 5. 战胜 / 战败结算面板                                                 */}
        {/* ===================================================================== */}
        {battleResult && (
          <div className="absolute inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-6 backdrop-blur-md animate-fade-in">
            <div className="max-w-xs w-full bg-slate-900 border-2 rounded-lg p-5 flex flex-col items-center text-center shadow-2xl relative overflow-hidden border-amber-500/70">
              {/* 装饰金光 */}
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-48 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

              {battleResult === 'WIN' ? (
                <>
                  <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center mb-3 shadow-[0_0_20px_rgba(245,158,11,0.6)]">
                    <Trophy className="w-8 h-8 text-amber-300 animate-bounce" />
                  </div>
                  <h3 className="text-2xl font-black text-amber-300 tracking-widest font-serif mb-1 drop-shadow">
                    {winTitle}
                  </h3>
                  <p className="text-xs text-amber-100/80 mb-4 leading-relaxed font-serif whitespace-pre-line">
                    {winDesc}
                  </p>
                  <button
                    onClick={() => finishCombat('WIN')}
                    className="w-full py-2.5 rounded bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold text-sm shadow-[0_4px_12px_rgba(245,158,11,0.5)] flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                  >
                    <span>{winButtonText}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </>
              ) : battleResult === 'ESCAPE' ? (
                <>
                  <div className="w-16 h-16 rounded-full bg-cyan-500/20 border-2 border-cyan-400 flex items-center justify-center mb-3 shadow-[0_0_20px_rgba(6,182,212,0.6)]">
                    <DoorOpen className="w-8 h-8 text-cyan-300" />
                  </div>
                  <h3 className="text-2xl font-black text-cyan-300 tracking-widest font-serif mb-1 drop-shadow">
                    脱 离 险 境
                  </h3>
                  <p className="text-xs text-cyan-100/80 mb-4 leading-relaxed font-serif whitespace-pre-line">
                    施展遁地神术，撕裂重围破空遁走！
                    留得青山在，不怕没柴烧，速回安全之地重整旗鼓！
                  </p>
                  <button
                    onClick={() => finishCombat('ESCAPE')}
                    className="w-full py-2.5 rounded bg-gradient-to-r from-teal-700 to-slate-800 hover:from-teal-600 hover:to-slate-700 text-white font-bold text-sm shadow-md flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                  >
                    <span>安然撤退 · 重整道心</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center mb-3 shadow-[0_0_20px_rgba(239,68,68,0.6)]">
                    <Skull className="w-8 h-8 text-red-400" />
                  </div>
                  <h3 className="text-2xl font-black text-red-400 tracking-widest font-serif mb-1 drop-shadow">
                    {loseTitle}
                  </h3>
                  <p className="text-xs text-rose-100/80 mb-4 leading-relaxed font-serif whitespace-pre-line">
                    {loseDesc}
                  </p>
                  <button
                    onClick={() => finishCombat('LOSE')}
                    className="w-full py-2.5 rounded bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700 text-white font-bold text-sm shadow-md flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                  >
                    <span>{loseButtonText}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
