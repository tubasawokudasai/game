import { Hono } from 'hono';
import { Env } from '../models/env';
import { mailService } from '../services/mailService';
import { mailDispatchService } from '../services/mailDispatchService';
import { SendMailActionSchema } from '../models/schemas';
import { extractAuthPayload } from './authRoutes';
import { requireDb } from '../middleware/dbMiddleware';

export const mailRoutes = new Hono<{ Bindings: Env }>();

mailRoutes.use('*', requireDb);

/**
 * 获取玩家收件箱
 * GET /api/mails
 */
mailRoutes.get('/', async (c) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  if (!playerId) {
    return c.json({ error: '请先登录后再查阅飞鸽传书' }, 401);
  }

  try {
    const player = await c.env.DB.prepare('SELECT id FROM players WHERE id = ?')
      .bind(playerId)
      .first<{ id: string }>();

    if (!player) {
      return c.json({ error: '修仙者不存在' }, 404);
    }

    const inbox = await mailService.getPlayerInbox(c.env.DB, playerId);
    return c.json(inbox);
  } catch (err: unknown) {
    console.error('[Mail API] D1 查询 mails 异常:', err);
    return c.json(
      { error: '数据库查询异常: ' + (err instanceof Error ? err.message : String(err)) },
      500
    );
  }
});

/**
 * 发送带附件或货币的交易邮件 (强事务保障)
 * POST /api/mails/send
 */
mailRoutes.post('/send', async (c) => {
  const authPayload = await extractAuthPayload(c);
  const senderId = authPayload?.sub;
  if (!senderId) {
    return c.json({ error: '请先登录后再寄出飞鸽传书' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = SendMailActionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '信函参数不合法', details: parsed.error.issues }, 400);
  }

  try {
    const sender = await c.env.DB.prepare('SELECT nickname FROM players WHERE id = ?')
      .bind(senderId)
      .first<{ nickname: string }>();

    if (!sender) {
      return c.json({ error: '发信修仙者身份无效，请重新登录' }, 401);
    }

    const result = await mailService.sendTradeMail(c.env.DB, senderId, sender.nickname, {
      receiverId: parsed.data.receiverId,
      title: parsed.data.title,
      content: parsed.data.content,
      attachmentInventoryId: parsed.data.attachmentInventoryId,
      attachedSilver: parsed.data.attachedSilver,
      attachedIngot: parsed.data.attachedIngot,
    });

    await mailDispatchService.notifyPlayerNewMail(c.env, parsed.data.receiverId, {
      mailId: result.mailId,
      title: parsed.data.title,
      senderName: sender.nickname,
      hasAttachment: Boolean(
        parsed.data.attachmentInventoryId ||
          parsed.data.attachedSilver ||
          parsed.data.attachedIngot
      ),
    });

    return c.json({
      success: true,
      message: '飞鸽传书已成功破空寄出！',
      mailId: result.mailId,
    });
  } catch (err: unknown) {
    return c.json({ success: false, message: err instanceof Error ? err.message : '寄信异常' }, 400);
  }
});

/**
 * 提取邮件附件
 * POST /api/mails/claim/:mailId
 */
mailRoutes.post('/claim/:mailId', async (c) => {
  const authPayload = await extractAuthPayload(c);
  const playerId = authPayload?.sub;
  const mailId = c.req.param('mailId');
  if (!playerId) {
    return c.json({ error: '请先登录后再领取信件附件' }, 401);
  }

  try {
    const result = await mailService.claimMailAttachment(c.env.DB, playerId, mailId);
    return c.json({
      success: true,
      message: result.message || '附件已尽数收纳于行囊与钱庄中！',
      result,
    });
  } catch (err: unknown) {
    return c.json({ success: false, message: err instanceof Error ? err.message : '提取附件异常' }, 400);
  }
});

/**
 * 管理员/GM 发送系统信件接口
 * POST /api/mails/admin-send
 */
mailRoutes.post('/admin-send', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  try {
    const res = await mailDispatchService.adminSendSystemMail(c.env, body);
    return c.json(res);
  } catch (err: any) {
    const status = err.status || 400;
    return c.json({ success: false, message: err.message || '发送天道信件异常' }, status);
  }
});
