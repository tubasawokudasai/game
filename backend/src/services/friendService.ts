import { Env } from '../models/env';
import { PlayerRecord } from '../models/types';
import { MessageType, NoticeAction, MailAction, createWsMessage } from '../models/ws';

export interface FriendDto {
  friendshipId: string;
  friendId: string;
  nickname: string;
  avatar: string;
  level: number;
  realm: string;
  sect: string;
  sectPosition?: string;
  combatPower: number;
  title?: string;
  signature?: string;
  status: string;
  createdAt: string;
}

export interface FriendRequestDto {
  requestId: string;
  senderId: string;
  nickname: string;
  avatar: string;
  level: number;
  realm: string;
  sect: string;
  combatPower: number;
  title?: string;
  status: string;
  mailId?: string;
  createdAt: string;
}

export class FriendService {
  /**
   * 获取当前道友的仙友名册
   */
  async getFriends(db: D1Database, playerId: string): Promise<FriendDto[]> {
    const query = `
      SELECT
        f.id AS friendshipId,
        f.created_at AS createdAt,
        p.id AS friendId,
        p.nickname,
        p.avatar,
        p.level,
        p.realm,
        p.sect,
        p.sect_position AS sectPosition,
        p.combat_power AS combatPower,
        p.title,
        p.signature,
        p.status
      FROM friends f
      JOIN players p ON f.friend_id = p.id
      WHERE f.player_id = ?
      ORDER BY f.created_at DESC
    `;

    const res = await db.prepare(query).bind(playerId).all<FriendDto>();
    return res.results || [];
  }

  /**
   * 获取当前道友收到的待处理结交申请
   */
  async getPendingRequests(db: D1Database, receiverId: string): Promise<FriendRequestDto[]> {
    const query = `
      SELECT
        r.id AS requestId,
        r.status,
        r.mail_id AS mailId,
        r.created_at AS createdAt,
        p.id AS senderId,
        p.nickname,
        p.avatar,
        p.level,
        p.realm,
        p.sect,
        p.combat_power AS combatPower,
        p.title
      FROM friend_requests r
      JOIN players p ON r.sender_id = p.id
      WHERE r.receiver_id = ? AND r.status = 'PENDING'
      ORDER BY r.created_at DESC
    `;

    const res = await db.prepare(query).bind(receiverId).all<FriendRequestDto>();
    return res.results || [];
  }

  /**
   * 检查与目标道友的结交关系状态
   */
  async checkFriendStatus(
    db: D1Database,
    playerId: string,
    targetPlayerId: string
  ): Promise<{
    isFriend: boolean;
    isPending: boolean;
    hasIncoming: boolean;
    requestId?: string;
  }> {
    if (playerId === targetPlayerId) {
      return { isFriend: false, isPending: false, hasIncoming: false };
    }

    const friendRow = await db
      .prepare('SELECT id FROM friends WHERE player_id = ? AND friend_id = ? LIMIT 1')
      .bind(playerId, targetPlayerId)
      .first<{ id: string }>();

    if (friendRow) {
      return { isFriend: true, isPending: false, hasIncoming: false };
    }

    const pendingRow = await db
      .prepare(
        "SELECT id FROM friend_requests WHERE sender_id = ? AND receiver_id = ? AND status = 'PENDING' LIMIT 1"
      )
      .bind(playerId, targetPlayerId)
      .first<{ id: string }>();

    const incomingRow = await db
      .prepare(
        "SELECT id FROM friend_requests WHERE sender_id = ? AND receiver_id = ? AND status = 'PENDING' LIMIT 1"
      )
      .bind(targetPlayerId, playerId)
      .first<{ id: string }>();

    return {
      isFriend: false,
      isPending: Boolean(pendingRow),
      hasIncoming: Boolean(incomingRow),
      requestId: incomingRow?.id || pendingRow?.id,
    };
  }

  /**
   * 发起仙友结交申请：
   * 1. 强校验双方在册有效性
   * 2. 写入 friend_requests 表
   * 3. 生成 SYSTEM 级结交信函写入 mails 与 mail_attachments
   * 4. 通过 ZoneDO 向对方实时私发 WebSocket 通知
   */
  async sendFriendRequest(
    db: D1Database,
    env: Env,
    senderId: string,
    targetPlayerId: string,
    message?: string
  ): Promise<{ success: boolean; message: string; requestId?: string; isAlreadyFriends?: boolean }> {
    if (senderId === targetPlayerId) {
      throw new Error('修仙路漫漫，不可与自身结为仙友');
    }

    const [sender, target] = await Promise.all([
      db.prepare('SELECT * FROM players WHERE id = ?').bind(senderId).first<PlayerRecord>(),
      db.prepare('SELECT * FROM players WHERE id = ?').bind(targetPlayerId).first<PlayerRecord>(),
    ]);

    if (!sender) {
      throw new Error('发信修仙者不存在或凭证已失效');
    }
    if (!target) {
      throw new Error('结交道友不存在于九州名册中');
    }

    // 检查是否已是仙友
    const existingFriend = await db
      .prepare('SELECT id FROM friends WHERE player_id = ? AND friend_id = ? LIMIT 1')
      .bind(senderId, targetPlayerId)
      .first<{ id: string }>();

    if (existingFriend) {
      return {
        success: true,
        message: `你与【${target.nickname}】早已是生死莫逆仙友！`,
        isAlreadyFriends: true,
      };
    }

    // 检查对方是否之前已向我发起过申请 -> 若有则直接促成结交！
    const incomingReq = await db
      .prepare(
        "SELECT id FROM friend_requests WHERE sender_id = ? AND receiver_id = ? AND status = 'PENDING' LIMIT 1"
      )
      .bind(targetPlayerId, senderId)
      .first<{ id: string }>();

    if (incomingReq) {
      // 双方心有灵犀，直接同意！
      await this.acceptFriendRequest(db, env, senderId, { requestId: incomingReq.id });
      return {
        success: true,
        message: `心有灵犀！【${target.nickname}】此前亦递交了名帖，二位仙友正式缔结道契！`,
        isAlreadyFriends: true,
      };
    }

    // 检查是否已有等待对方处理的申请
    const existingPending = await db
      .prepare(
        "SELECT id FROM friend_requests WHERE sender_id = ? AND receiver_id = ? AND status = 'PENDING' LIMIT 1"
      )
      .bind(senderId, targetPlayerId)
      .first<{ id: string }>();

    if (existingPending) {
      return {
        success: true,
        message: `已向【${target.nickname}】递过结交仙帖，静候道友应答即可。`,
        requestId: existingPending.id,
      };
    }

    const requestId = `freq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const mailId = `mail_fr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const attachmentId = `att_fr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const expireAt = Math.floor(Date.now() / 1000) + 30 * 86400;

    const mailTitle = `【仙友结交】来自【${sender.nickname}】的结交名帖`;
    const mailContent = message?.trim()
      ? `道友【${sender.nickname}】（${sender.realm || '炼气期'} · ${sender.sect || '散修盟'}）向你递上名帖，留言道：“${message.trim()}”。愿与你结为莫逆仙友，同游九州。`
      : `见字如晤！道友【${sender.nickname}】（${sender.realm || '炼气期'} · ${sender.sect || '散修盟'}）倾慕道友风采，特奉上名帖愿与你结为仙友，共参玄妙大道、同历红尘杀劫。`;

    const attachmentPayload = {
      requestId,
      senderId,
      senderName: sender.nickname,
      senderAvatar: sender.avatar,
      senderLevel: sender.level,
      senderRealm: sender.realm,
      senderSect: sender.sect,
      senderCombatPower: sender.combat_power,
      name: `仙友名帖 · 【${sender.nickname}】`,
      description: `来自【${sender.nickname}】的同道结交信笺`,
    };

    // 写入数据库事务
    await db.batch([
      // 1. 结交申请记录 (若之前被拒绝则更新为 PENDING)
      db.prepare(
        `INSERT INTO friend_requests (id, sender_id, receiver_id, status, mail_id, created_at, updated_at)
         VALUES (?, ?, ?, 'PENDING', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(sender_id, receiver_id) DO UPDATE SET
           id = excluded.id,
           status = 'PENDING',
           mail_id = excluded.mail_id,
           updated_at = CURRENT_TIMESTAMP`
      ).bind(requestId, senderId, targetPlayerId, mailId),

      // 2. 插入系统邮件
      db.prepare(
        `INSERT INTO mails (id, sender_id, sender_name, receiver_id, title, content, mail_type, has_attachment, is_read, is_claimed, expire_at)
         VALUES (?, ?, ?, ?, ?, ?, 'SYSTEM', 1, 0, 0, ?)`
      ).bind(mailId, senderId, sender.nickname, targetPlayerId, mailTitle, mailContent, expireAt),

      // 3. 插入邮件附件声明
      db.prepare(
        `INSERT INTO mail_attachments (id, mail_id, count, silver, ingot, grant_type, grant_payload, item_snapshot)
         VALUES (?, ?, 1, 0, 0, 'FRIEND_REQUEST', ?, ?)`
      ).bind(
        attachmentId,
        mailId,
        JSON.stringify(attachmentPayload),
        JSON.stringify({ name: `仙友名帖 · 【${sender.nickname}】`, quality: 'EPIC' })
      ),
    ]);

    // 4. WebSocket 实时向接收方投递通知与 MAIL_NEW
    this.pushWsNotice(env, targetPlayerId, {
      toast: `道友【${sender.nickname}】向你发来结交仙帖，请查阅飞鸽传书！`,
      mail: {
        mailId,
        title: mailTitle,
        senderName: sender.nickname,
        hasAttachment: true,
      },
      action: 'FRIEND_REQUEST',
      extra: attachmentPayload,
    });

    return {
      success: true,
      message: `已向【${target.nickname}】递交结交名帖，静候道友应答！`,
      requestId,
    };
  }

  /**
   * 同意结交申请：
   * 1. 双方互写入 friends 表 (双向奔赴)
   * 2. 更新申请状态为 ACCEPTED
   * 3. 回写邮件为已领取
   * 4. 发送回执系统信件给申请方
   * 5. WebSocket 实时通知双方
   */
  async acceptFriendRequest(
    db: D1Database,
    env: Env,
    receiverId: string,
    params: { requestId?: string; senderId?: string; mailId?: string }
  ): Promise<{ success: boolean; message: string; friend?: FriendDto }> {
    // 寻址对应申请记录
    let request: { id: string; sender_id: string; receiver_id: string; mail_id: string | null } | null = null;

    if (params.requestId) {
      request = await db
        .prepare('SELECT id, sender_id, receiver_id, mail_id FROM friend_requests WHERE id = ?')
        .bind(params.requestId)
        .first();
    } else if (params.senderId) {
      request = await db
        .prepare(
          "SELECT id, sender_id, receiver_id, mail_id FROM friend_requests WHERE sender_id = ? AND receiver_id = ? AND status = 'PENDING' LIMIT 1"
        )
        .bind(params.senderId, receiverId)
        .first();
    } else if (params.mailId) {
      request = await db
        .prepare('SELECT id, sender_id, receiver_id, mail_id FROM friend_requests WHERE mail_id = ? LIMIT 1')
        .bind(params.mailId)
        .first();
    }

    if (!request) {
      // 兜底：若未找到显式 request，但提供了 senderId，尝试校验后直接结交
      if (params.senderId) {
        request = {
          id: `freq_${Date.now()}_auto`,
          sender_id: params.senderId,
          receiver_id: receiverId,
          mail_id: params.mailId || null,
        };
      } else {
        throw new Error('未找到有效的结交申请记录或申请已失效');
      }
    }

    const senderId = request.sender_id;
    if (request.receiver_id !== receiverId && receiverId !== senderId) {
      throw new Error('无权处理此条结交申请');
    }

    const [sender, receiver] = await Promise.all([
      db.prepare('SELECT * FROM players WHERE id = ?').bind(senderId).first<PlayerRecord>(),
      db.prepare('SELECT * FROM players WHERE id = ?').bind(receiverId).first<PlayerRecord>(),
    ]);

    if (!sender || !receiver) {
      throw new Error('修仙者数据异常，结交缔结失败');
    }

    const frId1 = `fr_${receiverId}_${senderId}`;
    const frId2 = `fr_${senderId}_${receiverId}`;
    const confirmMailId = `mail_confirm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const expireAt = Math.floor(Date.now() / 1000) + 30 * 86400;

    const statements: D1PreparedStatement[] = [
      // 1. 双方双向写入 friends 表
      db.prepare(
        'INSERT INTO friends (id, player_id, friend_id) VALUES (?, ?, ?) ON CONFLICT(player_id, friend_id) DO NOTHING'
      ).bind(frId1, receiverId, senderId),
      db.prepare(
        'INSERT INTO friends (id, player_id, friend_id) VALUES (?, ?, ?) ON CONFLICT(player_id, friend_id) DO NOTHING'
      ).bind(frId2, senderId, receiverId),

      // 2. 更新申请状态为 ACCEPTED
      db.prepare(
        "UPDATE friend_requests SET status = 'ACCEPTED', updated_at = CURRENT_TIMESTAMP WHERE sender_id = ? AND receiver_id = ?"
      ).bind(senderId, receiverId),
    ];

    // 3. 若有对应邮件，一并标记为已读已领
    if (request.mail_id || params.mailId) {
      const mId = request.mail_id || params.mailId;
      statements.push(
        db.prepare('UPDATE mails SET is_read = 1, is_claimed = 1 WHERE id = ?').bind(mId),
        db.prepare('UPDATE mail_attachments SET claimed_at = CURRENT_TIMESTAMP WHERE mail_id = ?').bind(mId)
      );
    }

    // 4. 给发起人（sender）下发【仙缘已谐】系统信函
    statements.push(
      db.prepare(
        `INSERT INTO mails (id, sender_id, sender_name, receiver_id, title, content, mail_type, has_attachment, is_read, is_claimed, expire_at)
         VALUES (?, NULL, '九州仙鉴', ?, ?, ?, 'SYSTEM', 0, 0, 1, ?)`
      ).bind(
        confirmMailId,
        senderId,
        `【仙缘已谐】你与【${receiver.nickname}】已结为仙友`,
        `道友【${receiver.nickname}】已欣然应允你的结交之约！从此二人同心、其利断金，愿两位道友在长乐仙途并肩斩妖、同登仙阶！`,
        expireAt
      )
    );

    await db.batch(statements);

    // 5. 实时推送给申请人 (sender)
    this.pushWsNotice(env, senderId, {
      toast: `道友【${receiver.nickname}】已同意您的结交申请，二人正式结为仙友！`,
      mail: {
        mailId: confirmMailId,
        title: `【仙缘已谐】你与【${receiver.nickname}】已结为仙友`,
        senderName: '九州仙鉴',
        hasAttachment: false,
      },
      action: 'FRIEND_ACCEPTED',
      extra: {
        friendId: receiverId,
        nickname: receiver.nickname,
        avatar: receiver.avatar,
      },
    });

    return {
      success: true,
      message: `已欣然应允，与【${sender.nickname}】正式结为仙友！`,
      friend: {
        friendshipId: frId1,
        friendId: sender.id,
        nickname: sender.nickname,
        avatar: sender.avatar,
        level: sender.level,
        realm: sender.realm,
        sect: sender.sect,
        sectPosition: sender.sect_position,
        combatPower: sender.combat_power,
        title: sender.title,
        signature: sender.signature,
        status: sender.status,
        createdAt: new Date().toISOString(),
      },
    };
  }

  /**
   * 婉言谢绝结交申请
   */
  async rejectFriendRequest(
    db: D1Database,
    receiverId: string,
    params: { requestId?: string; senderId?: string; mailId?: string }
  ): Promise<{ success: boolean; message: string }> {
    const statements: D1PreparedStatement[] = [];

    if (params.requestId) {
      statements.push(
        db.prepare(
          "UPDATE friend_requests SET status = 'REJECTED', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND receiver_id = ?"
        ).bind(params.requestId, receiverId)
      );
    } else if (params.senderId) {
      statements.push(
        db.prepare(
          "UPDATE friend_requests SET status = 'REJECTED', updated_at = CURRENT_TIMESTAMP WHERE sender_id = ? AND receiver_id = ?"
        ).bind(params.senderId, receiverId)
      );
    }

    if (params.mailId) {
      statements.push(
        db.prepare('UPDATE mails SET is_read = 1, is_claimed = 1 WHERE id = ? AND receiver_id = ?')
          .bind(params.mailId, receiverId),
        db.prepare('UPDATE mail_attachments SET claimed_at = CURRENT_TIMESTAMP WHERE mail_id = ?')
          .bind(params.mailId)
      );
    }

    if (statements.length > 0) {
      await db.batch(statements);
    }

    return { success: true, message: '已婉言谢绝结交申请' };
  }

  /**
   * 解除仙友关系 (单方解除，双向移除)
   */
  async removeFriend(
    db: D1Database,
    playerId: string,
    friendId: string
  ): Promise<{ success: boolean; message: string }> {
    await db
      .prepare('DELETE FROM friends WHERE (player_id = ? AND friend_id = ?) OR (player_id = ? AND friend_id = ?)')
      .bind(playerId, friendId, friendId, playerId)
      .run();

    return { success: true, message: '已解除仙友羁绊' };
  }

  /**
   * 搜索在册修仙道友
   */
  async searchPlayers(
    db: D1Database,
    currentUserId: string,
    keyword: string
  ): Promise<Array<{
    id: string;
    nickname: string;
    avatar: string;
    level: number;
    realm: string;
    sect: string;
    combatPower: number;
    title?: string;
    isFriend: boolean;
  }>> {
    const term = `%${keyword.trim()}%`;
    const rows = await db
      .prepare(
        `SELECT id, nickname, avatar, level, realm, sect, combat_power as combatPower, title
         FROM players
         WHERE id != ? AND (nickname LIKE ? OR id = ?)
         LIMIT 12`
      )
      .bind(currentUserId, term, keyword.trim())
      .all<any>();

    const players = rows.results || [];
    if (players.length === 0) return [];

    // 查询当前用户的全部好友 ID
    const myFriends = await db
      .prepare('SELECT friend_id FROM friends WHERE player_id = ?')
      .bind(currentUserId)
      .all<{ friend_id: string }>();

    const friendIdSet = new Set((myFriends.results || []).map((f) => f.friend_id));

    return players.map((p) => ({
      ...p,
      isFriend: friendIdSet.has(p.id),
    }));
  }

  /**
   * 异步实时推送 WebSocket 消息
   */
  private async pushWsNotice(
    env: Env,
    targetPlayerId: string,
    opts: {
      toast?: string;
      mail?: { mailId: string; title: string; senderName: string; hasAttachment: boolean };
      action?: string;
      extra?: Record<string, any>;
    }
  ) {
    try {
      const doNamespace = env.ZONE_DO || env.MAP_DO;
      if (!doNamespace) return;
      const doId = doNamespace.idFromName('global_game_world');
      const mapStub = doNamespace.get(doId);

      if (opts.toast) {
        await mapStub.fetch('http://do/sendTo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerId: targetPlayerId,
            message: createWsMessage(MessageType.NOTICE, NoticeAction.TOAST, {
              content: opts.toast,
              level: 'info',
            }),
          }),
        }).catch(() => {});
      }

      if (opts.mail) {
        await mapStub.fetch('http://do/sendTo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerId: targetPlayerId,
            message: createWsMessage(MessageType.MAIL, MailAction.MAIL_NEW, opts.mail),
          }),
        }).catch(() => {});
      }
    } catch (e) {
      console.warn('[FriendService] WebSocket 实时私发跳过或离线:', e);
    }
  }
}

export const friendService = new FriendService();
