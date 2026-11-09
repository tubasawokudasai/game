import { z } from 'zod';

/**
 * 结构化交互协议定义 (基于 Zod)
 * 既用于运行时入参强校验，也用于自动导出大语言模型 (LLM) Function Calling 的 Tools 元数据
 */

// 1. 地图移动动作 Schema
export const MoveActionSchema = z.object({
  targetMap: z.string().describe('目标地图场景标识符，例如: square(长乐广场), manor(城主府), arena(演武场), post(神行驿)'),
  coordX: z.number().int().min(0).max(512).describe('移动目标 X 轴坐标网格点'),
  coordY: z.number().int().min(0).max(512).describe('移动目标 Y 轴坐标网格点'),
  useTeleportRune: z.boolean().default(false).describe('是否消耗神行符瞬移'),
});

// 2. 传音对话 Schema (玩家/AI说话)
export const TalkActionSchema = z.object({
  channel: z.enum(['world', 'local', 'sect', 'trade']).default('local').describe('传音频道类型: local(区域场景), world(全服世界), sect(宗门), trade(商会)'),
  content: z.string().min(1).max(200).describe('传音正文内容，禁止包含恶意代码，长度限制200字符以内'),
  targetPlayerId: z.string().optional().describe('私信对象的唯一ID，仅私聊频道生效'),
});

// 3. 飞鸽传书交易与发送 Schema
export const SendMailActionSchema = z.object({
  receiverId: z.string().min(1).describe('收信人玩家唯一标识符 (6位数字UUID或系统标识)'),
  title: z.string().min(1).max(64).describe('邮件标题'),
  content: z.string().min(1).max(500).describe('邮件正文信笺内容'),
  attachmentInventoryId: z.string().optional().describe('附加赠送的行囊装备实例唯一ID (不可佩戴中)'),
  attachedSilver: z.number().int().min(0).default(0).describe('随信附赠的纹银数额'),
  attachedIngot: z.number().int().min(0).default(0).describe('随信附赠的元宝数额'),
});

// 4. 赌场骰宝下注 Schema
export const CasinoBetActionSchema = z.object({
  betType: z.enum(['BIG', 'SMALL', 'TRIPLE', 'POINT']).describe('下注形态: BIG(大11-17点), SMALL(小4-10点), TRIPLE(全色豹子), POINT(精确点数)'),
  betValue: z.string().optional().describe('下注附加数值，若 betType 为 POINT 则填点数字符串(如: "14")'),
  betAmount: z.number().int().positive().min(10).max(100000).describe('投注元宝金额，最低10元宝，单注上限10万元宝'),
});

// 5. 系统发放 Schema (后台 GM 通过邮件向玩家发放道具 / 角色 / 货币)
export const SystemGrantItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ITEM'),
    itemId: z.string().min(1).describe('道具模版 ID (item_templates.id)'),
    count: z.number().int().min(1).max(99999).default(1).describe('发放数量'),
  }),
  z.object({
    type: z.literal('COMPANION'),
    memberKey: z.string().min(1).describe('NPC 模板 ID 或 key (npc_templates.id / npc_templates.key)'),
    level: z.number().int().min(1).max(9999).default(1).describe('发放时的角色等级'),
    realm: z.string().max(64).optional().describe('覆盖模版境界，例如: 金丹中期'),
  }),
  z.object({
    type: z.literal('CURRENCY'),
    silver: z.number().int().min(0).default(0).describe('纹银数量'),
    ingot: z.number().int().min(0).default(0).describe('元宝数量'),
    copper: z.number().int().min(0).default(0).describe('铜钱数量'),
  }),
]);

export const SystemGrantMailSchema = z.object({
  receiverMode: z.enum(['single', 'all', 'online']).default('single').describe('收件人模式'),
  receiverId: z.string().optional().describe('receiverMode=single 时的收件玩家 ID'),
  senderName: z.string().min(1).max(64).default('天道宗师 (GM)').describe('发件人展示名'),
  title: z.string().min(1).max(64).describe('邮件标题'),
  content: z.string().min(1).max(1000).describe('邮件正文'),
  expireDays: z.number().int().min(1).max(365).default(30).describe('邮件有效天数'),
  grants: z.array(SystemGrantItemSchema).min(1).max(20).describe('发放内容列表'),
});

// 6. 好友结交动作 Schema
export const SendFriendRequestSchema = z.object({
  targetPlayerId: z.string().min(1).describe('结交目标的玩家ID'),
  message: z.string().max(200).optional().describe('结交留言附语'),
});

export const HandleFriendRequestSchema = z.object({
  requestId: z.string().optional().describe('结交申请记录ID'),
  senderId: z.string().optional().describe('申请人ID'),
  mailId: z.string().optional().describe('附带的邮件ID'),
});


// 6. 导出供 LLM Function Calling 的工具元数据描述清单
export const LLM_GAME_TOOLS_METADATA = [
  {
    type: 'function',
    function: {
      name: 'game_move_player',
      description: '使当前修仙角色在九州地理画卷或当前城内各个坊市之间移动或神行传送。',
      parameters: {
        type: 'object',
        properties: {
          targetMap: { type: 'string', description: '场景ID: square, manor, arena, post' },
          coordX: { type: 'integer', description: 'X坐标' },
          coordY: { type: 'integer', description: 'Y坐标' },
          useTeleportRune: { type: 'boolean', description: '是否使用神行符瞬间传送' },
        },
        required: ['targetMap', 'coordX', 'coordY'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'game_talk_chat',
      description: '在当前场景发送区域传音，或在世界频道向全服修仙者广播道言。',
      parameters: {
        type: 'object',
        properties: {
          channel: { type: 'string', enum: ['world', 'local', 'sect', 'trade'] },
          content: { type: 'string', description: '发言正文' },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'game_send_mail_trade',
      description: '向另一位道友发送飞鸽传书，支持附赠随身装备或银两进行远程赠送交易。',
      parameters: {
        type: 'object',
        properties: {
          receiverId: { type: 'string', description: '收件人ID' },
          title: { type: 'string', description: '信件主题' },
          content: { type: 'string', description: '信笺内容' },
          attachmentInventoryId: { type: 'string', description: '附赠装备ID' },
          attachedSilver: { type: 'integer', description: '附赠纹银' },
        },
        required: ['receiverId', 'title', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'game_interact_npc',
      description: '与当前场景内的修仙NPC（术士、游侠、总督使者）进行神识交谈、接取任务或结算悬赏。',
      parameters: {
        type: 'object',
        properties: {
          npcKey: { type: 'string', description: 'NPC键名: liuqing, mofang, paohuan, chenghao' },
          optionId: { type: 'string', description: '对话分支ID' },
        },
        required: ['npcKey'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'game_casino_bet',
      description: '在长乐广场玲珑坊参与骰宝博弈，预测开奖结果下注元宝。',
      parameters: {
        type: 'object',
        properties: {
          betType: { type: 'string', enum: ['BIG', 'SMALL', 'TRIPLE', 'POINT'] },
          betAmount: { type: 'integer', description: '投注数额' },
        },
        required: ['betType', 'betAmount'],
      },
    },
  },
];
