import React, { useEffect, useMemo } from 'react';
import { useSceneStore, ScenePlayer } from '../store/sceneStore';
import { usePlayerStore } from '../store/usePlayerStore';

interface PartyStatusBarProps {
  onShowNotice: (msg: string) => void;
  onOpenProfile?: (playerId: string) => void;
}

/**
 * 4. 快捷角色与当前所在区域玩家栏 (PartyStatusBar)
 *
 * 规范要求：
 * 场景内只按 area_id 过滤并显示当前子区域（如长乐广场、演武校场、府衙等）的同道列表，
 * 玩家移动后即刻同步更新显示当前区域所有玩家与道友的头像。
 * 当其他玩家进入和自己相同的地图后，玩家应该立即能看到。
 */
export const PartyStatusBar: React.FC<PartyStatusBarProps> = ({
  onOpenProfile,
}) => {
  const currentAreaId = useSceneStore((s) => s.currentAreaId);
  const players = useSceneStore((s) => s.players);
  const myPlayer = usePlayerStore((s) => s.player);
  const syncCurrentPlayer = useSceneStore((s) => s.syncCurrentPlayer);

  // 权威区域 ID 来自 sceneStore.currentAreaId（由服务器 AREA_PLAYERS 响应更新），
  // 避免 myPlayer.areaId / myPlayer.currentMap 未定义时退化到错误默认值。
  const activeAreaId = currentAreaId || 'square';

  // 仅当玩家身份确认时，同步自身信息到 sceneStore；
  // 注意：不在此处主动发送 CHANGE_AREA，避免把服务端误认为区域切换而丢失其他玩家信息。
  // CHANGE_AREA 应由地图导航逻辑在真实切换时触发（见 MapPanel 等）。
  useEffect(() => {
    if (myPlayer) {
      syncCurrentPlayer({
        id: myPlayer.id,
        nickname: myPlayer.nickname,
        areaId: activeAreaId,
        avatar: myPlayer.avatar,
        level: myPlayer.level,
        realm: myPlayer.realm,
        title: myPlayer.title,
      });
    }
  }, [myPlayer?.id, myPlayer?.nickname, activeAreaId, syncCurrentPlayer]);

  // 2. PLAYER_LEAVE / AREA_PLAYERS 的 store 更新均由 syncGlobalStores 统一处理，此处无需重复订阅

  // 主角自身：始终排在当前区域同道列表首位
  const selfPlayer: ScenePlayer = useMemo(() => {
    return {
      id: myPlayer?.id || 'self_current_player',
      name: myPlayer?.nickname || '道友',
      areaId: activeAreaId,
      avatar: myPlayer?.avatar || '',
      level: myPlayer?.level,
      realm: myPlayer?.realm,
      title: myPlayer?.title,
    };
  }, [myPlayer, activeAreaId]);

  // 核心特性：当前子区域内的所有玩家（自身始终居首，后随当前区域驻留的其他同道）
  const areaPlayers = useMemo(() => {
    const otherPlayers = players.filter((p) => {
      // 排除自身（由 selfPlayer 统一置于首位展示）
      if (myPlayer?.id && p.id === myPlayer.id) {
        return false;
      }
      if (p.id === selfPlayer.id) {
        return false;
      }
      const pArea = p.areaId || (p as any).currentMap;
      return pArea === activeAreaId || pArea === currentAreaId;
    });

    return [selfPlayer, ...otherPlayers];
  }, [players, myPlayer?.id, selfPlayer, activeAreaId, currentAreaId]);

  const colorMap = ['text-on-surface', 'text-secondary', 'text-primary', 'text-tertiary'];

  const handleClick = (comp: ScenePlayer) => {
    if (onOpenProfile) {
      onOpenProfile(comp.id);
    }
  };

  return (
    <section className="mx-space-md mt-space-xs rounded bg-surface-container-lowest p-space-xs flex items-center justify-between shadow-inner">
      <div className="flex items-center gap-space-sm overflow-x-auto py-0.5 flex-1 min-w-0 pr-1">
        {areaPlayers.map((comp, idx) => {
          const isSelf = comp.id === myPlayer?.id || comp.id === selfPlayer.id;

          return (
            <div
              key={comp.id}
              className="relative flex-shrink-0 cursor-pointer text-center group active:scale-95 transition-all"
              onClick={() => handleClick(comp)}
              title={isSelf ? `点击查看自身【${comp.name}】档案` : `点击查阅【${comp.name}】道友档案`}
            >
              <div
                className={`relative w-10 h-10 rounded bg-surface-container-highest overflow-hidden p-[1px] border ${
                  isSelf
                    ? 'border-primary ring-1 ring-primary/40'
                    : 'border-transparent group-hover:border-primary'
                } transition-colors`}
              >
                {comp.avatar ? (
                  <img
                    className="w-full h-full object-cover rounded"
                    data-alt={`道友头像 ${comp.name}`}
                    alt={comp.name}
                    src={comp.avatar}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center rounded bg-surface-container-highest text-primary font-bold text-[13px]">
                    {(comp.name || '道').slice(0, 1)}
                  </div>
                )}
                <span
                  className={`absolute bottom-0 right-0 w-2 h-2 rounded-full ring-1 ring-surface-container-lowest ${
                    isSelf ? 'bg-primary' : 'bg-tertiary'
                  }`}
                />
                <span
                  className={`absolute -top-0.5 -right-0.5 text-on-primary text-[7px] font-bold px-0.5 rounded leading-none ${
                    isSelf
                      ? 'bg-primary opacity-100'
                      : 'bg-primary/90 opacity-0 group-hover:opacity-100'
                  } transition-opacity`}
                >
                </span>
              </div>
              <span
                className={`text-[9px] font-label-sm block truncate max-w-[42px] transition-colors ${
                  isSelf
                    ? 'text-primary font-bold'
                    : `${colorMap[idx % colorMap.length]} group-hover:text-primary`
                }`}
              >
                {comp.name}
              </span>
              <span className="text-[8px] font-data-metric text-on-surface-variant block leading-tight scale-90">
                {comp.level ? `Lv.${comp.level}` : ''}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
};
