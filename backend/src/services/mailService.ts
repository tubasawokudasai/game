import { mailDb } from '../db/mailDb';
import { MailAttachmentRecord, MailRecord } from '../models/types';
import { describeAttachment } from './grantService';

/**
 * 邮件业务服务层 (mailService.ts)
 * 彻底解耦业务逻辑与底层 SQL，提供纯粹的邮件发送、附件提取、信箱检索业务抽象
 */
export const mailService = {
  /**
   * 发送带附件或物品的邮件
   */
  async sendTradeMail(
    db: D1Database,
    senderId: string,
    senderName: string,
    params: {
      receiverId: string;
      title: string;
      content: string;
      attachmentInventoryId?: string;
      attachedSilver?: number;
      attachedIngot?: number;
    }
  ) {
    if (!params.title || !params.title.trim()) {
      throw new Error('飞鸽传书必须具备信件主题');
    }

    if (!params.content || !params.content.trim()) {
      throw new Error('信笺正文不可为空');
    }

    return await mailDb.sendMailWithAttachmentTx(db, {
      senderId,
      senderName,
      receiverId: params.receiverId,
      title: params.title.trim(),
      content: params.content.trim(),
      attachmentInventoryId: params.attachmentInventoryId,
      attachedSilver: params.attachedSilver || 0,
      attachedIngot: params.attachedIngot || 0,
    });
  },

  /**
   * 提取指定邮件附件
   */
  async claimMailAttachment(db: D1Database, playerId: string, mailId: string) {
    return await mailDb.claimAttachmentTx(db, playerId, mailId);
  },

  /**
   * 获取收件箱邮件列表及未读数。
   * 后端统一输出 camelCase DTO，并附带 grant_type 解析后的附件摘要，
   * 让前端邮箱无需再猜测"这封系统邮件里到底是什么"。
   */
  async getPlayerInbox(db: D1Database, playerId: string) {
    const mails = await db
      .prepare('SELECT * FROM mails WHERE receiver_id = ? ORDER BY created_at DESC LIMIT 50')
      .bind(playerId)
      .all<MailRecord>();

    const unreadCountResult = await db
      .prepare('SELECT COUNT(*) as count FROM mails WHERE receiver_id = ? AND is_read = 0')
      .bind(playerId)
      .first<{ count: number }>();

    const mailRows = mails.results || [];
    const attachmentsByMail = new Map<string, MailAttachmentRecord[]>();

    if (mailRows.length > 0) {
      const placeholders = mailRows.map(() => '?').join(',');
      const { results: attachmentRows } = await db
        .prepare(`SELECT * FROM mail_attachments WHERE mail_id IN (${placeholders})`)
        .bind(...mailRows.map((m) => m.id))
        .all<MailAttachmentRecord>();

      for (const row of attachmentRows || []) {
        const list = attachmentsByMail.get(row.mail_id) || [];
        list.push(row);
        attachmentsByMail.set(row.mail_id, list);
      }
    }

    return {
      mails: mailRows.map((mail) => {
        const attachments = (attachmentsByMail.get(mail.id) || []).map(describeAttachment);
        return {
          id: mail.id,
          senderId: mail.sender_id || null,
          senderName: mail.sender_name,
          receiverId: mail.receiver_id,
          title: mail.title,
          content: mail.content,
          mailType: mail.mail_type,
          hasAttachment: mail.has_attachment === 1 || attachments.length > 0,
          isRead: mail.is_read === 1,
          isClaimed: mail.is_claimed === 1,
          expireAt: mail.expire_at,
          createdAt: mail.created_at,
          attachments,
        };
      }),
      unreadCount: unreadCountResult?.count || 0,
    };
  },
};
