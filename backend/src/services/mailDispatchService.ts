import { Env } from '../models/env';
import { MessageType, MailAction, createWsMessage } from '../models/ws';

export interface AdminSendMailParams {
  receiverId?: string;
  title?: string;
  content?: string;
  senderName?: string;
  attachedSilver?: number;
  attachedIngot?: number;
  mapId?: string;
}

export const mailDispatchService = {
  /**
   * 通过 DO 向玩家实时推送 MAIL_NEW 通知
   */
  async notifyPlayerNewMail(
    env: Env,
    targetPlayerId: string,
    mailInfo: { mailId: string; title: string; senderName: string; hasAttachment: boolean }
  ): Promise<boolean> {
    try {
      const doNamespace = env.ZONE_DO || env.MAP_DO;
      if (!doNamespace) return false;
      const doId = doNamespace.idFromName('global_game_world');
      const mapStub = doNamespace.get(doId);
      const pushRes = await mapStub.fetch('http://do/sendTo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: targetPlayerId,
          message: createWsMessage(MessageType.MAIL, MailAction.MAIL_NEW, mailInfo),
        }),
      });
      if (pushRes.ok) {
        const pushData = (await pushRes.json()) as { delivered: boolean };
        return Boolean(pushData.delivered);
      }
    } catch (wsErr) {
      console.warn('[Mail API] WebSocket 实时私发跳过或离线:', wsErr);
    }
    return false;
  },

  /**
   * 管理员/GM 发送系统信件
   */
  async adminSendSystemMail(env: Env, params: AdminSendMailParams) {
    let receiverId = (params.receiverId || '').trim();
    const title = params.title || '【天道赏赐】仙途福泽';
    const content =
      params.content ||
      '见字如晤，今观道友道心坚定、灵光充沛，特赐下宗门秘宝与灵石，望道友砥砺前行，早证混元！';
    const senderName = params.senderName || '天道宗师 (GM)';
    const silver = Number(params.attachedSilver) || 0;
    const ingot = Number(params.attachedIngot) || 0;

    const doNamespace = env.ZONE_DO || env.MAP_DO;
    const doId = doNamespace.idFromName('global_game_world');
    const mapStub = doNamespace.get(doId);

    // 1. 获取当前场景在线修仙者连接信息
    let onlinePlayerIds: string[] = [];
    try {
      const statusRes = await mapStub.fetch('http://do/status');
      if (statusRes.ok) {
        const statusData = (await statusRes.json()) as { onlinePlayerIds?: string[] };
        onlinePlayerIds = statusData.onlinePlayerIds || [];
      }
    } catch (e) {
      console.warn('[Mail API] 获取在线玩家列表跳过:', e);
    }

    // 2. 智能寻址收件人并校验数据库外键合法性
    const isBroadcastAll = receiverId === '*' || receiverId === 'all';
    let targetPlayerIds: string[] = [];

    if (isBroadcastAll) {
      const dbPlayers = await env.DB.prepare(
        "SELECT id FROM players WHERE status != 'MERGED' ORDER BY created_at ASC"
      ).all<{ id: string }>();

      targetPlayerIds = (dbPlayers.results || []).map((p: any) => p.id);

      if (targetPlayerIds.length === 0) {
        throw new Error('全服名册中暂无有效在册修仙者，无法群发天道信件');
      }
    } else if (!receiverId || receiverId === 'auto' || receiverId === 'online') {
      let validOnlinePlayerIds: string[] = [];
      if (onlinePlayerIds.length > 0) {
        const placeholders = onlinePlayerIds.map(() => '?').join(',');
        const matched = await env.DB.prepare(
          `SELECT id FROM players WHERE id IN (${placeholders})`
        )
          .bind(...onlinePlayerIds)
          .all<{ id: string }>();
        validOnlinePlayerIds = (matched.results || []).map((p: any) => p.id);
      }

      if (receiverId === 'online') {
        targetPlayerIds = validOnlinePlayerIds;
        if (targetPlayerIds.length === 0) {
          throw new Error('当前场景无在册修仙者在线');
        }
      } else {
        if (validOnlinePlayerIds.length > 0) {
          targetPlayerIds = [validOnlinePlayerIds[0]];
        } else {
          const defaultPlayer = await env.DB.prepare(
            "SELECT id FROM players WHERE status != 'MERGED' ORDER BY created_at ASC LIMIT 1"
          ).first<{ id: string }>();
          if (!defaultPlayer?.id) {
            throw new Error('九州名册中暂无可用修仙者');
          }
          targetPlayerIds = [defaultPlayer.id];
        }
      }
    } else {
      const targetPlayer = await env.DB.prepare(
        'SELECT id FROM players WHERE id = ?'
      )
        .bind(receiverId)
        .first<{ id: string }>();

      if (!targetPlayer) {
        const err = new Error(`收信道友 [${receiverId}] 不存在于九州名册中`);
        (err as any).status = 404;
        throw err;
      }
      targetPlayerIds = [targetPlayer.id];
    }

    targetPlayerIds = Array.from(new Set(targetPlayerIds));
    if (targetPlayerIds.length === 0) {
      throw new Error('未找到有效的收信修仙者');
    }

    const hasAttachment = silver > 0 || ingot > 0 ? 1 : 0;
    const expireAt = Math.floor(Date.now() / 1000) + 30 * 86400;
    const generatedMailIds: string[] = [];
    const statements: D1PreparedStatement[] = [];

    for (const tid of targetPlayerIds) {
      const mailId = `mail_admin_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      generatedMailIds.push(mailId);
      statements.push(
        env.DB.prepare(
          `INSERT INTO mails (id, sender_id, sender_name, receiver_id, title, content, mail_type, has_attachment, is_read, is_claimed, expire_at)
           VALUES (?, NULL, ?, ?, ?, ?, 'SYSTEM', ?, 0, 0, ?)`
        ).bind(mailId, senderName, tid, title, content, hasAttachment, expireAt)
      );

      if (hasAttachment) {
        const attachmentId = `att_admin_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        statements.push(
          env.DB.prepare(
            `INSERT INTO mail_attachments (id, mail_id, count, silver, ingot, grant_type, grant_payload)
             VALUES (?, ?, 1, ?, ?, 'CURRENCY', ?)`
          ).bind(
            attachmentId,
            mailId,
            silver,
            ingot,
            JSON.stringify({ name: '货币补给', silver, ingot, copper: 0 })
          )
        );
      }
    }

    const BATCH_SIZE = 50;
    for (let i = 0; i < statements.length; i += BATCH_SIZE) {
      await env.DB.batch(statements.slice(i, i + BATCH_SIZE));
    }

    // 4. 实时推送
    const pushTarget = isBroadcastAll ? '*' : (targetPlayerIds[0] || receiverId);
    const delivered = await this.notifyPlayerNewMail(env, pushTarget, {
      mailId: generatedMailIds[0] || 'mail_admin',
      title,
      senderName,
      hasAttachment: Boolean(hasAttachment),
    });

    return {
      success: true,
      delivered,
      message: delivered
        ? '【管理员指令】天道仙函已成功下发，且修仙者长连接已即时接收！'
        : '【管理员指令】信件已存入数据库，但目标修仙者当前长连接未在线。',
      target: isBroadcastAll ? `全服在册道友 (共 ${targetPlayerIds.length} 位)` : (targetPlayerIds[0] || receiverId),
      recipientCount: targetPlayerIds.length,
      currentOnlinePlayerIds: onlinePlayerIds,
      title,
      senderName,
      attachments: { silver, ingot },
      tip: delivered
        ? '网页端信封已进入金芒闪烁状态，跑马灯已同步滑出。'
        : `当前在线长连接为 [${onlinePlayerIds.join(', ') || '无在线连接'}]。若正在浏览器游玩，可传入 receiverId: "*" 或你的实际ID。`,
    };
  },
};
