import { Env } from '../models/env';
import { sendSystemGrantMails } from './grantService';
import { createWsMessage, MailAction, MessageType } from '../models/ws';

export interface SystemGrantPayload {
  receiverMode: 'single' | 'online' | 'all';
  receiverId?: string;
  senderName: string;
  title: string;
  content: string;
  expireDays: number;
  grants: any[];
}

export class AdminGrantError extends Error {
  status: number;
  constructor(message: string, status: number = 400) {
    super(message);
    this.status = status;
  }
}

export const adminGrantService = {
  /**
   * 系统发放模版目录
   */
  async getCatalog(db: D1Database) {
    const [itemsRes, companionsRes] = await Promise.all([
      db.prepare(
        `SELECT id, name, type, quality, description
         FROM item_templates
         ORDER BY type ASC, quality ASC, id ASC`
      ).all<{
        id: string;
        name: string;
        type: string;
        quality: string;
        description?: string;
      }>(),
      db.prepare(
        `SELECT id AS member_key, id AS template_id, key, name, title, badge, avatar,
                role, sort_order,
                idle_avatar, attack_avatar,
                base_hp, base_mp, base_attack, base_defense, base_speed
         FROM npc_templates
         ORDER BY sort_order ASC, name ASC`
      ).all<Record<string, unknown>>(),
    ]);

    return {
      success: true,
      items: itemsRes.results || [],
      companions: companionsRes.results || [],
      grantTypes: [
        {
          type: 'ITEM',
          label: '道具',
          description: '从道具库选择名称，设置发放数量；装备类道具同样走此通道。',
        },
        {
          type: 'COMPANION',
          label: '角色',
          description: '从 NPC 模板库选择任意人物，设置等级与境界；领取后进入名册并保持休息。',
        },
        {
          type: 'CURRENCY',
          label: '货币',
          description: '发放纹银 / 元宝 / 铜钱，领取时直接入钱庄。',
        },
      ],
    };
  },

  /**
   * 通过系统邮件发放道具 / 角色 / 货币
   */
  async sendSystemGrant(env: Env, payload: SystemGrantPayload, adminUsername: string) {
    let targetPlayerIds: string[] = [];
    let currentOnlinePlayerIds: string[] = [];

    if (payload.receiverMode === 'single') {
      const receiverId = String(payload.receiverId || '').trim();
      if (!receiverId) {
        throw new AdminGrantError('请指定收件玩家', 400);
      }

      const target = await env.DB.prepare('SELECT id FROM players WHERE id = ?')
        .bind(receiverId)
        .first<{ id: string }>();

      if (!target) {
        throw new AdminGrantError(`收信道友 [${receiverId}] 不存在于九州名册中`, 404);
      }

      targetPlayerIds = [target.id];
    } else {
      if (payload.receiverMode === 'online') {
        try {
          const doNamespace = env.ZONE_DO || env.MAP_DO;
          const doId = doNamespace.idFromName('global_game_world');
          const stub = doNamespace.get(doId);
          const statusRes = await stub.fetch('http://do/status');
          if (statusRes.ok) {
            const statusData = (await statusRes.json()) as { onlinePlayerIds?: string[] };
            currentOnlinePlayerIds = statusData.onlinePlayerIds || [];
          }
        } catch (err) {
          console.warn('[AdminGrant] 获取在线玩家列表失败:', err);
        }

        if (currentOnlinePlayerIds.length > 0) {
          const placeholders = currentOnlinePlayerIds.map(() => '?').join(',');
          const matched = await env.DB.prepare(
            `SELECT id FROM players WHERE id IN (${placeholders})`
          )
            .bind(...currentOnlinePlayerIds)
            .all<{ id: string }>();
          targetPlayerIds = (matched.results || []).map((p) => p.id);
        }

        if (targetPlayerIds.length === 0) {
          throw new AdminGrantError('当前没有在册修仙者保持在线长连接', 400);
        }
      } else {
        const all = await env.DB.prepare(
          "SELECT id FROM players WHERE status != 'MERGED' ORDER BY created_at ASC"
        ).all<{ id: string }>();
        targetPlayerIds = (all.results || []).map((p) => p.id);

        if (targetPlayerIds.length === 0) {
          throw new AdminGrantError('全服名册中暂无有效在册修仙者', 404);
        }
      }
    }

    targetPlayerIds = Array.from(new Set(targetPlayerIds));

    // 2. 生成系统邮件与类型化附件
    const result = await sendSystemGrantMails(env.DB, {
      receiverIds: targetPlayerIds,
      senderName: payload.senderName,
      title: payload.title,
      content: payload.content,
      expireDays: payload.expireDays,
      createdBy: adminUsername || 'admin',
      grants: payload.grants,
    });

    // 3. WebSocket 即时提醒
    let delivered = false;
    try {
      const doNamespace = env.ZONE_DO || env.MAP_DO;
      const doId = doNamespace.idFromName('global_game_world');
      const stub = doNamespace.get(doId);

      const pushTarget = payload.receiverMode === 'single' ? targetPlayerIds[0] : '*';
      const pushRes = await stub.fetch('http://do/sendTo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: pushTarget,
          message: createWsMessage(MessageType.MAIL, MailAction.MAIL_NEW, {
            mailId: result.mailIds[0] || 'mail_grant',
            title: payload.title,
            senderName: payload.senderName,
            hasAttachment: true,
            grantTypes: result.grants.map((g) => g.type),
          }),
        }),
      });

      if (pushRes.ok) {
        const pushData = (await pushRes.json()) as { delivered?: boolean };
        delivered = Boolean(pushData.delivered);
      }
    } catch (err) {
      console.warn('[AdminGrant] WebSocket 邮件提醒推送异常:', err);
    }

    return {
      success: true,
      delivered,
      message: `系统发放已写入 ${result.recipientCount} 位道友的邮箱，需玩家点击领取后生效。`,
      recipientCount: result.recipientCount,
      mailIds: result.mailIds,
      grants: result.grants,
      receiverMode: payload.receiverMode,
      currentOnlinePlayerIds,
      tip: '邮件附件在领取前不会生效；角色领取后进入同道名册并保持休息，需在队伍整备中手动上阵。',
    };
  },
};
