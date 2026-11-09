const fs = require('fs');
const path = require('path');

const routeFiles = [
  // 玩家端路由
  { prefix: '/api/auth', tag: '认证模块 (Auth)', file: 'backend/src/routes/authRoutes.ts' },
  { prefix: '/api/player', tag: '角色模块 (Player)', file: 'backend/src/routes/playerRoutes.ts' },
  { prefix: '/api/map', tag: '场景大地图 (Map)', file: 'backend/src/routes/mapRoutes.ts' },
  { prefix: '/api/npc', tag: 'NPC与剧情 (NPC & Dialogue)', file: 'backend/src/routes/npcRoutes.ts' },
  { prefix: '/api/combat', tag: '战斗系统 (Combat)', file: 'backend/src/routes/combatRoutes.ts' },
  { prefix: '/api/mails', tag: '飞鸽传书 (Mails)', file: 'backend/src/routes/mailRoutes.ts' },
  { prefix: '/api/friends', tag: '同道好友 (Friends)', file: 'backend/src/routes/friendRoutes.ts' },
  { prefix: '/api/casino', tag: '御灵博戏 (Casino)', file: 'backend/src/routes/casinoRoutes.ts' },
  { prefix: '/api/ai', tag: 'AI工具链 (AI Tools)', file: 'backend/src/routes/aiToolsRoutes.ts' },
  { prefix: '/api/travel', tag: '游历与传送 (Travel)', file: 'backend/src/routes/travel.ts' },
  { prefix: '/api/pharmacy', tag: '悬壶馆与药道 (Pharmacy)', file: 'backend/src/routes/pharmacyRoutes.ts' },

  // 管理后台路由
  { prefix: '/api/admin/grants', tag: '管理后台-奖励发放 (Admin Grants)', file: 'backend/src/routes/adminGrantRoutes.ts' },
  { prefix: '/api/admin/notifications', tag: '管理后台-通知配置 (Admin Notifications)', file: 'backend/src/routes/adminNotificationRoutes.ts' },
  { prefix: '/api/admin', tag: '管理后台-系统鉴权 (Admin Auth)', file: 'backend/src/routes/admin/auth.routes.ts' },
  { prefix: '/api/admin', tag: '管理后台-场景建筑 (Admin Scenes)', file: 'backend/src/routes/admin/scenes.routes.ts' },
  { prefix: '/api/admin', tag: '管理后台-玩家管理 (Admin Players)', file: 'backend/src/routes/admin/players.routes.ts' },
  { prefix: '/api/admin', tag: '管理后台-NPC模板 (Admin NPC Templates)', file: 'backend/src/routes/admin/npcTemplates.routes.ts' },
  { prefix: '/api/admin', tag: '管理后台-NPC实例 (Admin NPC Instances)', file: 'backend/src/routes/admin/npcInstances.routes.ts' },
  { prefix: '/api/admin', tag: '管理后台-战斗怪群 (Admin Monster Groups)', file: 'backend/src/routes/admin/monsterGroups.routes.ts' },
  { prefix: '/api/admin', tag: '管理后台-地图NPC (Admin World NPCs)', file: 'backend/src/routes/admin/worldNpcs.routes.ts' },
  { prefix: '/api/admin', tag: '管理后台-丹药名品 (Admin Medicines)', file: 'backend/src/routes/admin/medicines.routes.ts' },
  { prefix: '/api/admin', tag: '管理后台-剧情剧本 (Admin Dialogues)', file: 'backend/src/routes/admin/dialogues.routes.ts' },
  { prefix: '/api/admin', tag: '管理后台-神通功法 (Admin Skills)', file: 'backend/src/routes/admin/skills.routes.ts' },
];

const paths = {
  '/': {
    get: {
      tags: ['系统探针 (System)'],
      summary: '服务器存活探测',
      responses: {
        200: {
          description: '服务器运行正常',
          content: { 'text/plain': { schema: { type: 'string' } } },
        },
      },
    },
  },
};

const tags = [
  { name: '认证模块 (Auth)', description: '游客免登录、用户注册、账号合并与账密登录' },
  { name: '角色模块 (Player)', description: '角色信息、行囊背包、同道队伍、预设与修仙档案' },
  { name: '场景大地图 (Map)', description: '大世界区域、地点场馆与建筑信息' },
  { name: 'NPC与剧情 (NPC & Dialogue)', description: 'NPC交互对话、树状/线性剧情推进、选项决策与剧情分支' },
  { name: '战斗系统 (Combat)', description: '遭遇战推演准备、战斗结算与战利品发放' },
  { name: '悬壶馆与药道 (Pharmacy)', description: '药阁名品购买、神农丹方炼制、药王回春疗伤' },
  { name: '同道好友 (Friends)', description: '好友列表、申请/接受/拒绝好友、同道搜索' },
  { name: '飞鸽传书 (Mails)', description: '玩家邮件收取、附件领取与全服邮件' },
  { name: '游历与传送 (Travel)', description: '御剑传送与场景移动' },
  { name: '御灵博戏 (Casino)', description: '博戏竞猜状态与下注结算' },
  { name: 'AI工具链 (AI Tools)', description: '大模型辅助生成工具' },
  { name: '管理后台-系统鉴权 (Admin Auth)', description: '管理员账密登录、凭据会话与全服指标大盘' },
  { name: '管理后台-场景建筑 (Admin Scenes)', description: '大地图场景与建筑设施的新增、修改与删除' },
  { name: '管理后台-玩家管理 (Admin Players)', description: '全服玩家列表、属性面板查看与快捷维护操作' },
  { name: '管理后台-NPC模板 (Admin NPC Templates)', description: 'NPC基础模板档案、数值成长配置与预览' },
  { name: '管理后台-地图NPC (Admin World NPCs)', description: '在大地图场景中添加/布置/调整/删除 NPC' },
  { name: '管理后台-NPC实例 (Admin NPC Instances)', description: 'NPC 运行时实例列表、状态与重置' },
  { name: '管理后台-战斗怪群 (Admin Monster Groups)', description: '遭遇战敌方阵容编队、出战槽位与掉落管理' },
  { name: '管理后台-丹药名品 (Admin Medicines)', description: '悬壶馆名药上架、神农丹方配置与品阶管控' },
  { name: '管理后台-剧情剧本 (Admin Dialogues)', description: '可视化剧本包、对话节点、选项跳转与奖励联动' },
  { name: '管理后台-神通功法 (Admin Skills)', description: '修仙技能、主动/被动效果与威力配置' },
  { name: '管理后台-奖励发放 (Admin Grants)', description: '系统运营物品发放、邮件附件直投' },
  { name: '管理后台-通知配置 (Admin Notifications)', description: '升级奖励通知、剧情节点触发器通知配置' },
];

for (const rf of routeFiles) {
  const content = fs.readFileSync(rf.file, 'utf8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^\s*(?:\w+)\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/);
    if (!match) continue;

    const method = match[1].toLowerCase();
    let routePath = match[2];
    let oasPath = (rf.prefix + (routePath.startsWith('/') ? routePath : '/' + routePath)).replace(/\/:([a-zA-Z0-9_]+)/g, '/{$1}');
    if (oasPath.endsWith('/') && oasPath.length > 1) oasPath = oasPath.slice(0, -1);

    // parse comments
    let summary = '';
    let description = '';
    for (let j = i - 1; j >= Math.max(0, i - 12); j--) {
      const cLine = lines[j].trim();
      if ((cLine.startsWith('*') || cLine.startsWith('//')) &&
          !cLine.startsWith('*/') && !cLine.startsWith('/**') &&
          !cLine.includes('GET ') && !cLine.includes('POST ') &&
          !cLine.includes('PUT ') && !cLine.includes('DELETE ') &&
          !cLine.includes('PATCH ')) {
        const clean = cLine.replace(/^(\*|\/\/)\s*/, '').trim();
        if (clean && !summary) {
          summary = clean;
        } else if (clean && !description) {
          description = clean;
        }
      }
    }

    if (!summary) summary = method.toUpperCase() + ' ' + oasPath;

    // extract path parameters
    const paramMatches = [...oasPath.matchAll(/\{([a-zA-Z0-9_]+)\}/g)];
    const parameters = paramMatches.map(m => ({
      name: m[1],
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: m[1] + ' 路径参数',
    }));

    // Security check
    const isPublic = oasPath === '/' || oasPath === '/api/auth/guest' || oasPath === '/api/auth/login' || oasPath === '/api/auth/register' || oasPath === '/api/admin/login';
    const isAdmin = oasPath.startsWith('/api/admin');
    const security = isPublic ? [] : (isAdmin ? [{ AdminCookieAuth: [] }, { BearerAuth: [] }] : [{ BearerAuth: [] }]);

    const operation = {
      tags: [rf.tag],
      summary,
      description: description || summary,
      responses: {
        200: {
          description: '操作成功',
          content: {
            'application/json': {
              schema: { type: 'object' },
            },
          },
        },
        400: {
          description: '请求参数有误',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        500: {
          description: '服务器内部错误',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
      },
    };

    if (parameters.length > 0) {
      operation.parameters = parameters;
    }

    if (security.length > 0) {
      operation.security = security;
    }

    if (method === 'post' || method === 'put' || method === 'patch') {
      operation.requestBody = {
        required: false,
        content: {
          'application/json': {
            schema: { type: 'object' },
          },
        },
      };
    }

    if (!paths[oasPath]) {
      paths[oasPath] = {};
    }
    paths[oasPath][method] = operation;
  }
}

const spec = {
  openapi: '3.0.3',
  info: {
    title: '万象录 完整 API 文档',
    version: '1.0.0',
    description: '《万象录》全模块接口文档（包含角色、战斗、NPC剧情、药道、大地图及全部管理后台接口）。',
  },
  servers: [
    {
      url: '/',
      description: '当前运行环境',
    },
  ],
  tags,
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: '玩家认证 JWT 令牌（请求头 Authorization: Bearer <token>）',
      },
      AdminCookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'admin_session',
        description: '管理后台管理员会话 Cookie',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          error: { type: 'string', description: '错误详细信息' },
        },
      },
    },
  },
  paths,
};

const tsContent = `export const openApiSpec = ${JSON.stringify(spec, null, 2)} as const;\n`;
fs.writeFileSync('backend/src/docs/openapiSpec.ts', tsContent, 'utf8');
console.log('Successfully wrote', Object.keys(paths).length, 'paths into backend/src/docs/openapiSpec.ts');
