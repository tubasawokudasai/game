import { createAdminRouter } from './admin/types';
import { adminAuthMiddleware } from '../middleware/adminAuth';

import { authRoutes } from './admin/auth.routes';
import { scenesRoutes } from './admin/scenes.routes';
import { playersRoutes } from './admin/players.routes';
import { npcTemplatesRoutes } from './admin/npcTemplates.routes';
import { npcInstancesRoutes } from './admin/npcInstances.routes';
import { monsterGroupsRoutes } from './admin/monsterGroups.routes';
import { worldNpcsRoutes } from './admin/worldNpcs.routes';
import { medicinesRoutes } from './admin/medicines.routes';
import { dialoguesRoutes } from './admin/dialogues.routes';
import { skillsRoutes } from './admin/skills.routes';

export const adminRoutes = createAdminRouter();

// 1. 认证与概览（/login 免鉴权，/me 和 /stats 内部挂载了鉴权中间件）
adminRoutes.route('/', authRoutes);

// 全局挂载管理员鉴权中间件（保护后续所有模块）
adminRoutes.use('*', adminAuthMiddleware);

// 2. 挂载各个业务子路由（采用 '/' 保持完整路由路径一致，方便全局检索）
adminRoutes.route('/', scenesRoutes);
adminRoutes.route('/', playersRoutes);
adminRoutes.route('/', npcTemplatesRoutes);
adminRoutes.route('/', npcInstancesRoutes);
adminRoutes.route('/', monsterGroupsRoutes);
adminRoutes.route('/', worldNpcsRoutes);
adminRoutes.route('/', medicinesRoutes);
adminRoutes.route('/', dialoguesRoutes);
adminRoutes.route('/', skillsRoutes);
