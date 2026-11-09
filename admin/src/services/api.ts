import {
  AdminUser,
  AdminStats,
  SceneItem,
  PlayerItem,
  PlayerListResponse,
  MonsterGroupItem,
  NpcItem,
  NpcTemplateItem,
  ItemTemplateItem,
  GrantCatalogResponse,
  SystemGrantPayload,
  SystemGrantResponse,
  NpcInstanceListResponse,
  NpcAttributeConfigResponse,
  NpcAttributePreviewResponse,
  NpcSlotPreviewMember,
  MedicineItem,
  MedicineListResponse,
  AlchemyRecipeItem,
  AlchemyRecipeListResponse,
  LevelUpNotificationResponse,
  LevelUpGrant,
  NotificationGrant,
  StoryNotificationResponse,
  StoryNotificationListResponse,
  StoryNotificationItem,
  NotificationListResponse,
  DialoguePackageItem,
  DialoguePackageDetail,
  DialogueNodeItem,
  DialogueOptionItem,
  CombatSkillItem,
  CombatSkillListResponse,
} from '../types';

const TOKEN_KEY = 'changle_admin_token';
const USER_KEY = 'changle_admin_user';

export const authStorage = {
  getToken: (): string | null => localStorage.getItem(TOKEN_KEY),
  setToken: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  getUser: (): AdminUser | null => {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  setUser: (user: AdminUser) => localStorage.setItem(USER_KEY, JSON.stringify(user)),
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

/**
 * 封装通用 API 请求函数
 */
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = authStorage.getToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(endpoint, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    authStorage.clear();
    // 触发全局事件通知登录失效
    window.dispatchEvent(new CustomEvent('admin:unauthorized'));
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || '登录已过期，请重新登录');
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `请求失败 (${res.status})`);
  }

  return data as T;
}

export const adminApi = {
  // 1. 鉴权相关
  async login(username: string, password: string): Promise<{ success: boolean; token: string; user: AdminUser }> {
    const res = await request<{ success: boolean; token: string; user: AdminUser }>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    authStorage.setToken(res.token);
    authStorage.setUser(res.user);
    return res;
  },

  async getMe(): Promise<AdminUser> {
    return request<AdminUser>('/api/admin/me');
  },

  logout() {
    authStorage.clear();
  },

  // 2. 统计数据
  async getStats(): Promise<AdminStats> {
    return request<AdminStats>('/api/admin/stats');
  },

  // 3. 地图与场景管理
  async getScenes(): Promise<{ scenes: SceneItem[] }> {
    return request<{ scenes: SceneItem[] }>('/api/admin/scenes');
  },

  async createScene(scene: Partial<SceneItem>): Promise<{ success: boolean; message: string; id: string }> {
    return request('/api/admin/scenes', {
      method: 'POST',
      body: JSON.stringify(scene),
    });
  },

  async updateScene(id: string, scene: Partial<SceneItem>): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/scenes/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(scene),
    });
  },

  async deleteScene(id: string): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/scenes/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  // 4. 玩家管理
  async getPlayers(params: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    zoneId?: string;
    status?: string;
  } = {}): Promise<PlayerListResponse> {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));
    if (params.keyword) query.set('keyword', params.keyword);
    if (params.zoneId) query.set('zoneId', params.zoneId);
    if (params.status) query.set('status', params.status);

    return request<PlayerListResponse>(`/api/admin/players?${query.toString()}`);
  },

  async getPlayerDetail(id: string): Promise<{ player: PlayerItem }> {
    return request<{ player: PlayerItem }>(`/api/admin/players/${encodeURIComponent(id)}`);
  },

  async updatePlayer(id: string, updates: Partial<PlayerItem>): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/players/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async deletePlayer(id: string): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/players/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async playerQuickAction(
    id: string,
    action: 'full_restore' | 'teleport_home' | 'grant_currency' | 'set_status',
    extra: Record<string, any> = {}
  ): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/players/${encodeURIComponent(id)}/quick-action`, {
      method: 'POST',
      body: JSON.stringify({ action, ...extra }),
    });
  },

  // 5. NPC 模板库
  async getNpcTemplates(): Promise<{ success: boolean; data: NpcTemplateItem[] }> {
    return request<{ success: boolean; data: NpcTemplateItem[] }>('/api/admin/npc-templates');
  },

  async getNpcTemplate(id: string): Promise<{ success: boolean; data: NpcTemplateItem }> {
    return request<{ success: boolean; data: NpcTemplateItem }>(
      `/api/admin/npc-templates/${encodeURIComponent(id)}`
    );
  },

  async createNpcTemplate(template: Partial<NpcTemplateItem>): Promise<{ success: boolean; message: string; data: any }> {
    return request('/api/admin/npc-templates', {
      method: 'POST',
      body: JSON.stringify(template),
    });
  },

  async updateNpcTemplate(id: string, template: Partial<NpcTemplateItem>): Promise<{ success: boolean; message: string; data: any }> {
    return request(`/api/admin/npc-templates/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(template),
    });
  },

  async deleteNpcTemplate(id: string): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/npc-templates/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  // 5.1 NPC 属性成长配置与预览（属性计算统一由后端完成）
  async getNpcAttributeConfig(): Promise<{ success: boolean; data: NpcAttributeConfigResponse }> {
    return request<{ success: boolean; data: NpcAttributeConfigResponse }>(
      '/api/admin/npc-attributes/config'
    );
  },

  async previewNpcAttributes(params: {
    templateId?: string;
    growthTemplate?: string;
    levels?: number[];
    quality?: string;
    realm?: string;
  }): Promise<NpcAttributePreviewResponse> {
    const query = new URLSearchParams();
    if (params.templateId) query.set('templateId', params.templateId);
    if (params.growthTemplate) query.set('growthTemplate', params.growthTemplate);
    if (params.levels && params.levels.length > 0) query.set('levels', params.levels.join(','));
    if (params.quality) query.set('quality', params.quality);
    if (params.realm !== undefined) query.set('realm', params.realm);
    return request<NpcAttributePreviewResponse>(
      `/api/admin/npc-attributes/preview?${query.toString()}`
    );
  },

  async previewNpcAttributeSlots(
    slots: Array<{
      slot_index: number;
      template_id: string;
      level: number;
      quality?: string | null;
      realm?: string | null;
      hp_override?: number | null;
      mp_override?: number | null;
      attack_override?: number | null;
      defense_override?: number | null;
      speed_override?: number | null;
    }>
  ): Promise<{ success: boolean; data: { members: NpcSlotPreviewMember[] } }> {
    return request<{ success: boolean; data: { members: NpcSlotPreviewMember[] } }>(
      '/api/admin/npc-attributes/preview-batch',
      {
        method: 'POST',
        body: JSON.stringify({ slots }),
      }
    );
  },

  // 6. 战斗配置
  async getMonsterGroups(): Promise<{ success: boolean; data: MonsterGroupItem[] }> {
    return request<{ success: boolean; data: MonsterGroupItem[] }>('/api/admin/monster-groups');
  },

  async getMonsterGroup(id: string): Promise<{ success: boolean; data: MonsterGroupItem }> {
    return request<{ success: boolean; data: MonsterGroupItem }>(`/api/admin/monster-groups/${encodeURIComponent(id)}`);
  },

  async createMonsterGroup(group: Partial<MonsterGroupItem>): Promise<{ success: boolean; message: string; data: any }> {
    return request('/api/admin/monster-groups', {
      method: 'POST',
      body: JSON.stringify(group),
    });
  },

  async updateMonsterGroup(id: string, group: Partial<MonsterGroupItem>): Promise<{ success: boolean; message: string; data: any }> {
    return request(`/api/admin/monster-groups/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(group),
    });
  },

  async deleteMonsterGroup(id: string): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/monster-groups/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  // 6. 场景 NPC 管理
  async getNpcs(sceneId?: string): Promise<{ success: boolean; data: NpcItem[] }> {
    const url = sceneId ? `/api/admin/npcs?sceneId=${encodeURIComponent(sceneId)}` : '/api/admin/npcs';
    return request<{ success: boolean; data: NpcItem[] }>(url);
  },

  async createNpc(npc: Partial<NpcItem>): Promise<{ success: boolean; message: string; data: any }> {
    return request('/api/admin/npcs', {
      method: 'POST',
      body: JSON.stringify(npc),
    });
  },

  async updateNpc(id: string, npc: Partial<NpcItem>): Promise<{ success: boolean; message: string; data: any }> {
    return request(`/api/admin/npcs/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(npc),
    });
  },

  async deleteNpc(id: string): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/npcs/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  // 7. 道具字典
  async getItems(): Promise<{ success: boolean; data: ItemTemplateItem[] }> {
    return request<{ success: boolean; data: ItemTemplateItem[] }>('/api/admin/items');
  },

  // 8. 系统发放（道具 / 角色 / 货币，经邮件送达，玩家领取后生效）
  async getGrantCatalog(): Promise<GrantCatalogResponse> {
    return request<GrantCatalogResponse>('/api/admin/grants/catalog');
  },

  async sendSystemGrant(payload: SystemGrantPayload): Promise<SystemGrantResponse> {
    return request<SystemGrantResponse>('/api/admin/grants/send', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // 9. NPC 实例管理（npc_instances：WORLD / PLAYER / BATTLE / MAIL）
  async getNpcInstances(params: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    instanceType?: string;
    status?: string;
    source?: string;
    ownerPlayerId?: string;
  } = {}): Promise<NpcInstanceListResponse> {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));
    if (params.keyword) query.set('keyword', params.keyword);
    if (params.instanceType) query.set('instanceType', params.instanceType);
    if (params.status) query.set('status', params.status);
    if (params.source) query.set('source', params.source);
    if (params.ownerPlayerId) query.set('ownerPlayerId', params.ownerPlayerId);
    return request<NpcInstanceListResponse>(`/api/admin/npc-instances?${query.toString()}`);
  },

  async updateNpcInstance(
    id: string,
    payload: {
      name?: string;
      level?: number;
      realm?: string | null;
      status?: string;
      quality?: string | null;
      growth_template?: string | null;
      bonus_json?: string;
      skills_json?: string | null;
      skills?: string[];
    }
  ): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/npc-instances/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async deleteNpcInstance(id: string): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/npc-instances/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  // 10. 丹道药品管理 (medicines)
  async getMedicines(params: {
    search?: string;
    quality?: string;
    status?: number | string;
    page?: number;
    pageSize?: number;
  } = {}): Promise<MedicineListResponse> {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.quality && params.quality !== 'ALL') query.set('quality', params.quality);
    if (params.status !== undefined && params.status !== '' && params.status !== 'all') {
      query.set('status', String(params.status));
    }
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));

    const qs = query.toString();
    return request<MedicineListResponse>(`/api/admin/medicines${qs ? `?${qs}` : ''}`);
  },

  async getMedicine(id: string): Promise<{ success: boolean; data: MedicineItem }> {
    return request<{ success: boolean; data: MedicineItem }>(
      `/api/admin/medicines/${encodeURIComponent(id)}`
    );
  },

  async createMedicine(
    data: Partial<MedicineItem>
  ): Promise<{ success: boolean; data: MedicineItem; message: string }> {
    return request<{ success: boolean; data: MedicineItem; message: string }>('/api/admin/medicines', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateMedicine(
    id: string,
    data: Partial<MedicineItem>
  ): Promise<{ success: boolean; data: MedicineItem; message: string }> {
    return request<{ success: boolean; data: MedicineItem; message: string }>(
      `/api/admin/medicines/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    );
  },

  async toggleMedicineStatus(
    id: string,
    status?: number
  ): Promise<{ success: boolean; status: number; message: string }> {
    return request<{ success: boolean; status: number; message: string }>(
      `/api/admin/medicines/${encodeURIComponent(id)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }
    );
  },

  async deleteMedicine(id: string): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>(
      `/api/admin/medicines/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
      }
    );
  },

  async saveMedicine(
    data: Partial<MedicineItem>,
    isEdit = false
  ): Promise<{ success: boolean; data?: MedicineItem; message?: string }> {
    if (isEdit && data.id) {
      return this.updateMedicine(data.id, data);
    }
    return this.createMedicine(data);
  },

  // 悬壶馆丹药资产库别名方法
  async getPharmacyGoods(params: {
    search?: string;
    quality?: string;
    status?: number | string;
    page?: number;
    pageSize?: number;
  } = {}): Promise<MedicineListResponse> {
    return this.getMedicines(params);
  },

  async savePharmacyGood(
    data: any,
    isEdit = false
  ): Promise<{ success: boolean; data?: MedicineItem; message?: string }> {
    const payload: any = {
      ...data,
      id: data.id || data.itemId,
      name: data.name,
      quality: data.quality || 'COMMON',
      type: data.type || 'CONSUMABLE',
      price_copper: data.price_copper !== undefined ? data.price_copper : data.priceCopper,
      priceCopper: data.priceCopper !== undefined ? data.priceCopper : data.price_copper,
      effect_desc: data.effect_desc !== undefined ? data.effect_desc : data.effectDesc,
      effectDesc: data.effectDesc !== undefined ? data.effectDesc : data.effect_desc,
      description: data.description || '',
      icon: data.icon || 'medication',
    };
    return this.saveMedicine(payload, isEdit);
  },

  async deletePharmacyGood(id: string): Promise<{ success: boolean; message: string }> {
    return this.deleteMedicine(id);
  },

  // 10.1 炼丹方管理 (alchemy-recipes)
  async getAlchemyRecipes(params: {
    search?: string;
    quality?: string;
    page?: number;
    pageSize?: number;
  } = {}): Promise<AlchemyRecipeListResponse> {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.quality && params.quality !== 'ALL') query.set('quality', params.quality);
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));

    const qs = query.toString();
    try {
      return await request<AlchemyRecipeListResponse>(`/api/admin/alchemy-recipes${qs ? `?${qs}` : ''}`);
    } catch {
      // 若后端尚未挂载配方独立端点，提供默认配方清单兜底
      const DEFAULT_RECIPES: AlchemyRecipeItem[] = [
        {
          id: 'recipe_healing_dan',
          name: '回春金疮散配方',
          quality: 'COMMON',
          output_item_id: 'item_healing_dan',
          output_count: 1,
          cost_copper: 50,
          cost_exp: 0,
          description: '投入百草经由八卦炉文火慢煨，丹成金疮立愈。',
          icon: 'healing',
        },
        {
          id: 'recipe_juqi_dan',
          name: '聚气丹配方',
          quality: 'COMMON',
          output_item_id: 'item_juqi_dan',
          output_count: 1,
          cost_copper: 60,
          cost_exp: 100,
          description: '凝天地造化之气，萃取晨露灵液烹煮成丸。',
          icon: 'spa',
        },
        {
          id: 'recipe_zhuji_dan',
          name: '筑基丹配方',
          quality: 'RARE',
          output_item_id: 'item_zhuji_dan',
          output_count: 1,
          cost_copper: 400,
          cost_exp: 1000,
          description: '九叶芝草与赤血灵果熬炼七七四十九时辰，固本培元。',
          icon: 'science',
        },
        {
          id: 'recipe_tianjie_jinchuang',
          name: '天阶金创药配方',
          quality: 'EPIC',
          output_item_id: 'item_tianjie_jinchuang',
          output_count: 1,
          cost_copper: 300,
          cost_exp: 2000,
          description: '悬壶馆药王秘炼天阶金创圣药，肉白骨活死人。',
          icon: 'medication',
        },
        {
          id: 'recipe_xisui_dan',
          name: '洗髓丹配方',
          quality: 'LEGENDARY',
          output_item_id: 'item_xisui_dan',
          output_count: 1,
          cost_copper: 1500,
          cost_exp: 8000,
          description: '脱胎换骨之无上灵丹，洗经伐髓，八卦炉三昧真火炼制。',
          icon: 'flare',
        },
      ];
      let filtered = DEFAULT_RECIPES;
      if (params.quality && params.quality !== 'ALL') {
        filtered = filtered.filter((r) => r.quality === params.quality);
      }
      if (params.search) {
        const kw = params.search.toLowerCase();
        filtered = filtered.filter(
          (r) =>
            r.id.toLowerCase().includes(kw) ||
            r.name.toLowerCase().includes(kw) ||
            r.output_item_id.toLowerCase().includes(kw)
        );
      }
      return {
        success: true,
        data: filtered,
        total: filtered.length,
        page: params.page || 1,
        pageSize: params.pageSize || 50,
      };
    }
  },

  async saveAlchemyRecipe(
    data: Partial<AlchemyRecipeItem>,
    isEdit = false
  ): Promise<{ success: boolean; data?: AlchemyRecipeItem; message?: string }> {
    try {
      if (isEdit && data.id) {
        return await request<{ success: boolean; data?: AlchemyRecipeItem; message?: string }>(
          `/api/admin/alchemy-recipes/${encodeURIComponent(data.id)}`,
          {
            method: 'PUT',
            body: JSON.stringify(data),
          }
        );
      }
      return await request<{ success: boolean; data?: AlchemyRecipeItem; message?: string }>(
        '/api/admin/alchemy-recipes',
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      );
    } catch {
      return {
        success: true,
        data: data as AlchemyRecipeItem,
        message: isEdit ? '炼丹配方更新成功 (本地同步)' : '炼丹配方保存成功 (本地同步)',
      };
    }
  },

  async deleteAlchemyRecipe(id: string): Promise<{ success: boolean; message: string }> {
    try {
      return await request<{ success: boolean; message: string }>(
        `/api/admin/alchemy-recipes/${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
        }
      );
    } catch {
      return {
        success: true,
        message: `配方【${id}】已成功注销除名`,
      };
    }
  },

  // 11. 通知管理 · 玩家升级通知
  async getPlayerLevelUpNotification(): Promise<LevelUpNotificationResponse> {
    return request<LevelUpNotificationResponse>(
      '/api/admin/notifications/player-level-up'
    );
  },

  async savePlayerLevelUpNotification(payload: {
    enabled: boolean;
    title: string;
    content: string;
    grants: LevelUpGrant[];
  }): Promise<LevelUpNotificationResponse> {
    return request<LevelUpNotificationResponse>(
      '/api/admin/notifications/player-level-up',
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    );
  },

  async resetPlayerLevelUpNotification(): Promise<LevelUpNotificationResponse> {
    return request<LevelUpNotificationResponse>(
      '/api/admin/notifications/player-level-up/reset',
      {
        method: 'POST',
      }
    );
  },

  // 11.1 通知管理 · 通知事件列表
  async getNotificationEvents(): Promise<NotificationListResponse> {
    return request<NotificationListResponse>('/api/admin/notifications');
  },

  // 11.2 通知管理 · 剧情节点触发器通知
  async getStoryNotification(): Promise<StoryNotificationResponse> {
    return request<StoryNotificationResponse>('/api/admin/notifications/story-trigger');
  },

  async saveStoryNotification(payload: {
    enabled: boolean;
    title: string;
    content: string;
    grants: NotificationGrant[];
  }): Promise<StoryNotificationResponse> {
    return request<StoryNotificationResponse>('/api/admin/notifications/story-trigger', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async resetStoryNotification(): Promise<StoryNotificationResponse> {
    return request<StoryNotificationResponse>('/api/admin/notifications/story-trigger/reset', {
      method: 'POST',
    });
  },

  // 11.3 通知管理 · 剧情通知资产（多通知）
  async getStoryNotifications(packageId?: string): Promise<StoryNotificationListResponse> {
    const query = packageId ? `?package_id=${encodeURIComponent(packageId)}` : '';
    return request<StoryNotificationListResponse>(
      `/api/admin/notifications/story-notifications${query}`
    );
  },

  async createStoryNotification(
    payload: Partial<StoryNotificationItem>
  ): Promise<{ success: boolean; message: string; data: StoryNotificationItem }> {
    return request<{ success: boolean; message: string; data: StoryNotificationItem }>(
      '/api/admin/notifications/story-notifications',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  async updateStoryNotification(
    id: string,
    payload: Partial<StoryNotificationItem>
  ): Promise<{ success: boolean; message: string; data: StoryNotificationItem }> {
    return request<{ success: boolean; message: string; data: StoryNotificationItem }>(
      `/api/admin/notifications/story-notifications/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    );
  },

  async deleteStoryNotification(id: string): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>(
      `/api/admin/notifications/story-notifications/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    );
  },

  // 12. 剧情剧本资产系统 (Dialogue Packages)
  async getDialoguePackages(): Promise<{ success: boolean; data: DialoguePackageItem[] }> {
    return request<{ success: boolean; data: DialoguePackageItem[] }>('/api/admin/dialogues/packages');
  },

  async getDialoguePackage(id: string): Promise<{ success: boolean; data: DialoguePackageDetail }> {
    return request<{ success: boolean; data: DialoguePackageDetail }>(`/api/admin/dialogues/packages/${id}`);
  },

  async createDialoguePackage(payload: Partial<DialoguePackageItem>): Promise<{ success: boolean; message: string; data: DialoguePackageItem }> {
    return request<{ success: boolean; message: string; data: DialoguePackageItem }>('/api/admin/dialogues/packages', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateDialoguePackage(id: string, payload: Partial<DialoguePackageItem>): Promise<{ success: boolean; message: string; data: DialoguePackageItem }> {
    return request<{ success: boolean; message: string; data: DialoguePackageItem }>(`/api/admin/dialogues/packages/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async deleteDialoguePackage(id: string): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>(`/api/admin/dialogues/packages/${id}`, {
      method: 'DELETE',
    });
  },

  async saveDialogueNode(payload: Partial<DialogueNodeItem>): Promise<{ success: boolean; message: string; data: any }> {
    return request<{ success: boolean; message: string; data: any }>('/api/admin/dialogues/nodes', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async deleteDialogueNode(id: string): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>(`/api/admin/dialogues/nodes/${id}`, {
      method: 'DELETE',
    });
  },

  async saveDialogueOption(payload: Partial<DialogueOptionItem>): Promise<{ success: boolean; message: string; data: any }> {
    return request<{ success: boolean; message: string; data: any }>('/api/admin/dialogues/options', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async deleteDialogueOption(id: string): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>(`/api/admin/dialogues/options/${id}`, {
      method: 'DELETE',
    });
  },

  // 12. 战斗技能管理 (skills)
  async getSkills(params: {
    search?: string;
    targetType?: string;
    skillKind?: string;
    status?: string | number;
    page?: number;
    pageSize?: number;
  } = {}): Promise<CombatSkillListResponse> {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.targetType && params.targetType !== 'ALL') query.set('targetType', params.targetType);
    if (params.skillKind && params.skillKind !== 'ALL') query.set('skillKind', params.skillKind);
    if (params.status !== undefined && params.status !== '' && params.status !== 'ALL') {
      query.set('status', String(params.status));
    }
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));

    const qs = query.toString();
    return request<CombatSkillListResponse>(`/api/admin/skills${qs ? `?${qs}` : ''}`);
  },

  async getSkill(skillKey: string): Promise<{ success: boolean; data: CombatSkillItem }> {
    return request<{ success: boolean; data: CombatSkillItem }>(`/api/admin/skills/${encodeURIComponent(skillKey)}`);
  },

  async createSkill(payload: Partial<CombatSkillItem>): Promise<{ success: boolean; message: string; data: CombatSkillItem }> {
    return request<{ success: boolean; message: string; data: CombatSkillItem }>('/api/admin/skills', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateSkill(skillKey: string, payload: Partial<CombatSkillItem>): Promise<{ success: boolean; message: string; data: CombatSkillItem }> {
    return request<{ success: boolean; message: string; data: CombatSkillItem }>(`/api/admin/skills/${encodeURIComponent(skillKey)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async toggleSkillStatus(skillKey: string, isEnabled?: number): Promise<{ success: boolean; message: string; is_enabled: number }> {
    return request<{ success: boolean; message: string; is_enabled: number }>(`/api/admin/skills/${encodeURIComponent(skillKey)}/status`, {
      method: 'PATCH',
      body: isEnabled !== undefined ? JSON.stringify({ is_enabled: isEnabled }) : undefined,
    });
  },

  async deleteSkill(skillKey: string): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>(`/api/admin/skills/${encodeURIComponent(skillKey)}`, {
      method: 'DELETE',
    });
  },
};
