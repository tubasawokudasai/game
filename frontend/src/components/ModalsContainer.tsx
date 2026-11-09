import React, { useState, useEffect } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useMapStore } from '../store/useMapStore';
import { gameApi } from '../services/api';
import { FacilityItem } from '../App';
import { FullPlayerDetail, FriendStatus } from '../types/game';
import { DialogueModal } from './DialogueModal';
import { PharmacyModal } from './PharmacyModal';
import { useDialogueStore } from '../store/useDialogueStore';
import { CombatView, useCombatStore } from '../features/combat';
import { useWsEvent, wsManager } from '../hooks/useWebSocket';
import {
  MessageType,
  CombatAction,
  NoticeAction,
  DuelInvitePayload,
  DuelStartPayload,
  DuelRoundPayload,
  DuelAbortPayload,
  PveStartPayload,
  PveRoundPayload,
  PveAbortPayload,
} from '../types/ws';

interface ModalsContainerProps {
  npcModal: string | null;
  onCloseNpc: () => void;
  facilityModal: FacilityItem | null;
  onCloseFacility: () => void;
  playerModal: boolean;
  viewingPlayerId?: string | null;
  onClosePlayer: () => void;
  onShowNotice: (msg: string, duration?: number, title?: string) => void;
}

/**
 * 集中模态框容器组件 (ModalsContainer)
 * 纯动态数据驱动：NPC 对话通过服务端 API 实时拉取；侠客玉牒全息卡片由真实的玩家状态仓库计算生成
 */
export const ModalsContainer: React.FC<ModalsContainerProps> = ({
  npcModal,
  onCloseNpc,
  facilityModal,
  onCloseFacility,
  playerModal,
  viewingPlayerId,
  onClosePlayer,
  onShowNotice,
}) => {
  const player = usePlayerStore((s) => s.player);
  const inventory = usePlayerStore((s) => s.inventory);

  // 侠客全息档案真实数据状态
  const [profileData, setProfileData] = useState<FullPlayerDetail | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState<boolean>(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileLikes, setProfileLikes] = useState<number>(0);
  const [hasLiked, setHasLiked] = useState<boolean>(false);

  // 私信传音对话窗口状态
  const [isWhisperOpen, setIsWhisperOpen] = useState<boolean>(false);
  const [whisperContent, setWhisperContent] = useState<string>('');
  const [isSendingWhisper, setIsSendingWhisper] = useState<boolean>(false);
  const [friendStatus, setFriendStatus] = useState<FriendStatus | null>(null);
  const [isFriendActionLoading, setIsFriendActionLoading] = useState<boolean>(false);

  // 切磋邀请与应战状态
  const [incomingDuel, setIncomingDuel] = useState<DuelInvitePayload | null>(null);
  const [duelCountdown, setDuelCountdown] = useState<number>(30);

  // 监听收到切磋邀请
  useWsEvent<DuelInvitePayload>(
    MessageType.COMBAT,
    CombatAction.DUEL_INVITE,
    (payload) => {
      // 切磋邀战优先展示，避免被书斋/邮件等高层弹窗遮挡
      usePlayerStore.getState().setMailModalOpen(false);
      setIncomingDuel(payload);
      const remaining = Math.max(1, Math.round((payload.expiresAt - Date.now()) / 1000));
      setDuelCountdown(remaining);
    }
  );

  // 切磋邀请倒计时与自动失效
  useEffect(() => {
    if (!incomingDuel) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.round((incomingDuel.expiresAt - Date.now()) / 1000));
      setDuelCountdown(remaining);
      if (remaining <= 0) {
        setIncomingDuel(null);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [incomingDuel]);

  // 婉言谢绝切磋
  const handleRejectDuel = () => {
    if (!incomingDuel) return;
    wsManager.sendMessage(MessageType.COMBAT, CombatAction.DUEL_REJECT, {
      duelId: incomingDuel.duelId,
      reason: `道友【${player?.nickname || '对方'}】婉言谢绝了您的切磋邀请。`,
    });
    setIncomingDuel(null);
  };

  // 接受切磋应战
  const handleAcceptDuel = () => {
    if (!incomingDuel) return;
    wsManager.sendMessage(MessageType.COMBAT, CombatAction.DUEL_ACCEPT, {
      duelId: incomingDuel.duelId,
    });
    setIncomingDuel(null);
  };

  // 通用系统提示：邀请失效、对方离线、切磋异常等
  useWsEvent<{ content?: string; title?: string; duration?: number }>(
    MessageType.NOTICE,
    NoticeAction.TOAST,
    (payload) => {
      if (payload?.content) {
        onShowNotice(payload.content, payload.duration, payload.title);
      }
    }
  );

  // 监听切磋邀请被对方拒绝
  useWsEvent<{ reason?: string }>(
    MessageType.COMBAT,
    CombatAction.DUEL_REJECT,
    (payload) => {
      if (payload?.reason) {
        onShowNotice(payload.reason);
      }
    }
  );

  // 监听切磋开始：进入实时回合制战斗视口
  useWsEvent<DuelStartPayload>(
    MessageType.COMBAT,
    CombatAction.DUEL_START,
    (payload) => {
      // 关闭弹窗
      onClosePlayer();
      onCloseFacility();
      onCloseNpc();
      usePlayerStore.getState().setMailModalOpen(false);
      setIncomingDuel(null);

      // 启动实时切磋：双方每回合各选技能，服务端结算
      useCombatStore.getState().startCombat({
        mode: 'PVP',
        duelId: payload.duelId,
        monsterGroupId: payload.battleId,
        playerTeam: payload.playerTeam,
        enemyTeam: payload.enemyTeam,
        skills: payload.skills,
        round: payload.round,
        deadline: payload.deadline,
        serverNow: payload.serverNow,
        timeoutMs: payload.timeoutMs,
        groupTitle: `敌方战队 · ${payload.opponent.name}`,
        myCampTitle: `我方战队`,
        isDuel: true,
        winTitle: '切 磋 得 胜',
        winDesc: `承让承让！双方收剑入鞘，抱拳致礼。\n与道友【${payload.opponent.name}】一番论道大有裨益，道心愈发通透！`,
        winButtonText: '抱拳致礼 · 论道功毕',
        loseTitle: '切 磋 惜 败',
        loseDesc: `道友【${payload.opponent.name}】道法精妙，技高一筹！\n虽败犹荣，一番对决受益匪浅，当好生修持砥砺！`,
        loseButtonText: '抱拳致礼 · 论道功毕',
        onPvpAction: (actions) => {
          wsManager.sendMessage(MessageType.COMBAT, CombatAction.DUEL_ACTION, {
            duelId: payload.duelId,
            round: useCombatStore.getState().pvpRound,
            actions,
          });
        },
      });
    }
  );

  // 监听切磋单回合战报
  useWsEvent<DuelRoundPayload>(
    MessageType.COMBAT,
    CombatAction.DUEL_ROUND,
    (payload) => {
      useCombatStore.getState().receiveDuelRound(payload);
    }
  );

  // 监听切磋中止（对方掉线/异常）
  useWsEvent<DuelAbortPayload>(
    MessageType.COMBAT,
    CombatAction.DUEL_ABORT,
    (payload) => {
      const combat = useCombatStore.getState();
      // 只处理当前这场的终止消息，避免旧对局延迟消息误关新战斗
      if (combat.mode === 'PVP' && combat.duelId === payload?.duelId) {
        combat.closeCombat();
      }
      onShowNotice(payload?.reason || '切磋已中止');
    }
  );

  // 监听实时 PVE 战斗开始（剧情战 / 地图 NPC 遭遇）
  useWsEvent<PveStartPayload>(
    MessageType.COMBAT,
    CombatAction.PVE_START,
    (payload) => {
      // 关闭可能遮挡战斗视口的弹窗
      onClosePlayer();
      onCloseFacility();
      onCloseNpc();
      usePlayerStore.getState().setMailModalOpen(false);

      const isEncounter = payload.battleType === 'ENCOUNTER';
      const enemyName = payload.npc?.name || payload.group.name;

      useCombatStore.getState().startCombat({
        mode: 'PVE',
        battleId: payload.battleId,
        battleType: payload.battleType,
        monsterGroupId: payload.group.id,
        playerTeam: payload.playerTeam,
        enemyTeam: payload.enemyTeam,
        skills: payload.skills,
        round: payload.round,
        deadline: payload.deadline,
        serverNow: payload.serverNow,
        timeoutMs: payload.timeoutMs,
        groupTitle: isEncounter
          ? `强敌遭遇 · ${enemyName}`
          : `敌方战队 · ${payload.group.name}`,
        myCampTitle: '我方战队',
        isDuel: false,
        winTitle: isEncounter ? '斩 将 夺 魁' : '大 获 全 胜',
        winDesc: isEncounter
          ? `势如破竹！成功击破【${enemyName}】及其麾下精锐，威震四方！`
          : '阵眼已碎，幽冥煞气消散！\n长乐灵脉浩荡无缺，返回向墨芳复命！',
        winButtonText: isEncounter ? '纳气归元 · 凯旋' : '凯旋回城 · 寻墨老领赏',
        loseTitle: isEncounter ? '力 战 惜 败' : '力 战 不 支',
        loseDesc: isEncounter
          ? `强敌【${enemyName}】功法深厚，暂且避其锋芒，待道行精进后再来讨教！`
          : '幽冥煞气侵入心脉，伤势极重……\n速回悬壶馆调养，待道行精进再来破阵！',
        loseButtonText: isEncounter ? '暂避锋芒 · 回城调养' : '退避悬壶馆疗伤',
        onPvpAction: (actions) => {
          wsManager.sendMessage(MessageType.COMBAT, CombatAction.PVE_ACTION, {
            battleId: payload.battleId,
            round: useCombatStore.getState().pvpRound,
            actions,
          });
        },
        onFinish: async (result, toasts) => {
          await usePlayerStore.getState().fetchProfile().catch(() => {});

          if (isEncounter) {
            const currentAreaId = usePlayerStore.getState().player?.areaId;
            if (currentAreaId) {
              void useMapStore.getState().fetchMap(currentAreaId, true);
            }
            if (toasts && toasts.length > 0) {
              toasts.forEach((toast) => onShowNotice(toast));
            } else if (result === 'WIN') {
              onShowNotice(`战斗胜利，已诛灭【${enemyName}】战队！`);
            } else {
              onShowNotice('战斗失败');
            }

            // 对话战斗选项可配置胜/败后返回的剧情节点
            const returnNodeId =
              result === 'WIN' ? payload.winNodeId : payload.loseNodeId;
            if (returnNodeId) {
              await useDialogueStore.getState().openDialogue(undefined, returnNodeId);
            }
            return;
          }

          if (result === 'WIN') {
            onShowNotice('阵眼已碎，大获全胜！返回向墨芳复命！');
            if (payload.winNodeId) {
              await useDialogueStore.getState().openDialogue(undefined, payload.winNodeId);
            }
          } else {
            onShowNotice('力战负伤，速回悬壶馆调养……');
            if (payload.loseNodeId) {
              await useDialogueStore.getState().openDialogue(undefined, payload.loseNodeId);
            }
          }
        },
      });
    }
  );

  // 监听 PVE 单回合战报
  useWsEvent<PveRoundPayload>(
    MessageType.COMBAT,
    CombatAction.PVE_ROUND,
    (payload) => {
      useCombatStore.getState().receivePveRound(payload);
    }
  );

  // 监听 PVE 中止（掉线/异常）
  useWsEvent<PveAbortPayload>(
    MessageType.COMBAT,
    CombatAction.PVE_ABORT,
    (payload) => {
      const combat = useCombatStore.getState();
      if (combat.mode === 'PVE' && combat.duelId === payload?.battleId) {
        combat.closeCombat();
      }
      onShowNotice(payload?.reason || '战斗已中止');
    }
  );

  // 当打开侠客档案时，根据 viewingPlayerId 或当前主角 ID 异步拉取真实数据库全息档案
  useEffect(() => {
    if (!playerModal) {
      setIsWhisperOpen(false);
      setWhisperContent('');
      setProfileData(null);
      setFriendStatus(null);
      return;
    }

    const targetId = viewingPlayerId || player?.id;
    if (!targetId) {
      setProfileError('尚未取得当前修仙者身份');
      setIsProfileLoading(false);
      return;
    }
    let isMounted = true;
    setProfileError(null);
    setProfileData(null);
    setFriendStatus(null);
    setIsProfileLoading(true);

    gameApi
      .getPlayerProfile(targetId)
      .then((data) => {
        if (isMounted) {
          // 确保他人视角下 isSelf 严格与 targetId 校验
          const isReallySelf = !viewingPlayerId || (player && viewingPlayerId === player.id);
          setProfileData({
            ...data,
            isSelf: isReallySelf ? true : false,
          });
          setProfileLikes(data.player.likesCount || 0);
          setHasLiked(!!data.hasLiked);
          setIsProfileLoading(false);

          if (!isReallySelf) {
            gameApi.getFriendStatus(targetId).then((fs) => {
              if (isMounted) setFriendStatus(fs);
            }).catch(() => {});
          }
        }
      })
      .catch((err) => {
        console.warn('获取修仙者全息档案失败:', err);
        if (isMounted) {
          setProfileData(null);
          setProfileError(err instanceof Error ? err.message : '侠客档案调阅失败');
          setIsProfileLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [playerModal, viewingPlayerId, player?.id]);

  // 仙友结交动作
  const handleFriendAction = async () => {
    const targetPlayer = profileData?.player;
    if (!targetPlayer?.id) return;

    if (friendStatus?.isFriend) {
      onShowNotice(`你与【${targetPlayer.nickname}】已是仙友，可在「百宝箱-好友」中互动。`);
      return;
    }

    if (friendStatus?.isPending) {
      onShowNotice(`已向【${targetPlayer.nickname}】递交结交名帖，请静候道友应答。`);
      return;
    }

    if (friendStatus?.hasIncoming) {
      setIsFriendActionLoading(true);
      try {
        const res = await gameApi.acceptFriendRequest({ senderId: targetPlayer.id });
        onShowNotice(res.message || `已与【${targetPlayer.nickname}】结为仙友！`);
        setFriendStatus({ isFriend: true, isPending: false, hasIncoming: false });
        usePlayerStore.getState().fetchFriends();
      } catch (err: unknown) {
        onShowNotice(err instanceof Error ? err.message : '结交失败');
      } finally {
        setIsFriendActionLoading(false);
      }
      return;
    }

    setIsFriendActionLoading(true);
    try {
      const res = await gameApi.sendFriendRequest(targetPlayer.id);
      onShowNotice(res.message || `已向【${targetPlayer.nickname}】递交结交名帖！`);
      if (res.isAlreadyFriends) {
        setFriendStatus({ isFriend: true, isPending: false, hasIncoming: false });
        usePlayerStore.getState().fetchFriends();
      } else {
        setFriendStatus({ isFriend: false, isPending: true, hasIncoming: false });
      }
    } catch (err: unknown) {
      onShowNotice(err instanceof Error ? err.message : '结交申请发送失败');
    } finally {
      setIsFriendActionLoading(false);
    }
  };

  // 发送飞鸽传书私信
  const handleSendWhisper = async () => {
    if (!whisperContent.trim()) {
      onShowNotice('请输入私信传音内容');
      return;
    }
    const targetPlayer = profileData?.player;
    if (!targetPlayer) return;

    setIsSendingWhisper(true);
    try {
      await gameApi.sendMail({
        receiverId: targetPlayer.id,
        title: `来自【${player?.nickname || '道友'}】的私信`,
        content: whisperContent.trim(),
      });
      onShowNotice(`已向【${targetPlayer.nickname}】发送飞鸽私信！`);
      setWhisperContent('');
      setIsWhisperOpen(false);
    } catch (err: unknown) {
      onShowNotice(err instanceof Error ? err.message : '发送私信失败');
    } finally {
      setIsSendingWhisper(false);
    }
  };

  // 为道友点燃心灯赞叹
  const handleLike = async () => {
    const targetPlayer = profileData?.player;
    if (!targetPlayer) return;
    const isSelf = profileData?.isSelf ?? (targetPlayer.id === player?.id);
    if (isSelf) {
      onShowNotice('不可赞叹自身道心');
      return;
    }
    try {
      const res = await gameApi.likePlayer(targetPlayer.id);
      setProfileLikes(res.likesCount);
      setHasLiked(true);
      onShowNotice(res.message || `为【${targetPlayer.nickname}】点燃心灯赞叹 +1`);
    } catch (err: unknown) {
      onShowNotice(err instanceof Error ? err.message : '点赞异常');
    }
  };

  // 格式化装备词条提示
  const formatStatsText = (stats?: Record<string, any>) => {
    if (!stats || Object.keys(stats).length === 0) return '蕴含微弱天地灵气';
    const labels: Record<string, string> = {
      outer_attack: '攻击',
      inner_attack: '内功',
      defense: '防御',
      inner_defense: '内御',
      hp: '气血',
      hp_max: '气血上限',
      mp: '真气',
      mp_max: '真气上限',
      mp_regen: '内力恢复',
      speed: '遁速',
      dodge: '闪避',
      crit_rate: '暴击率',
      crit_dmg: '暴伤',
      perception: '感知',
      shield: '御气护体',
      ice_resist: '冰抗',
      metal_affinity: '庚金亲和',
    };
    return Object.entries(stats)
      .filter(([k]) => k !== 'description' && k !== 'purity')
      .map(([k, v]) => {
        const name = labels[k] || k;
        const valStr = typeof v === 'number' && v < 1 && v > 0 ? `${(v * 100).toFixed(0)}%` : `+${v}`;
        return `${name}${valStr}`;
      })
      .join('，');
  };

  const getQualityBadge = (quality: string) => {
    switch (quality) {
      case 'MYTHIC': return '神品';
      case 'LEGENDARY': return '绝品';
      case 'EPIC': return '极品';
      case 'RARE': return '灵品';
      default: return '凡品';
    }
  };

  // 动态检索展示目标道友的全息属性与穿戴装备
  const isSelf = profileData ? profileData.isSelf : (!viewingPlayerId || viewingPlayerId === player?.id);
  const matchingPartyMember = usePlayerStore.getState().party.find((m) => m.id === viewingPlayerId);
  const isCompanion = !!profileData?.isCompanion || (!isSelf && !!matchingPartyMember);

  // 兜底玩家对象：若在队伍中点击伙伴且 profileData 尚未返回，优先使用 partyMember 数据秒开
  const fallbackPlayer = matchingPartyMember
    ? {
        id: matchingPartyMember.id,
        nickname: matchingPartyMember.name,
        level: matchingPartyMember.level,
        exp: 0,
        hp: matchingPartyMember.hp ?? 10000,
        maxHp: matchingPartyMember.maxHp ?? 10000,
        mp: matchingPartyMember.mp ?? 200,
        maxMp: matchingPartyMember.maxMp ?? 200,
        combatPower: matchingPartyMember.combatPower ?? 1000,
        sect: matchingPartyMember.title?.split('·')[0]?.trim() || '同道仙盟',
        sectPosition: matchingPartyMember.role === 'DPS' ? '纯阳输出' : matchingPartyMember.role === 'HEALER' ? '妙手治疗' : matchingPartyMember.role === 'TANK' ? '玄甲御气' : '随行同道',
        realm: matchingPartyMember.realm || '筑基初期',
        signature: '与道友并肩同行，共履长生仙途。',
        avatar: matchingPartyMember.avatar,
        title: matchingPartyMember.title,
        silver: 0,
        ingot: 0,
        copper: 0,
        status: 'ONLINE' as const,
      }
    : player;

  const displayPlayer = profileData?.player || fallbackPlayer;
  const equippedItems = profileData?.equippedItems || inventory.filter((i) => i.isEquipped);
  const chronicles = profileData?.chronicles || [];

  const equippedWeapon = equippedItems.find((i) => i.slot === 'WEAPON');
  const equippedCrown = equippedItems.find((i) => i.slot === 'HELMET');
  const equippedArmor = equippedItems.find((i) => i.slot === 'ARMOR');
  const equippedBoots = equippedItems.find((i) => i.slot === 'BOOTS');
  const equippedArtifact = equippedItems.find((i) => i.slot === 'ARTIFACT');

  // 发起切磋邀请
  const handleInviteDuel = () => {
    if (!displayPlayer?.id) return;
    if (isSelf || displayPlayer.id === player?.id) {
      onShowNotice('无法与自己切磋');
      return;
    }
    if (!wsManager.isConnected()) {
      onShowNotice('尚未连接九州网络，无法发起切磋');
      return;
    }

    const sent = wsManager.sendMessage(
      MessageType.COMBAT,
      CombatAction.DUEL_INVITE,
      {
        targetPlayerId: displayPlayer.id,
      }
    );

    if (!sent) {
      onShowNotice('切磋邀请发送失败，请重试');
    }
    // 成功回执由服务端校验在线状态后通过 NOTICE:TOAST 下发
  };

  // 当唤起 NPC 弹窗时，实时通过 DialogueStore 驱动有向图对话引擎
  useEffect(() => {
    if (npcModal) {
      useDialogueStore.getState().openDialogue(npcModal);
    } else {
      useDialogueStore.getState().closeDialogue();
    }
  }, [npcModal]);

  // 对话动作：御剑传送（坐标已由服务端动作事务写入，前端只做状态刷新）
  const handleDialogueTeleport = async (
    target?: { zoneId: string; areaId: string } | null
  ) => {
    if (!target) return;
    onShowNotice(`神光遁现，已御剑移步至【${target.areaId}】`);
    await Promise.allSettled([
      usePlayerStore.getState().fetchProfile(),
      useMapStore.getState().fetchMap(target.areaId, true),
    ]);
  };

  /**
   * 启动剧情战斗：先向服务端要本场的双方阵容，再进入全屏战斗视口
   */
  const handleDialogueCombat = (payload: {
    battleType?: 'DIALOGUE' | 'ENCOUNTER';
    monsterGroupId?: string;
    npcId?: string;
    winNodeId?: string;
    loseNodeId?: string;
    storyContext?: {
      packageId: string;
      nodeId: string;
      completeOnFinish: boolean;
    };
  }) => {
    if (!wsManager.isConnected()) {
      onShowNotice('尚未连接九州网络，无法入阵迎敌');
      return;
    }

    const isEncounter = payload.battleType === 'ENCOUNTER';

    // 实时回合制战斗：剧情战走怪物组；遭遇战复用地图 NPC 的单人/战阵配置
    const sent = wsManager.sendMessage(MessageType.COMBAT, CombatAction.PVE_START, {
      battleType: isEncounter ? 'ENCOUNTER' : 'DIALOGUE',
      ...(isEncounter
        ? { npcId: payload.npcId, fromDialogue: true }
        : { monsterGroupId: payload.monsterGroupId }),
      winNodeId: payload.winNodeId,
      loseNodeId: payload.loseNodeId,
      storyContext: payload.storyContext,
    });

    if (!sent) {
      onShowNotice('神识传讯失败，无法入阵');
      return;
    }

    onShowNotice(isEncounter ? '强敌现身，速速迎战！' : '神识凝炼，步入演武残破石阵！');
  };

  return (
    <>
      {/* 1. 动态 NPC 交互有向图树对话弹窗 */}
      <DialogueModal
        onClose={onCloseNpc}
        onShowNotice={onShowNotice}
        onTeleport={handleDialogueTeleport}
        onCombat={handleDialogueCombat}
        onNodeChanged={() => {
          // 同一场景继续 / 跨场景关闭：剧情 NPC 的 scene_id 可能已变化
          const areaId =
            usePlayerStore.getState().player?.areaId ||
            usePlayerStore.getState().player?.currentMap;
          if (areaId) void useMapStore.getState().fetchMap(areaId, true);
        }}
        onDialogueEnd={() => {
          // 剧情结束后强制刷新当前地图 NPC 列表，让已完成的剧情 NPC 立即消失
          const areaId =
            usePlayerStore.getState().player?.areaId ||
            usePlayerStore.getState().player?.currentMap;
          if (areaId) void useMapStore.getState().fetchMap(areaId, true);
        }}
        onPartyChanged={() => {
          void usePlayerStore.getState().fetchParty();
        }}
      />

      {/* 2. 独立战斗全屏视口 */}
      <CombatView />

      {/* 2. 设施交互模态窗 */}
      {facilityModal &&
        (facilityModal.name === '悬壶馆' ? (
          <PharmacyModal
            isOpen={true}
            onClose={onCloseFacility}
            onShowNotice={onShowNotice}
          />
        ) : (
          <div className="fixed inset-0 z-50 bg-surface/80 backdrop-blur-sm flex items-center justify-center p-space-md">
            <div className="w-full max-w-sm rounded bg-gradient-to-b from-surface-container-high via-surface-container to-surface-container-low p-space-md shadow-2xl relative border border-outline-variant/40">
              <div className="flex items-center justify-between pb-2 border-b border-surface-container-highest">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[22px]">
                    temple_buddhist
                  </span>
                  <span className="text-primary font-headline-lg text-[18px]">
                    {facilityModal.name}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onCloseFacility}
                  className="w-8 h-8 rounded bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-primary"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <div className="py-space-xs space-y-2">
                <span className="text-tertiary font-label-md text-[12px] block">
                  {facilityModal.sub}
                </span>
                <div className="p-space-sm rounded bg-surface-container-lowest text-[12px] font-body-sm text-on-surface leading-relaxed">
                  {facilityModal.desc}
                </div>
              </div>

              <div className="mt-space-md flex items-center justify-end gap-space-sm">
                <button
                  type="button"
                  onClick={onCloseFacility}
                  className="px-3 py-1.5 rounded bg-surface-container-highest text-on-surface font-label-md text-[12px]"
                >
                  返回街市
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onCloseFacility();
                    onShowNotice(`已前往办理「${facilityModal.name}」相关事务。`);
                  }}
                  className="px-4 py-1.5 rounded bg-secondary-container text-on-secondary-container font-headline-sm text-[12px] font-bold shadow active:scale-95 transition-transform"
                >
                  {facilityModal.action || '立即前往'}
                </button>
              </div>
            </div>
          </div>
        ))}

      {/* 3. 侠客档案与属性弹窗 (完全复刻原型图全息侠客档案) */}
      {playerModal && (
        <div className="fixed inset-0 z-50 bg-surface/80 backdrop-blur-sm flex items-center justify-center p-space-md">
          <div className="w-full max-w-sm rounded bg-gradient-to-b from-surface-container-high to-surface-container-lowest p-space-md shadow-2xl relative max-h-[90vh] overflow-y-auto border border-outline-variant/40">
            {/* 弹窗头部 */}
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/30">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="material-symbols-outlined text-primary text-[20px] flex-shrink-0">badge</span>
                <span className="text-primary font-headline-md text-[15px] font-bold tracking-wide truncate">
                  侠客档案 · {displayPlayer?.nickname || (isCompanion ? '同道伙伴' : '修仙道友')}
                </span>
                {isCompanion ? (
                  <span className="bg-primary/20 text-primary border border-primary/40 text-[8px] font-data-metric px-1 py-0.2 rounded font-bold flex-shrink-0">
                    同道伙伴
                  </span>
                ) : (
                  <span className="bg-primary-container text-on-primary-container text-[8px] font-data-metric px-1 py-0.2 rounded font-bold flex-shrink-0">
                    V{displayPlayer?.vipLevel || 1}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={onClosePlayer}
                className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors flex-shrink-0"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {isProfileLoading ? (
              <div className="py-12 text-center text-on-surface-variant text-[11px] animate-pulse">
                天机玉鉴感应中，正在调阅修仙者全息卷宗...
              </div>
            ) : !profileData ? (
              <div className="py-12 text-center space-y-2">
                <p className="text-error text-[11px] font-serif px-4">
                  「{profileError || '天机玉鉴未感应到该道友的卷宗'}」
                </p>
                <button
                  type="button"
                  onClick={onClosePlayer}
                  className="px-3 py-1 rounded bg-surface-container-high text-[11px] text-on-surface hover:text-primary"
                >
                  收起卷宗
                </button>
              </div>
            ) : (
              <>
            {/* 角色名片与快捷互动动作 */}
            <div className="mt-2 p-2 rounded bg-surface-container-low border border-outline-variant/30 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="relative w-12 h-12 flex-shrink-0">
                  <div className="w-full h-full rounded overflow-hidden bg-surface-container-highest p-[1px] border border-primary/50 shadow-inner">
                    <img
                      className="w-full h-full object-cover rounded"
                      data-alt="修仙立绘"
                      alt={displayPlayer?.nickname || '修仙道友'}
                      src={displayPlayer?.avatar || ''}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                  <span className="absolute -bottom-1 -right-1 bg-secondary-container text-on-secondary-container text-[8px] font-label-sm px-1 rounded shadow">
                    Lv.{displayPlayer?.level || 1}
                  </span>
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-primary font-headline-sm text-[13px] font-bold truncate">
                      {displayPlayer?.nickname || '无名修士'}
                    </span>
                    <span className="bg-secondary/20 text-secondary text-[8px] font-label-sm px-1 py-0.2 rounded border border-secondary/30">
                      {displayPlayer?.title || '初入江湖'}
                    </span>
                  </div>
                  <span className="text-[10px] font-label-sm text-tertiary truncate mt-0.5">
                    {displayPlayer?.sect || '散修盟'} · {displayPlayer?.sectPosition || '散修'}
                  </span>
                  <div className="flex items-center gap-1 text-[9px] font-data-metric text-on-surface-variant mt-0.5">
                    <span className="material-symbols-outlined text-[11px] text-primary">swords</span>
                    <span>
                      战力: <strong className="text-primary font-bold">{displayPlayer?.combatPower?.toLocaleString() ?? '—'}</strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* 区分自己、伙伴与他人：若为自己则无操作按钮；若为伙伴展示身份状态；若为其他玩家展示私信切磋结交 */}
              {!isSelf && isCompanion && (
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="bg-primary/10 text-primary border border-primary/30 text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[11px]">groups</span>
                    同道随行
                  </span>
                  <span className="text-[8px] text-tertiary font-label-sm">
                    {displayPlayer?.sectPosition || '随行同道'}
                  </span>
                </div>
              )}
              {!isSelf && !isCompanion && (
                <div className="grid grid-cols-2 gap-1 flex-shrink-0">
                  <button
                    type="button"
                    className="px-2 py-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface text-[10px] font-label-sm flex items-center justify-center gap-0.5 active:scale-95 transition-all cursor-pointer"
                    onClick={() => setIsWhisperOpen(true)}
                  >
                    <span className="material-symbols-outlined text-[13px] text-tertiary">chat</span>
                    <span>私信</span>
                  </button>
                  <button
                    type="button"
                    disabled={isFriendActionLoading}
                    className={`px-2 py-1 rounded text-[10px] font-label-sm font-bold flex items-center justify-center gap-0.5 active:scale-95 transition-all shadow-sm cursor-pointer ${
                      friendStatus?.isFriend
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                        : friendStatus?.isPending
                        ? 'bg-surface-container text-on-surface-variant border border-outline-variant/30 opacity-80'
                        : friendStatus?.hasIncoming
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white animate-pulse'
                        : 'bg-primary-container text-on-primary-container hover:brightness-110'
                    }`}
                    onClick={handleFriendAction}
                  >
                    <span className="material-symbols-outlined text-[13px]">
                      {friendStatus?.isFriend ? 'diversity_1' : friendStatus?.hasIncoming ? 'check' : 'person_add'}
                    </span>
                    <span>
                      {friendStatus?.isFriend
                        ? '仙友'
                        : friendStatus?.isPending
                        ? '已申请'
                        : friendStatus?.hasIncoming
                        ? '应允结交'
                        : '结交'}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 rounded bg-surface-container hover:bg-surface-container-high text-primary font-bold text-[10px] font-label-sm flex items-center justify-center gap-0.5 active:scale-95 transition-all cursor-pointer border border-primary/30 hover:border-primary/60 shadow-sm"
                    onClick={handleInviteDuel}
                  >
                    <span className="material-symbols-outlined text-[13px] text-primary">sports_martial_arts</span>
                    <span>切磋</span>
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 rounded bg-secondary-container hover:bg-secondary text-on-secondary-container text-[10px] font-label-sm font-bold flex items-center justify-center gap-0.5 active:scale-95 transition-all shadow-sm opacity-80 cursor-pointer"
                    onClick={() => onShowNotice('生死决斗功能暂未开放')}
                  >
                    <span className="material-symbols-outlined text-[13px]">local_fire_department</span>
                    <span>决斗</span>
                  </button>
                </div>
              )}
            </div>

            {/* 核心道行状态：等级、气血、内力值 */}
            <div className="mt-2 p-2 rounded bg-surface-container-lowest/90 border border-outline-variant/30 space-y-1.5 shadow-inner">
              {/* 等级与战力 */}
              <div className="flex items-center justify-between text-[11px] pb-1 border-b border-outline-variant/20">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px] text-primary">military_tech</span>
                  <span className="text-on-surface-variant font-label-sm text-[10px]">仙途等级</span>
                  <span className="bg-primary/10 text-primary font-bold text-[11px] px-1.5 py-0.2 rounded border border-primary/30 font-data-metric">
                    Lv.{displayPlayer?.level ?? 1}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[13px] text-primary">swords</span>
                  <span className="text-[10px] text-on-surface-variant font-label-sm">战力</span>
                  <span className="text-primary font-headline-sm text-[12px] font-bold font-data-metric">
                    {displayPlayer?.combatPower?.toLocaleString() ?? '—'}
                  </span>
                </div>
              </div>

              {/* 气血 HP */}
              <div className="space-y-0.5">
                <div className="flex items-center justify-between text-[10px] font-data-metric">
                  <span className="flex items-center gap-1 text-secondary font-bold">
                    <span className="material-symbols-outlined text-[12px]">favorite</span>
                    气血
                  </span>
                  <span className="text-secondary font-bold">
                    {(displayPlayer?.hp ?? 0).toLocaleString()} / {(displayPlayer?.maxHp ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="w-full h-2 rounded bg-surface-container-highest overflow-hidden p-[1px]">
                  <div
                    className="h-full bg-gradient-to-r from-secondary-container to-secondary rounded transition-all duration-300"
                    style={{
                      width: `${
                        (displayPlayer?.maxHp ?? 0) > 0
                          ? Math.min(
                              100,
                              Math.max(
                                0,
                                Math.round(
                                  ((displayPlayer?.hp ?? 0) / (displayPlayer?.maxHp ?? 1)) * 100
                                )
                              )
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>

              {/* 内力值 MP */}
              <div className="space-y-0.5">
                <div className="flex items-center justify-between text-[10px] font-data-metric">
                  <span className="flex items-center gap-1 text-tertiary font-bold">
                    <span className="material-symbols-outlined text-[12px]">bolt</span>
                    内力值
                  </span>
                  <span className="text-tertiary font-bold">
                    {(displayPlayer?.mp ?? 0).toLocaleString()} / {(displayPlayer?.maxMp ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="w-full h-2 rounded bg-surface-container-highest overflow-hidden p-[1px]">
                  <div
                    className="h-full bg-gradient-to-r from-on-tertiary-fixed-variant to-tertiary rounded transition-all duration-300"
                    style={{
                      width: `${
                        (displayPlayer?.maxMp ?? 0) > 0
                          ? Math.min(
                              100,
                              Math.max(
                                0,
                                Math.round(
                                  ((displayPlayer?.mp ?? 0) / (displayPlayer?.maxMp ?? 1)) * 100
                                )
                              )
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* 六维修仙道境网格 */}
            <div className="mt-2 space-y-2 text-[11px] font-body-sm">
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 p-2 rounded bg-surface-container-low border border-outline-variant/30 text-[10px]">
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant">宗门势力</span>
                  <span className="text-on-surface font-semibold">{displayPlayer?.sect || '散修盟'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant">仙籍道境</span>
                  <span className="text-primary font-bold">{displayPlayer?.realm || '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant">本命飞剑</span>
                  <span className="text-primary font-bold">
                    {equippedWeapon ? `${equippedWeapon.itemName} (+${equippedWeapon.enhanceLevel})` : '暂未佩戴'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant">灵根天赋</span>
                  <span className="text-tertiary font-bold">{displayPlayer?.spiritualRoot || '五行杂灵根'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant">仙盟声望</span>
                  <span className="text-on-surface">{displayPlayer?.reputation || '初出茅庐 (壹品)'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant">洞府灵脉</span>
                  <span className="text-tertiary-fixed">{displayPlayer?.residence || '长乐客栈·丙等'}</span>
                </div>
              </div>

              {/* 已穿戴配件与法宝 */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant font-label-sm text-[10px]">已穿戴配件与法宝：</span>
                  <span
                    className="text-[9px] font-data-metric text-primary cursor-pointer hover:underline"
                    onClick={() => onShowNotice('全套神装共鸣已激活，受真气加持')}
                  >
                    灵韵共鸣 ›
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1 text-center">
                  <div
                    className="p-1.5 rounded bg-surface-container border border-outline-variant/30 flex flex-col items-center gap-0.5 hover:border-primary/50 cursor-pointer transition-colors"
                    onClick={() =>
                      equippedCrown
                        ? onShowNotice(`【${equippedCrown.itemName} (+${equippedCrown.enhanceLevel})】：${formatStatsText(equippedCrown.stats)}`)
                        : onShowNotice('头部未佩戴冠饰')
                    }
                  >
                    <span className="material-symbols-outlined text-[14px] text-primary">crown</span>
                    <span className="text-[10px] text-primary truncate w-full font-semibold">
                      {equippedCrown?.itemName || '未佩戴'}
                    </span>
                    <span className="text-[8px] text-tertiary font-data-metric scale-90">
                      {equippedCrown ? `+${equippedCrown.enhanceLevel} ${getQualityBadge(equippedCrown.quality)}` : '空置'}
                    </span>
                  </div>
                  <div
                    className="p-1.5 rounded bg-surface-container border border-outline-variant/30 flex flex-col items-center gap-0.5 hover:border-primary/50 cursor-pointer transition-colors"
                    onClick={() =>
                      equippedArmor
                        ? onShowNotice(`【${equippedArmor.itemName} (+${equippedArmor.enhanceLevel})】：${formatStatsText(equippedArmor.stats)}`)
                        : onShowNotice('躯干未穿戴衣袍')
                    }
                  >
                    <span className="material-symbols-outlined text-[14px] text-primary">apparel</span>
                    <span className="text-[10px] text-primary truncate w-full font-semibold">
                      {equippedArmor?.itemName || '未穿戴'}
                    </span>
                    <span className="text-[8px] text-tertiary font-data-metric scale-90">
                      {equippedArmor ? `+${equippedArmor.enhanceLevel} ${getQualityBadge(equippedArmor.quality)}` : '空置'}
                    </span>
                  </div>
                  <div
                    className="p-1.5 rounded bg-surface-container border border-outline-variant/30 flex flex-col items-center gap-0.5 hover:border-primary/50 cursor-pointer transition-colors"
                    onClick={() =>
                      equippedBoots
                        ? onShowNotice(`【${equippedBoots.itemName} (+${equippedBoots.enhanceLevel})】：${formatStatsText(equippedBoots.stats)}`)
                        : onShowNotice('足部未穿戴云履')
                    }
                  >
                    <span className="material-symbols-outlined text-[14px] text-primary">skateboarding</span>
                    <span className="text-[10px] text-primary truncate w-full font-semibold">
                      {equippedBoots?.itemName || '未穿戴'}
                    </span>
                    <span className="text-[8px] text-tertiary font-data-metric scale-90">
                      {equippedBoots ? `+${equippedBoots.enhanceLevel} ${getQualityBadge(equippedBoots.quality)}` : '空置'}
                    </span>
                  </div>
                  <div
                    className="p-1.5 rounded bg-surface-container border border-outline-variant/30 flex flex-col items-center gap-0.5 hover:border-primary/50 cursor-pointer transition-colors"
                    onClick={() =>
                      equippedArtifact
                        ? onShowNotice(`【${equippedArtifact.itemName} (+${equippedArtifact.enhanceLevel})】：${formatStatsText(equippedArtifact.stats)}`)
                        : onShowNotice('随身未佩戴法宝')
                    }
                  >
                    <span className="material-symbols-outlined text-[14px] text-tertiary">diamond</span>
                    <span className="text-[10px] text-tertiary truncate w-full font-semibold">
                      {equippedArtifact?.itemName || '未佩戴'}
                    </span>
                    <span className="text-[8px] text-tertiary font-data-metric scale-90">
                      {equippedArtifact ? `+${equippedArtifact.enhanceLevel} ${getQualityBadge(equippedArtifact.quality)}` : '空置'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 仙友道签 / 个性签名 */}
              <div className="p-2 rounded bg-gradient-to-r from-surface-container-lowest via-surface-container to-surface-container-lowest border border-primary/30 relative shadow-sm">
                <div className="flex items-center justify-between pb-1 mb-1 border-b border-outline-variant/30">
                  <div className="flex items-center gap-1 text-primary text-[10px] font-bold">
                    <span className="material-symbols-outlined text-[13px]">format_quote</span>
                    <span>道心墨宝 · 本命道签</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      className={`flex items-center gap-0.5 text-[9px] transition-colors cursor-pointer px-1.5 py-0.2 rounded ${
                        hasLiked
                          ? 'bg-primary-container text-on-primary-container font-bold'
                          : 'bg-surface-container-high text-tertiary hover:text-primary'
                      }`}
                      onClick={handleLike}
                    >
                      <span className="material-symbols-outlined text-[11px]">thumb_up</span>
                      <span>{profileLikes.toLocaleString()}</span>
                    </button>
                    {isSelf && (
                      <button
                        type="button"
                        className="text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
                        onClick={() => onShowNotice('本命签名每日可参悟修改一次')}
                        title="修饰签名"
                      >
                        <span className="material-symbols-outlined text-[12px]">edit_note</span>
                      </button>
                    )}
                  </div>
                </div>
                <p className="italic text-[11px] text-primary-fixed tracking-wide text-center font-headline-sm py-0.5 leading-snug drop-shadow-sm">
                  “ {displayPlayer?.signature || '一剑霜寒十四州，笑看九州烟雨休。'} ”
                </p>
              </div>

              {/* 生平履历 · 江湖纪事大事记 */}
              <div className="p-2 rounded bg-surface-container-low border border-outline-variant/30 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[13px] text-primary">history_edu</span>
                    <span className="text-[11px] font-bold text-primary tracking-wide">
                      生平履历 · 江湖纪事
                    </span>
                  </div>
                  <span className="text-[8px] font-data-metric text-on-surface-variant">
                    {chronicles.length} 幕仙缘 · 江湖留名
                  </span>
                </div>

                {/* 竖向时间轴 */}
                <div className="relative pl-3.5 space-y-2 mt-1">
                  {chronicles.length > 0 && (
                    <div className="absolute left-1.5 top-1 bottom-1 w-[1px] bg-gradient-to-b from-primary via-tertiary to-outline-variant/40" />
                  )}

                  {chronicles.length === 0 ? (
                    <div className="py-2 text-center text-[10px] text-on-surface-variant">
                      暂无江湖纪事记述
                    </div>
                  ) : (
                    chronicles.map((node, idx) => (
                      <div key={node.id || idx} className="relative group">
                        <span
                          className={`absolute -left-3 top-1 w-2 h-2 rounded-full border ${
                            idx === chronicles.length - 1
                              ? 'bg-primary ring-2 ring-primary/30 border-primary'
                              : 'bg-surface-container-highest border-primary/70'
                          } flex items-center justify-center`}
                        />
                        <div className="flex items-baseline justify-between">
                          <span className="text-[10px] font-bold text-primary-fixed">{node.title}</span>
                          <span className="text-[8px] font-data-metric text-on-surface-variant">{node.year}</span>
                        </div>
                        <p className="text-[9px] text-on-surface-variant leading-tight mt-0.5">
                          {node.content}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* 弹窗底部 */}
            </>
            )}

            {/* 私信密语发送模态弹窗 */}
            {isWhisperOpen && (
              <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 animate-fadeIn">
                <div className="w-full max-w-xs bg-surface-container-high rounded p-3 border border-amber-400/40 shadow-2xl flex flex-col gap-2">
                  <div className="flex items-center justify-between pb-1.5 border-b border-outline-variant/30">
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-amber-400 text-[16px]">chat</span>
                      <span className="text-primary font-headline-sm text-xs font-bold">
                        私信传音 · 【{displayPlayer?.nickname}】
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsWhisperOpen(false)}
                      className="text-on-surface-variant hover:text-on-surface text-xs"
                    >
                      ✕
                    </button>
                  </div>

                  <textarea
                    value={whisperContent}
                    onChange={(e) => setWhisperContent(e.target.value)}
                    rows={3}
                    className="w-full text-xs p-2 rounded bg-surface-container-lowest text-on-surface border border-outline-variant/40 focus:border-primary outline-none resize-none"
                    maxLength={200}
                  />

                  <div className="flex items-center justify-between text-[9px] text-on-surface-variant">
                    <span>飞鸽千里传音 (上限200字)</span>
                    <span>{whisperContent.length}/200</span>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsWhisperOpen(false)}
                      className="px-2.5 py-1 rounded bg-surface-container text-on-surface text-xs"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={handleSendWhisper}
                      disabled={isSendingWhisper || !whisperContent.trim()}
                      className="px-3 py-1 rounded bg-primary-container text-on-primary-container font-bold text-xs shadow active:scale-95 disabled:opacity-50 transition-all flex items-center gap-1"
                    >
                      {isSendingWhisper ? '飞鸽穿云中...' : '发送传音'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* 4. 收到切磋邀请弹窗 (DuelInviteModal) */}
      {incomingDuel && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in font-serif">
          <div className="w-full max-w-xs bg-slate-900 border-2 border-amber-500/80 rounded-xl p-5 shadow-[0_0_30px_rgba(245,158,11,0.25)] relative overflow-hidden flex flex-col items-center text-center">
            {/* 顶部金光背景晕影 */}
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-40 h-40 bg-amber-500/15 rounded-full blur-2xl pointer-events-none" />

            {/* 标题栏 */}
            <div className="flex items-center gap-1.5 text-amber-400 mb-2">
              <span className="material-symbols-outlined text-[20px]">sports_martial_arts</span>
              <span className="text-base font-black tracking-widest">切 磋 邀 战</span>
            </div>

            {/* 倒计时标签 */}
            <div className="px-2.5 py-0.5 rounded-full bg-amber-950/60 border border-amber-500/30 text-[10px] text-amber-300 mb-3 flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px] animate-pulse">timer</span>
              <span>倒计时 {duelCountdown} 秒</span>
            </div>

            {/* 挑战者卡片 */}
            <div className="w-full p-3 rounded-lg bg-slate-800/90 border border-amber-500/20 mb-3 flex items-center gap-3 text-left">
              <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-amber-400/60 bg-slate-950 flex-shrink-0 flex items-center justify-center shadow-inner">
                {incomingDuel.challengerAvatar ? (
                  <img
                    src={incomingDuel.challengerAvatar}
                    alt={incomingDuel.challengerName}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <span className="material-symbols-outlined text-amber-400 text-2xl">person</span>
                )}
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="text-amber-200 font-bold text-sm truncate">
                    {incomingDuel.challengerName}
                  </span>
                  <span className="text-[10px] text-amber-400 font-mono">
                    Lv.{incomingDuel.challengerLevel}
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 mt-0.5">
                  境界: <span className="text-teal-300 font-semibold">{incomingDuel.challengerRealm || '练气期'}</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  战力: <span className="text-amber-400 font-bold">{incomingDuel.challengerCombatPower?.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* 邀请词 */}
            <p className="text-xs text-amber-100/80 mb-4 leading-relaxed font-sans px-1">
              “道友法力高强，在下心向往之。特请登台切磋论道，以武会友、共悟长生大道！”
            </p>

            {/* 决策操作按钮 */}
            <div className="grid grid-cols-2 gap-2 w-full">
              <button
                type="button"
                onClick={handleRejectDuel}
                className="py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 active:scale-95 transition-all cursor-pointer"
              >
                婉言谢绝
              </button>
              <button
                type="button"
                onClick={handleAcceptDuel}
                className="py-2 px-3 rounded-lg bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white text-xs font-bold shadow-[0_2px_10px_rgba(245,158,11,0.4)] border border-amber-400/60 active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[14px]">swords</span>
                <span>拔剑应战</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
