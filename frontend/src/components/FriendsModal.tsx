import React, { useState, useEffect } from 'react';
import { FriendItem, FriendRequestItem } from '../types/game';
import { gameApi } from '../services/api';
import { usePlayerStore } from '../store/usePlayerStore';
import { wsManager } from '../hooks/useWebSocket';
import { MessageType, CombatAction } from '../types/ws';

interface FriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowNotice: (msg: string) => void;
  onOpenPlayerModal?: (playerId: string) => void;
}

export const FriendsModal: React.FC<FriendsModalProps> = ({
  isOpen,
  onClose,
  onShowNotice,
  onOpenPlayerModal,
}) => {
  const [activeTab, setActiveTab] = useState<'friends' | 'requests' | 'search'>('friends');
  const [friendsList, setFriendsList] = useState<FriendItem[]>([]);
  const [requestsList, setRequestsList] = useState<FriendRequestItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // 搜索道友
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Array<{
    id: string;
    nickname: string;
    avatar: string;
    level: number;
    realm: string;
    sect: string;
    combatPower: number;
    title?: string;
    isFriend: boolean;
  }>>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);

  // 私信窗口
  const [whisperTarget, setWhisperTarget] = useState<FriendItem | null>(null);
  const [whisperText, setWhisperText] = useState<string>('');
  const [isSendingWhisper, setIsSendingWhisper] = useState<boolean>(false);

  const player = usePlayerStore((s) => s.player);

  const loadData = async () => {
    if (!player) return;
    setIsLoading(true);
    try {
      const [friends, requests] = await Promise.all([
        gameApi.getFriends().catch(() => []),
        gameApi.getFriendRequests().catch(() => []),
      ]);
      setFriendsList(friends);
      setRequestsList(requests);
    } catch (e) {
      console.warn('获取仙友数据失败:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, player?.id]);

  // 同意结交
  const handleAccept = async (req: FriendRequestItem) => {
    setIsProcessing(true);
    try {
      const res = await gameApi.acceptFriendRequest({
        requestId: req.requestId,
        senderId: req.senderId,
        mailId: req.mailId,
      });
      onShowNotice(res.message || `已与【${req.nickname}】结为仙友！`);
      await loadData();
    } catch (err: unknown) {
      onShowNotice(err instanceof Error ? err.message : '同意结交异常');
    } finally {
      setIsProcessing(false);
    }
  };

  // 婉言谢绝
  const handleReject = async (req: FriendRequestItem) => {
    setIsProcessing(true);
    try {
      const res = await gameApi.rejectFriendRequest({
        requestId: req.requestId,
        senderId: req.senderId,
        mailId: req.mailId,
      });
      onShowNotice(res.message || '已婉言谢绝');
      setRequestsList((prev) => prev.filter((r) => r.requestId !== req.requestId));
    } catch (err: unknown) {
      onShowNotice(err instanceof Error ? err.message : '谢绝结交异常');
    } finally {
      setIsProcessing(false);
    }
  };

  // 解除仙友
  const handleRemoveFriend = async (friend: FriendItem) => {
    if (!window.confirm(`确认要与仙友【${friend.nickname}】断绝同道之约吗？`)) {
      return;
    }
    setIsProcessing(true);
    try {
      const res = await gameApi.removeFriend(friend.friendId);
      onShowNotice(res.message || `已解除与【${friend.nickname}】的仙契`);
      setFriendsList((prev) => prev.filter((f) => f.friendId !== friend.friendId));
    } catch (err: unknown) {
      onShowNotice(err instanceof Error ? err.message : '解除仙友失败');
    } finally {
      setIsProcessing(false);
    }
  };

  // 发起切磋
  const handleInviteDuel = (friend: FriendItem) => {
    if (!wsManager.isConnected()) {
      onShowNotice('尚未连接九州网络，无法发起切磋');
      return;
    }
    const sent = wsManager.sendMessage(MessageType.COMBAT, CombatAction.DUEL_INVITE, {
      targetPlayerId: friend.friendId,
    });
    if (sent) {
      onShowNotice(`已向仙友【${friend.nickname}】发出切磋论道邀请！`);
    } else {
      onShowNotice('切磋邀请发送失败，请稍后重试');
    }
  };

  // 搜索道友
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) {
      onShowNotice('请输入道友昵称或六位仙籍ID');
      return;
    }
    setIsSearching(true);
    try {
      const results = await gameApi.searchPlayers(searchQuery.trim());
      setSearchResults(results);
      if (results.length === 0) {
        onShowNotice('九州名册中未寻得匹配的道友');
      }
    } catch (err: unknown) {
      onShowNotice(err instanceof Error ? err.message : '寻访道友异常');
    } finally {
      setIsSearching(false);
    }
  };

  // 搜索结果中点击结交
  const handleSendRequestToTarget = async (targetId: string, targetName: string) => {
    setIsProcessing(true);
    try {
      const res = await gameApi.sendFriendRequest(targetId);
      onShowNotice(res.message || `已向【${targetName}】递交结交名帖！`);
      if (res.isAlreadyFriends) {
        await loadData();
      }
    } catch (err: unknown) {
      onShowNotice(err instanceof Error ? err.message : '结交申请发送失败');
    } finally {
      setIsProcessing(false);
    }
  };

  // 发送私信
  const handleSendWhisper = async () => {
    if (!whisperTarget || !whisperText.trim()) {
      onShowNotice('请输入传音正文');
      return;
    }
    setIsSendingWhisper(true);
    try {
      await gameApi.sendMail({
        receiverId: whisperTarget.friendId,
        title: `来自仙友【${player?.nickname || '道友'}】的私信`,
        content: whisperText.trim(),
      });
      onShowNotice(`已向仙友【${whisperTarget.nickname}】寄出飞鸽私信！`);
      setWhisperText('');
      setWhisperTarget(null);
    } catch (err: unknown) {
      onShowNotice(err instanceof Error ? err.message : '传信失败');
    } finally {
      setIsSendingWhisper(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg bg-surface-container-high rounded border border-emerald-500/40 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/30 bg-surface-container">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-400 text-[20px]">
              diversity_1
            </span>
            <h2 className="font-serif text-base font-bold text-emerald-300 tracking-wider">
              仙友录 · 同道共契
            </h2>
            <span className="text-[11px] text-on-surface-variant font-mono">
              ({friendsList.length} 位仙友)
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded hover:bg-surface-container-highest flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* 选项卡导航 */}
        <div className="flex items-center border-b border-outline-variant/20 bg-surface-container-low px-2">
          <button
            type="button"
            onClick={() => setActiveTab('friends')}
            className={`flex-1 py-2 text-xs font-serif font-bold text-center border-b-2 transition-all cursor-pointer ${
              activeTab === 'friends'
                ? 'border-emerald-400 text-emerald-300 bg-surface-container/40'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            仙友名册 ({friendsList.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('requests')}
            className={`flex-1 py-2 text-xs font-serif font-bold text-center border-b-2 transition-all relative cursor-pointer ${
              activeTab === 'requests'
                ? 'border-emerald-400 text-emerald-300 bg-surface-container/40'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            结交申请
            {requestsList.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[9px] font-bold">
                {requestsList.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('search')}
            className={`flex-1 py-2 text-xs font-serif font-bold text-center border-b-2 transition-all cursor-pointer ${
              activeTab === 'search'
                ? 'border-emerald-400 text-emerald-300 bg-surface-container/40'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            寻访同道
          </button>
        </div>

        {/* 主体视口 */}
        <div className="flex-1 overflow-y-auto p-3 min-h-[300px] max-h-[55vh] bg-surface-container-lowest">
          {isLoading ? (
            <div className="py-16 text-center text-xs text-on-surface-variant animate-pulse font-serif">
              翻阅九州仙契神册中...
            </div>
          ) : activeTab === 'friends' ? (
            /* 1. 仙友列表 */
            friendsList.length === 0 ? (
              <div className="py-16 text-center text-on-surface-variant/70 font-serif space-y-2">
                <span className="material-symbols-outlined text-4xl text-on-surface-variant/40">
                  person_off
                </span>
                <p className="text-xs">暂无同道仙友，不妨漫步长乐坊市或寻访同道，广结九州善缘。</p>
                <button
                  type="button"
                  onClick={() => setActiveTab('search')}
                  className="mt-2 px-3 py-1 rounded bg-emerald-500/20 text-emerald-300 text-xs font-serif border border-emerald-500/40 hover:bg-emerald-500/30 transition-all cursor-pointer"
                >
                  前往寻访道友
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {friendsList.map((friend) => (
                  <div
                    key={friend.friendshipId}
                    className="p-2.5 rounded bg-surface-container/80 border border-outline-variant/30 hover:border-emerald-500/40 transition-all flex items-center justify-between gap-2 shadow-sm"
                  >
                    {/* 左侧头像与基本信息 */}
                    <div
                      className="flex items-center gap-2.5 min-w-0 cursor-pointer"
                      onClick={() => onOpenPlayerModal?.(friend.friendId)}
                      title="点击查看修仙玉牒"
                    >
                      <div className="relative w-10 h-10 rounded-full border border-emerald-400/40 bg-surface-container-high overflow-hidden flex-shrink-0">
                        <img
                          src={friend.avatar || ''}
                          alt={friend.nickname}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                        <span className="absolute -bottom-0.5 -right-0.5 bg-emerald-600 text-[8px] font-bold text-white px-1 rounded-full">
                          {friend.level}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-serif font-bold text-emerald-300 truncate">
                            {friend.nickname}
                          </span>
                          <span className="text-[9px] px-1 py-0.2 rounded bg-surface-container-high text-on-surface-variant border border-outline-variant/30">
                            {friend.realm || '炼气期'}
                          </span>
                        </div>
                        <div className="text-[10px] text-on-surface-variant font-serif truncate mt-0.5">
                          {friend.sect || '散修盟'} · 战力 {friend.combatPower?.toLocaleString() ?? '—'}
                        </div>
                        {friend.signature && (
                          <div className="text-[9px] text-on-surface-variant/60 italic truncate mt-0.5">
                            "{friend.signature}"
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 右侧互动快捷按钮 */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setWhisperTarget(friend);
                          setWhisperText('');
                        }}
                        className="px-2 py-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface text-[10px] font-serif flex items-center gap-0.5 transition-all cursor-pointer border border-outline-variant/30"
                        title="飞鸽私信"
                      >
                        <span className="material-symbols-outlined text-[12px] text-emerald-400">chat</span>
                        <span>私信</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInviteDuel(friend)}
                        className="px-2 py-1 rounded bg-surface-container hover:bg-surface-container-high text-primary text-[10px] font-serif flex items-center gap-0.5 transition-all cursor-pointer border border-primary/30"
                        title="切磋论道"
                      >
                        <span className="material-symbols-outlined text-[12px]">swords</span>
                        <span>切磋</span>
                      </button>
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleRemoveFriend(friend)}
                        className="w-6 h-6 rounded hover:bg-rose-500/20 text-on-surface-variant hover:text-rose-400 text-xs flex items-center justify-center transition-all cursor-pointer"
                        title="解除结交"
                      >
                        <span className="material-symbols-outlined text-[13px]">person_remove</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : activeTab === 'requests' ? (
            /* 2. 结交申请列表 */
            requestsList.length === 0 ? (
              <div className="py-16 text-center text-on-surface-variant/70 font-serif space-y-1">
                <span className="material-symbols-outlined text-4xl text-on-surface-variant/40">
                  mark_email_read
                </span>
                <p className="text-xs">案牍清净，暂无待批复的结交名帖。</p>
              </div>
            ) : (
              <div className="space-y-2">
                {requestsList.map((req) => (
                  <div
                    key={req.requestId}
                    className="p-3 rounded bg-surface-container/80 border border-emerald-500/30 flex items-center justify-between gap-2 shadow-sm"
                  >
                    <div
                      className="flex items-center gap-2.5 min-w-0 cursor-pointer"
                      onClick={() => onOpenPlayerModal?.(req.senderId)}
                      title="查看玉牒"
                    >
                      <div className="relative w-10 h-10 rounded-full border border-amber-400/40 bg-surface-container-high overflow-hidden flex-shrink-0">
                        <img
                          src={req.avatar || ''}
                          alt={req.nickname}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                        <span className="absolute -bottom-0.5 -right-0.5 bg-amber-600 text-[8px] font-bold text-white px-1 rounded-full">
                          {req.level}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-serif font-bold text-amber-200 truncate">
                            {req.nickname}
                          </span>
                          <span className="text-[9px] px-1 py-0.2 rounded bg-surface-container text-on-surface-variant border border-outline-variant/30">
                            {req.realm || '修真者'}
                          </span>
                        </div>
                        <div className="text-[10px] text-on-surface-variant font-serif truncate mt-0.5">
                          {req.sect || '散修盟'} · 战力 {req.combatPower?.toLocaleString() ?? '—'}
                        </div>
                        <div className="text-[9px] text-emerald-400/80 font-mono mt-0.5">
                          递交名帖愿与道友缔结仙契
                        </div>
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleAccept(req)}
                        className="px-2.5 py-1 rounded bg-gradient-to-r from-emerald-600 to-teal-600 hover:brightness-110 text-white text-xs font-serif font-bold shadow-sm active:scale-95 transition-all cursor-pointer flex items-center gap-0.5"
                      >
                        <span className="material-symbols-outlined text-[13px]">check</span>
                        <span>同意</span>
                      </button>
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleReject(req)}
                        className="px-2 py-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface text-xs font-serif border border-outline-variant/40 transition-all cursor-pointer"
                      >
                        婉拒
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            /* 3. 寻访同道修士 */
            <div className="space-y-3">
              <form onSubmit={handleSearch} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[16px]">
                    search
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="输入修仙者道号或仙籍ID..."
                    className="w-full pl-8 pr-3 py-1.5 rounded bg-surface-container-low border border-outline-variant/40 text-xs text-on-surface focus:outline-none focus:border-emerald-400 font-serif"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSearching}
                  className="px-3.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-serif font-bold shadow-sm active:scale-95 transition-all cursor-pointer flex-shrink-0"
                >
                  {isSearching ? '寻访中...' : '寻访'}
                </button>
              </form>

              {searchResults.length > 0 ? (
                <div className="space-y-2 mt-2">
                  {searchResults.map((resPlayer) => (
                    <div
                      key={resPlayer.id}
                      className="p-2.5 rounded bg-surface-container/70 border border-outline-variant/30 flex items-center justify-between gap-2"
                    >
                      <div
                        className="flex items-center gap-2.5 min-w-0 cursor-pointer"
                        onClick={() => onOpenPlayerModal?.(resPlayer.id)}
                      >
                        <div className="w-9 h-9 rounded-full border border-outline-variant/40 bg-surface-container-high overflow-hidden flex-shrink-0">
                          <img
                            src={resPlayer.avatar || ''}
                            alt={resPlayer.nickname}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-serif font-bold text-on-surface truncate">
                              {resPlayer.nickname}
                            </span>
                            <span className="text-[9px] px-1 py-0.2 rounded bg-surface-container-high text-on-surface-variant">
                              Lv.{resPlayer.level} · {resPlayer.realm || '修真者'}
                            </span>
                          </div>
                          <div className="text-[10px] text-on-surface-variant font-serif truncate mt-0.5">
                            {resPlayer.sect || '散修盟'} · 战力 {resPlayer.combatPower?.toLocaleString() ?? '—'}
                          </div>
                        </div>
                      </div>

                      <div className="flex-shrink-0">
                        {resPlayer.isFriend ? (
                          <span className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-serif border border-emerald-500/40">
                            已是仙友
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleSendRequestToTarget(resPlayer.id, resPlayer.nickname)}
                            className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-serif font-bold active:scale-95 transition-all shadow-sm cursor-pointer flex items-center gap-0.5"
                          >
                            <span className="material-symbols-outlined text-[12px]">person_add</span>
                            <span>结交</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-on-surface-variant/60 font-serif">
                  可在上方输入道友名字或仙号寻访，结识同道中人。
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部功能栏 */}
        <div className="p-2.5 border-t border-outline-variant/20 bg-surface-container flex items-center justify-between">
          <div className="text-[10px] text-on-surface-variant font-serif">
            仙友同行，修仙论道，共证大道混元
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1 rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-serif border border-outline-variant/40 transition-colors cursor-pointer"
          >
            合卷收起
          </button>
        </div>

        {/* 嵌套私信传音弹窗 */}
        {whisperTarget && (
          <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded bg-surface-container-high border border-emerald-500/40 p-3 shadow-2xl flex flex-col gap-2.5 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-outline-variant/30 pb-2">
                <span className="text-xs font-serif font-bold text-emerald-300">
                  飞鸽传音 · 致【{whisperTarget.nickname}】
                </span>
                <button
                  type="button"
                  onClick={() => setWhisperTarget(null)}
                  className="text-on-surface-variant hover:text-on-surface text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <textarea
                value={whisperText}
                onChange={(e) => setWhisperText(e.target.value)}
                placeholder="请输入私信密语，传音将化作飞鸽送至对方书斋..."
                rows={3}
                className="w-full p-2 rounded bg-surface-container-lowest border border-outline-variant/40 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-emerald-400 font-serif resize-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setWhisperTarget(null)}
                  className="px-3 py-1 rounded bg-surface-container text-xs text-on-surface font-serif border border-outline-variant/30 cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={isSendingWhisper}
                  onClick={handleSendWhisper}
                  className="px-4 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-serif font-bold shadow active:scale-95 transition-all cursor-pointer"
                >
                  {isSendingWhisper ? '传信中...' : '寄出'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
