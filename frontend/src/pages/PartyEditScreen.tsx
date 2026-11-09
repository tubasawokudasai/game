import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopSceneHeader } from '../components/TopSceneHeader';
import { usePlayerStore } from '../store/usePlayerStore';
import { PartyMember } from '../types/game';

interface PartyEditScreenProps {
  onShowNotice: (msg: string) => void;
  onOpenPlayerModal?: (playerId?: string) => void;
}

/** 出战席位上限：阵眼（主角）1 人 + 出战伙伴 3 人 */
const PARTY_MAX_SIZE = 4;

const ROLE_META: Record<string, { label: string; icon: string }> = {
  DPS: { label: '输出', icon: 'swords' },
  HEALER: { label: '治疗', icon: 'healing' },
  TANK: { label: '护盾', icon: 'shield' },
  LEADER: { label: '阵眼', icon: 'star' },
};

/**
 * 屏幕：队伍整备 (PartyEditScreen)
 *
 * - 列出玩家拥有的全部伙伴（含休息中的成员），可自由切换「出战 / 休息」。
 * - 出战席位最多 4 人（阵眼 + 3 名伙伴），超出时后端拒绝并回传原因。
 * - 主角（阵眼）固定出战，不在此页休息。
 */
export const PartyEditScreen: React.FC<PartyEditScreenProps> = ({
  onShowNotice,
  onOpenPlayerModal,
}) => {
  const navigate = useNavigate();
  const player = usePlayerStore((s) => s.player);
  const party = usePlayerStore((s) => s.party);
  const fetchParty = usePlayerStore((s) => s.fetchParty);
  const updatePartyMemberStatus = usePlayerStore((s) => s.updatePartyMemberStatus);

  // 正在提交的成员：避免连点造成并发覆盖
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  // 每次进入整备页都向后端拉取一次最新名录，避免对话招募后本地列表过期
  useEffect(() => {
    fetchParty();
  }, [fetchParty]);

  const { leader, companions, activeCount, restingCount } = useMemo(() => {
    const leaderMember = party.find((m) => m.isLeader || m.role === 'LEADER');
    const companionList = party.filter((m) => !(m.isLeader || m.role === 'LEADER'));
    return {
      leader: leaderMember,
      companions: companionList,
      activeCount: party.filter((m) => m.isActive !== false).length,
      restingCount: companionList.filter((m) => m.isActive === false).length,
    };
  }, [party]);

  const handleGoBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  const handleToggle = async (member: PartyMember) => {
    if (pendingKey) return;

    const nextActive = member.isActive === false;
    setPendingKey(member.id);
    try {
      const message = await updatePartyMemberStatus(member.id, nextActive);
      onShowNotice(message);
    } catch (err: unknown) {
      onShowNotice(err instanceof Error ? err.message : '整备队伍失败，请稍后再试');
    } finally {
      setPendingKey(null);
    }
  };

  const renderAvatar = (member: PartyMember, sizeClass = 'w-12 h-12') => {
    const avatar = member.isLeader ? player?.avatar || member.avatar : member.avatar;
    return (
      <div
        className={`${sizeClass} rounded overflow-hidden bg-surface-container-highest relative flex-shrink-0 border ${
          member.isActive === false ? 'border-outline-variant/40 opacity-60' : 'border-primary/40'
        }`}
      >
        {avatar ? (
          <img className="w-full h-full object-cover" alt={`${member.name}头像`} src={avatar} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-primary font-bold text-base">
            {(member.name || '道').slice(0, 1)}
          </div>
        )}
        <span className="absolute inset-x-0 bottom-0 bg-black/60 text-[8px] text-primary font-data-metric text-center leading-none py-0.5">
          Lv.{member.level}
        </span>
      </div>
    );
  };

  const renderRow = (member: PartyMember) => {
    const isLeader = !!(member.isLeader || member.role === 'LEADER');
    const isActive = member.isActive !== false;
    const roleMeta = ROLE_META[member.role] || { label: member.role, icon: 'groups' };
    const isPending = pendingKey === member.id;

    const targetId = isLeader ? (player?.id || member.id) : member.id;

    return (
      <div
        key={member.id}
        className={`flex items-center gap-2 p-2 rounded border transition-colors ${
          isActive
            ? 'bg-surface-container-low border-primary/30'
            : 'bg-surface-container-lowest/70 border-outline-variant/30'
        }`}
      >
        <div
          className="cursor-pointer group flex-shrink-0 active:scale-95 transition-transform"
          onClick={() => onOpenPlayerModal?.(targetId)}
          title={`点击查阅【${member.name}】的侠客档案`}
        >
          {renderAvatar(member)}
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-1 min-w-0">
            <span
              onClick={() => onOpenPlayerModal?.(targetId)}
              className={`text-[12px] font-bold truncate cursor-pointer hover:text-primary transition-colors hover:underline underline-offset-2 ${
                isActive ? 'text-on-surface' : 'text-on-surface-variant'
              }`}
              title={`点击查阅【${member.name}】的侠客档案`}
            >
              {member.name}
            </span>
            {isLeader ? (
              <span className="flex-shrink-0 bg-primary text-on-primary text-[8px] font-bold px-1 rounded">
                阵眼
              </span>
            ) : (
              <span className="flex-shrink-0 flex items-center gap-0.5 bg-surface-container-high text-on-surface-variant text-[8px] px-1 rounded">
                <span className="material-symbols-outlined text-[9px]">{roleMeta.icon}</span>
                {roleMeta.label}
              </span>
            )}
            {!isActive && (
              <span className="flex-shrink-0 bg-surface-container-highest text-outline text-[8px] px-1 rounded">
                休息中
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-on-surface-variant truncate">
            <span>{[member.realm, member.title].filter(Boolean).join(' · ') || '来历不详'}</span>
            {typeof member.hp === 'number' && member.maxHp && (
              <span className="text-[9px] font-data-metric text-secondary/80">
                血:{member.hp}
              </span>
            )}
            {typeof member.mp === 'number' && member.maxMp && (
              <span className="text-[9px] font-data-metric text-tertiary/80">
                气:{member.mp}
              </span>
            )}
          </div>
        </div>

        {isLeader ? (
          <span className="flex-shrink-0 text-[9px] text-primary font-label-sm bg-primary/10 border border-primary/30 px-1.5 py-1 rounded">
            固定出战
          </span>
        ) : (
          <button
            type="button"
            disabled={pendingKey !== null}
            onClick={() => handleToggle(member)}
            className={`flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded border transition-all active:scale-95 ${
              isActive
                ? 'border-outline-variant/50 text-on-surface-variant hover:border-primary hover:text-primary'
                : 'bg-primary text-on-primary border-primary hover:bg-primary/90'
            } ${pendingKey !== null && !isPending ? 'opacity-50' : ''}`}
          >
            {isPending ? (
              <span className="flex items-center gap-0.5">
                <span className="material-symbols-outlined text-[11px] animate-spin">
                  progress_activity
                </span>
                处理中
              </span>
            ) : isActive ? (
              '下场休息'
            ) : (
              '出战'
            )}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col w-full text-on-surface select-none pb-2">
      <TopSceneHeader onMailClick={() => onShowNotice('正在打开飞鸽传书秘录...')} />

      <section className="mx-space-md mt-space-xs flex flex-col gap-space-xs text-on-surface">
        {/* 面包屑与顶部导航 */}
        <div className="flex items-center justify-between px-2 py-1 rounded bg-surface-container-lowest/80 border border-outline-variant/30 text-[11px]">
          <button
            type="button"
            onClick={handleGoBack}
            className="flex items-center gap-1 text-on-surface-variant hover:text-primary transition-colors cursor-pointer active:scale-95"
          >
            <span className="material-symbols-outlined text-[15px]">arrow_back</span>
            <span className="font-headline-sm text-[11px] font-bold">返回</span>
          </button>
          <span className="text-primary font-headline-sm font-bold text-[12px] tracking-wide">
            队伍整备 · 出战与休息
          </span>
          <span className="w-10" />
        </div>

        {/* 出战席位总览 */}
        <div className="rounded bg-gradient-to-b from-surface-container-high via-surface-container to-surface-container-low p-2 shadow-md border border-outline-variant/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-primary text-[16px]">groups</span>
              <span className="text-[12px] font-bold text-on-surface">当前出战阵容</span>
            </div>
            <span className="font-data-metric text-[12px] text-primary font-bold">
              {activeCount}/{PARTY_MAX_SIZE}
            </span>
          </div>

          <div className="flex items-center gap-1 mt-1.5">
            {Array.from({ length: PARTY_MAX_SIZE }).map((_, index) => (
              <span
                key={index}
                className={`h-1.5 flex-1 rounded-full ${
                  index < activeCount ? 'bg-primary' : 'bg-surface-container-highest'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between mt-1.5 text-[9px] text-on-surface-variant">
            <span>阵眼固定出战，其余伙伴最多 3 人同场</span>
            <span className="font-data-metric">休息 {restingCount} 人</span>
          </div>
        </div>

        {/* 阵容列表 */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[10px] text-on-surface-variant px-1">
            <span className="font-bold text-primary">同道名录</span>
            <span className="font-data-metric">共 {party.length} 人</span>
          </div>

          <div className="flex flex-col gap-1.5">
            {/* 阵眼（主角）固定出战，不参与休息切换 */}
            {leader && renderRow(leader)}

            {companions.map((member) => renderRow(member))}

            {!leader && party.length === 0 && (
              <div className="rounded bg-surface-container-low border border-dashed border-outline-variant/40 p-4 text-center text-[11px] text-on-surface-variant">
                <span className="material-symbols-outlined text-2xl text-primary/60 block mb-1">
                  person_search
                </span>
                正在查阅同道名录...
              </div>
            )}

            {leader && companions.length === 0 && (
              <div className="rounded bg-surface-container-low border border-dashed border-outline-variant/40 p-4 text-center text-[11px] text-on-surface-variant">
                <span className="material-symbols-outlined text-2xl text-primary/60 block mb-1">
                  group_add
                </span>
                队伍中尚无同行伙伴
                <div className="mt-1 text-[9px] text-outline">
                  在江湖中结识同道并邀请入队后，可在此安排其出战或休息
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 规则说明 */}
        <div className="rounded bg-surface-container-lowest/70 border border-outline-variant/30 p-2 text-[9px] leading-relaxed text-on-surface-variant">
          <div className="flex items-start gap-1">
            <span className="material-symbols-outlined text-[12px] text-primary flex-shrink-0">
              info
            </span>
            <span>
              出战席位共 {PARTY_MAX_SIZE} 席，阵眼（主角）固定占据 1 席。休息中的伙伴不会参加战斗，
              但会保留在名录中，可随时重新召集出战。
            </span>
          </div>
        </div>
      </section>
    </div>
  );
};
