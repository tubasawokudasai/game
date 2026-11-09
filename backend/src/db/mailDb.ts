import { InventoryRecord } from '../models/types';
import { claimMailAttachmentsTx } from '../services/grantService';

/**
 * 邮件数据库底层操作模块 (mailDb.ts)
 * 必须采用 Cloudflare D1 的 db.batch() 批量事务执行，确保扣除物品、转移资产与生成邮件绝对原子化
 */
export const mailDb = {
  /**
   * 强事务交易：A 玩家向 B 玩家发送附带装备/货币的飞鸽传书
   * 采用 D1 batch 原子化执行：
   * 1. 扣减发信人背包中的未穿戴装备
   * 2. 扣减发信人随信附赠的银两/元宝
   * 3. 生成 mails 邮件主记录
   * 4. 生成 mail_attachments 附件记录（保存装备完整属性快照）
   */
  async sendMailWithAttachmentTx(
    db: D1Database,
    params: {
      senderId: string;
      senderName: string;
      receiverId: string;
      title: string;
      content: string;
      attachmentInventoryId?: string;
      attachedSilver?: number;
      attachedIngot?: number;
    }
  ): Promise<{ mailId: string }> {
    const {
      senderId,
      senderName,
      receiverId,
      title,
      content,
      attachmentInventoryId,
      attachedSilver = 0,
      attachedIngot = 0,
    } = params;

    // 1. 校验收件人道友是否存在
    const receiver = await db
      .prepare('SELECT id, nickname FROM players WHERE id = ?')
      .bind(receiverId)
      .first<{ id: string; nickname: string }>();

    if (!receiver) {
      throw new Error('收信道友不存在于九州花名册中');
    }

    // 2. 校验发件人资产是否充足
    const sender = await db
      .prepare('SELECT id, silver, ingot FROM players WHERE id = ?')
      .bind(senderId)
      .first<{ id: string; silver: number; ingot: number }>();

    if (!sender) {
      throw new Error('发信人身份异常');
    }

    if (sender.silver < attachedSilver || sender.ingot < attachedIngot) {
      throw new Error('随信赠送的银两或元宝不足');
    }

    // 3. 若附赠装备，查询并校验装备所有权及穿戴状态
    let itemSnapshot: string | null = null;
    let itemId: string | null = null;

    if (attachmentInventoryId) {
      const equipItem = await db
        .prepare('SELECT * FROM inventory WHERE id = ? AND player_id = ?')
        .bind(attachmentInventoryId, senderId)
        .first<InventoryRecord>();

      if (!equipItem) {
        throw new Error('所赠神兵道具不存在于行囊中');
      }

      if (equipItem.is_equipped === 1) {
        throw new Error('不可赠送当前已佩戴穿戴的神兵法宝，请先卸下');
      }

      itemId = equipItem.item_id;
      itemSnapshot = JSON.stringify({
        item_id: equipItem.item_id,
        item_name: equipItem.item_name,
        item_type: equipItem.item_type,
        quality: equipItem.quality,
        slot: equipItem.slot,
        stats: equipItem.stats,
        enhance_level: equipItem.enhance_level,
      });
    }

    // 4. 构建原子批处理操作 (D1 Batch Transactions)
    const mailId = `mail_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const attachmentId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const hasAttachment = attachmentInventoryId || attachedSilver > 0 || attachedIngot > 0 ? 1 : 0;
    const expireAt = Math.floor(Date.now() / 1000) + 30 * 24 * 3600; // 30天后过期

    const batchStatements: D1PreparedStatement[] = [];

    // 语句 1: 扣除发信人背包中的该道具
    if (attachmentInventoryId) {
      batchStatements.push(
        db.prepare('DELETE FROM inventory WHERE id = ? AND player_id = ?').bind(attachmentInventoryId, senderId)
      );
    }

    // 语句 2: 扣除发信人随信资产
    if (attachedSilver > 0 || attachedIngot > 0) {
      batchStatements.push(
        db
          .prepare('UPDATE players SET silver = silver - ?, ingot = ingot - ? WHERE id = ?')
          .bind(attachedSilver, attachedIngot, senderId)
      );
    }

    // 语句 3: 插入邮件表
    batchStatements.push(
      db
        .prepare(
          `INSERT INTO mails (id, sender_id, sender_name, receiver_id, title, content, mail_type, has_attachment, is_read, is_claimed, expire_at)
           VALUES (?, ?, ?, ?, ?, ?, 'TRADE', ?, 0, 0, ?)`
        )
        .bind(mailId, senderId, senderName, receiverId, title, content, hasAttachment, expireAt)
    );

    // 语句 4: 插入附件表
    if (hasAttachment === 1) {
      batchStatements.push(
        db
          .prepare(
            `INSERT INTO mail_attachments (id, mail_id, item_id, item_snapshot, count, silver, ingot)
             VALUES (?, ?, ?, ?, 1, ?, ?)`
          )
          .bind(attachmentId, mailId, itemId, itemSnapshot, attachedSilver, attachedIngot)
      );
    }

    // 5. 执行 D1 强原子事务
    const results = await db.batch(batchStatements);

    // 验证所有语句均执行成功
    for (const res of results) {
      if (res.error) {
        throw new Error(`邮件发送事务回滚: ${res.error}`);
      }
    }

    return { mailId };
  },

  /**
   * 强事务交易：提取邮件附件。
   * 具体领取行为（道具入背包 / 角色入队伍 / 货币入钱庄）由 grantService 按
   * mail_attachments.grant_type 分派，本模块只保留稳定的数据访问入口。
   */
  async claimAttachmentTx(db: D1Database, playerId: string, mailId: string) {
    return await claimMailAttachmentsTx(db, playerId, mailId);
  },
};
