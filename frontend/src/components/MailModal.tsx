import React, { useState, useEffect } from 'react';
import { MailAttachmentItem, MailItem } from '../types/game';
import { gameApi } from '../services/api';
import { usePlayerStore } from '../store/usePlayerStore';

interface MailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowNotice: (msg: string) => void;
}

const QUALITY_LABEL: Record<string, string> = {
  COMMON: '凡品',
  RARE: '灵品',
  EPIC: '地阶',
  LEGENDARY: '天阶',
  MYTHIC: '神品',
};

const ITEM_TYPE_LABEL: Record<string, string> = {
  CONSUMABLE: '丹药',
  MATERIAL: '材料',
  SPECIAL: '符箓',
  EQUIPMENT: '装备',
};

const GRANT_ICON: Record<string, string> = {
  ITEM: 'redeem',
  COMPANION: 'person_add',
  CURRENCY: 'payments',
  EQUIPMENT: 'swords',
  FRIEND_REQUEST: 'diversity_1',
};

const ROLE_LABEL: Record<string, string> = {
  DPS: '输出',
  HEALER: '治疗',
  TANK: '承伤',
};

/** 附件摘要：角色显示等级/境界，道具显示品阶，货币显示具体数额 */
function attachmentDetail(attachment: MailAttachmentItem): string {
  const parts: string[] = [];

  if (attachment.grantType === 'COMPANION') {
    if (attachment.level) parts.push(`Lv.${attachment.level}`);
    if (attachment.realm) parts.push(attachment.realm);
    if (attachment.role) parts.push(ROLE_LABEL[attachment.role] || attachment.role);
  } else if (attachment.grantType === 'FRIEND_REQUEST') {
    if (attachment.level) parts.push(`Lv.${attachment.level}`);
    if (attachment.realm) parts.push(attachment.realm);
    parts.push(attachment.description || '愿与道友结为仙友');
  } else if (attachment.grantType === 'CURRENCY') {
    if (attachment.silver) parts.push(`纹银 +${attachment.silver}`);
    if (attachment.ingot) parts.push(`元宝 +${attachment.ingot}`);
    if (attachment.copper) parts.push(`铜钱 +${attachment.copper}`);
  } else {
    if (attachment.quality) parts.push(QUALITY_LABEL[attachment.quality] || attachment.quality);
    if (attachment.itemType) parts.push(ITEM_TYPE_LABEL[attachment.itemType] || attachment.itemType);
    if (attachment.silver) parts.push(`纹银 +${attachment.silver}`);
    if (attachment.ingot) parts.push(`元宝 +${attachment.ingot}`);
  }

  return parts.join(' · ') || attachment.description || '随信道门秘宝';
}

/**
 * 飞鸽传书信箱全息弹窗 (MailModal)
 * 展示收件箱信函列表、详情查阅、类型化附件（道具/角色/货币）与领取。
 * 领取成功后同时刷新玩家资料、背包与队伍，确保刚发放的角色/道具立即可见。
 */
export const MailModal: React.FC<MailModalProps> = ({ isOpen, onClose, onShowNotice }) => {
  const [mails, setMails] = useState<MailItem[]>([]);
  const [selectedMail, setSelectedMail] = useState<MailItem | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isClaiming, setIsClaiming] = useState<boolean>(false);

  const player = usePlayerStore((s) => s.player);
  const setUnreadMailCount = usePlayerStore((s) => s.setUnreadMailCount);

  const loadMails = async () => {
    if (!player) return;
    setIsLoading(true);
    try {
      const data = await gameApi.getMails(player.id);
      setMails(data);
      if (data.length > 0) {
        setSelectedMail(data[0]);
      }
      // 统计未读信件数
      const unread = data.filter((m) => !m.isRead).length;
      setUnreadMailCount(unread);
    } catch (err) {
      console.warn('获取信笺列表失败:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadMails();
    }
  }, [isOpen, player?.id]);

  const handleClaim = async (mail: MailItem) => {
    if (mail.isClaimed) return;
    setIsClaiming(true);
    try {
      const res = await gameApi.claimMailAttachment(mail.id);
      onShowNotice(res.message || '随信附件已纳入行囊与钱庄！');

      // 本地同步更新状态
      const nextMails = mails.map((m) =>
        m.id === mail.id ? { ...m, isClaimed: true, isRead: true } : m
      );
      setMails(nextMails);
      if (selectedMail?.id === mail.id) {
        setSelectedMail((prev) => (prev ? { ...prev, isClaimed: true, isRead: true } : null));
      }
      setUnreadMailCount(nextMails.filter((m) => !m.isRead).length);

      // 领取可能改变货币、背包与队伍，统一从服务端重新拉取权威数据
      const { fetchProfile, fetchInventory, fetchParty, fetchFriends, fetchFriendRequests } = usePlayerStore.getState();
      await Promise.allSettled([fetchProfile(), fetchInventory(), fetchParty(), fetchFriends(), fetchFriendRequests()]);
    } catch (err) {
      onShowNotice(err instanceof Error ? err.message : '领取随信灵物异常');
    } finally {
      setIsClaiming(false);
    }
  };

  const handleRejectFriend = async (mail: MailItem) => {
    if (mail.isClaimed) return;
    setIsClaiming(true);
    try {
      const res = await gameApi.rejectFriendRequest({
        mailId: mail.id,
        senderId: mail.senderId || undefined,
      });
      onShowNotice(res.message || '已婉言谢绝道友结交之约');

      const nextMails = mails.map((m) =>
        m.id === mail.id ? { ...m, isClaimed: true, isRead: true } : m
      );
      setMails(nextMails);
      if (selectedMail?.id === mail.id) {
        setSelectedMail((prev) => (prev ? { ...prev, isClaimed: true, isRead: true } : null));
      }
      setUnreadMailCount(nextMails.filter((m) => !m.isRead).length);
      usePlayerStore.getState().fetchFriendRequests();
    } catch (err) {
      onShowNotice(err instanceof Error ? err.message : '处理异常');
    } finally {
      setIsClaiming(false);
    }
  };

  if (!isOpen) return null;

  const attachments = selectedMail?.attachments || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg bg-surface-container-high rounded border border-amber-400/40 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/30 bg-surface-container">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-400 text-[20px] animate-pulse">
              mail
            </span>
            <h2 className="font-serif text-base font-bold text-amber-300 tracking-wider">
              飞鸽传书 · 仙府书斋
            </h2>
            <span className="text-[11px] text-on-surface-variant font-mono">
              ({mails.length} 封信件)
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded hover:bg-surface-container-highest flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors"
          >
            ✕
          </button>
        </div>

        {/* 内容主体双栏布局 */}
        <div className="flex-1 grid grid-cols-12 min-h-[320px] overflow-hidden">
          {/* 左侧信件目录 */}
          <div className="col-span-5 border-r border-outline-variant/20 overflow-y-auto bg-surface-container-low/60 p-2 space-y-1.5">
            {isLoading ? (
              <div className="py-12 text-center text-[11px] text-on-surface-variant animate-pulse font-serif">
                飞鸽穿云寻信中...
              </div>
            ) : mails.length === 0 ? (
              <div className="py-12 text-center text-[11px] text-on-surface-variant/70 font-serif">
                书案空空，暂无信笺
              </div>
            ) : (
              mails.map((m) => {
                const isSelected = selectedMail?.id === m.id;
                return (
                  <div
                    key={m.id}
                    onClick={() => {
                      setSelectedMail(m);
                      if (!m.isRead) {
                        setMails((prev) =>
                          prev.map((item) => (item.id === m.id ? { ...item, isRead: true } : item))
                        );
                        setUnreadMailCount(
                          Math.max(0, mails.filter((item) => !item.isRead && item.id !== m.id).length)
                        );
                      }
                    }}
                    className={`p-2 rounded cursor-pointer transition-all border text-left ${
                      isSelected
                        ? 'bg-amber-500/20 border-amber-400/60 shadow-sm'
                        : 'bg-surface-container/70 border-outline-variant/20 hover:bg-surface-container-highest'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-serif text-xs font-semibold text-primary truncate">
                        {m.senderName || '未知修士'}
                      </span>
                      {m.hasAttachment && !m.isClaimed && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" title="附带灵物" />
                      )}
                    </div>
                    <div className="text-[11px] text-on-surface font-serif truncate">
                      {m.title}
                    </div>
                    {m.attachments && m.attachments.length > 0 && (
                      <div className="mt-0.5 text-[9px] text-amber-300/70 font-mono truncate">
                        {m.attachments.map((a) => a.name).join('、')}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* 右侧信函详阅 */}
          <div className="col-span-7 p-3 overflow-y-auto flex flex-col justify-between bg-surface-container-lowest">
            {selectedMail ? (
              <div className="flex flex-col h-full justify-between">
                <div>
                  <div className="pb-2 border-b border-outline-variant/20 mb-2">
                    <h3 className="font-serif text-sm font-bold text-amber-200">
                      {selectedMail.title}
                    </h3>
                    <div className="flex items-center justify-between text-[10px] text-on-surface-variant mt-1 font-serif">
                      <span>发件道友: {selectedMail.senderName}</span>
                      <span>{selectedMail.createdAt?.slice(0, 10) || '今日'}</span>
                    </div>
                  </div>

                  <div className="text-[12px] font-serif text-on-surface/90 leading-relaxed whitespace-pre-wrap py-2 min-h-[100px]">
                    {selectedMail.content}
                  </div>
                </div>

                {/* 随信灵物与附件区域 */}
                {selectedMail.hasAttachment && (
                  <div className="mt-3 p-2 rounded bg-surface-container-high border border-amber-500/30">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] text-on-surface-variant font-serif">
                        随信赏赐 · 领取后生效
                      </span>
                      <span className="text-[9px] text-on-surface-variant/70 font-mono">
                        {attachments.length || 1} 项
                      </span>
                    </div>

                    <div className="space-y-1 mb-2">
                      {attachments.length > 0 ? (
                        attachments.map((attachment) => (
                          <div
                            key={attachment.id}
                            className={`flex items-center gap-2 p-1.5 rounded border ${
                              selectedMail.isClaimed
                                ? 'bg-surface-container/50 border-outline-variant/20 opacity-60'
                                : 'bg-surface-container-lowest border-amber-500/20'
                            }`}
                          >
                            {attachment.grantType === 'COMPANION' && attachment.avatar ? (
                              <img
                                src={attachment.avatar}
                                alt={attachment.name}
                                className="w-7 h-7 rounded object-cover border border-amber-400/40 flex-shrink-0"
                              />
                            ) : (
                              <span className="material-symbols-outlined text-amber-400 text-[18px] flex-shrink-0">
                                {GRANT_ICON[attachment.grantType] || 'card_giftcard'}
                              </span>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="text-[11px] text-amber-300 font-serif font-bold truncate">
                                {attachment.name}
                                {attachment.grantType === 'ITEM' && attachment.count > 1
                                  ? ` × ${attachment.count}`
                                  : ''}
                              </div>
                              <div className="text-[9px] text-on-surface-variant font-mono truncate">
                                {attachmentDetail(attachment)}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-[11px] text-amber-300 font-mono">随信道门秘宝</div>
                      )}
                    </div>

                    {attachments.some((a) => a.grantType === 'FRIEND_REQUEST') ? (
                      selectedMail.isClaimed ? (
                        <div className="w-full py-1.5 rounded text-xs font-serif text-center bg-surface-container text-emerald-400/80 border border-emerald-500/30">
                          已缔结仙契 · 互为同道
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isClaiming}
                            onClick={() => handleClaim(selectedMail)}
                            className="flex-1 px-2.5 py-1.5 rounded text-xs font-serif font-bold bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:brightness-110 shadow-md active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[14px]">check</span>
                            <span>{isClaiming ? '缔结中...' : '同意结交'}</span>
                          </button>
                          <button
                            type="button"
                            disabled={isClaiming}
                            onClick={() => handleRejectFriend(selectedMail)}
                            className="px-3 py-1.5 rounded text-xs font-serif bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface border border-outline-variant/40 transition-all cursor-pointer"
                          >
                            婉拒
                          </button>
                        </div>
                      )
                    ) : (
                      <button
                        type="button"
                        disabled={selectedMail.isClaimed || isClaiming}
                        onClick={() => handleClaim(selectedMail)}
                        className={`w-full px-2.5 py-1.5 rounded text-xs font-serif font-bold transition-all ${
                          selectedMail.isClaimed
                            ? 'bg-surface-container text-on-surface-variant/50 cursor-not-allowed border border-outline-variant/30'
                            : 'bg-gradient-to-r from-amber-500 to-amber-600 text-black hover:brightness-110 shadow-md active:scale-95'
                        }`}
                      >
                        {selectedMail.isClaimed
                          ? '已领取'
                          : isClaiming
                            ? '纳物中...'
                            : '领取附件（道具 / 角色 / 货币）'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-[11px] text-on-surface-variant/50 font-serif">
                请点击左侧信函查看秘语
              </div>
            )}
          </div>
        </div>

        {/* 底部功能栏 */}
        <div className="p-2.5 border-t border-outline-variant/20 bg-surface-container flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              setUnreadMailCount(0);
              onShowNotice('已将所有信函归卷阅毕！');
            }}
            className="text-[11px] font-serif text-on-surface-variant hover:text-amber-300 transition-colors"
          >
            全部标为已读
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1 rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-serif border border-outline-variant/40 transition-colors"
          >
            收起书函
          </button>
        </div>
      </div>
    </div>
  );
};
