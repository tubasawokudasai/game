import { createAdminRouter, toNumber, toNullableInt, toNullableNumber, normalizeQuality, normalizeGrowthTemplate, loadTemplateMap } from './types';
import {
  calculateNpcAttributesFromRows,
  NPC_ATTRIBUTE_CONFIG,
  NPC_GROWTH_TEMPLATES,
  NPC_GROWTH_TEMPLATE_IDS,
  NPC_QUALITY_DEFINITIONS,
  NPC_QUALITY_IDS,
  NPC_REALM_DEFINITIONS,
  npcAttributeCalculator,
  previewNpcAttributesFromRows,
  resolveEffectiveGrowthProfile,
} from '../../services/npc/attributes';

export const npcTemplatesRoutes = createAdminRouter();

/** 后台模板列表：展示“实际生效”的成长配置，避免前端再写一套公式 */
function templateDto(row: any) {
  const effective = resolveEffectiveGrowthProfile(row);
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    title: row.title || '',
    badge: row.badge || '',
    avatar: row.avatar || '',
    idle_avatar: row.idle_avatar || '',
    attack_avatar: row.attack_avatar || '',
    base_hp: effective.base.hp,
    base_mp: effective.base.mp,
    base_attack: effective.base.atk,
    base_defense: effective.base.def,
    base_speed: effective.base.spd,
    base_matk: effective.base.matk,
    base_mdef: effective.base.mdef,
    base_crit: effective.base.crit,
    growth_hp: effective.growth.hp,
    growth_mp: effective.growth.mp,
    growth_attack: effective.growth.atk,
    growth_matk: effective.growth.matk,
    growth_defense: effective.growth.def,
    growth_mdef: effective.growth.mdef,
    growth_speed: effective.growth.spd,
    growth_crit: effective.growth.crit,
    growth_template: effective.growthTemplateId,
    growth_source: effective.growthSource,
    quality: effective.quality,
    quality_label: effective.qualityLabel,
    quality_multiplier: effective.qualityMultiplier,
    role: row.role || 'DPS',
    sort_order: Number(row.sort_order) || 0,
    bonus_json: row.bonus_json || '{}',
    skills_json: row.skills_json || '[]',
    description: row.description || '',
    dialogue_package_id: row.dialogue_package_id || null,
    dialogue_package_name: row.dialogue_package_name || null,
    dialogue_root_node_id: row.dialogue_root_node_id || null,
    quote: row.quote || '',
    gossip: row.gossip || '',
    usage: {
      configs: Number(row.config_count) || 0,
      npcs: Number(row.npc_count) || 0,
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * 获取 NPC 模板列表
 * GET /api/admin/npc-templates
 */
npcTemplatesRoutes.get('/npc-templates', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未初始化' }, 500);

  const { results } = await c.env.DB.prepare(
    `SELECT t.*,
            dp.name AS dialogue_package_name,
            (SELECT COUNT(*) FROM monster_group_members m JOIN npc_instances i ON i.npc_id = m.npc_instance_id WHERE i.template_id = t.id) AS config_count,
            (SELECT COUNT(*) FROM npc_instances i WHERE i.template_id = t.id AND i.instance_type = 'WORLD' AND i.npc_role = 'MAP') AS npc_count
     FROM npc_templates t
     LEFT JOIN dialogue_packages dp ON dp.id = t.dialogue_package_id
     ORDER BY t.name ASC`
  ).all<any>();

  return c.json({ success: true, data: (results || []).map(templateDto) });
});

/**
 * 获取单个 NPC 模板
 * GET /api/admin/npc-templates/:id
 */
npcTemplatesRoutes.get('/npc-templates/:id', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未初始化' }, 500);

  const row = await c.env.DB.prepare(
    `SELECT t.*,
            dp.name AS dialogue_package_name,
            (SELECT COUNT(*) FROM monster_group_members m JOIN npc_instances i ON i.npc_id = m.npc_instance_id WHERE i.template_id = t.id) AS config_count,
            (SELECT COUNT(*) FROM npc_instances i WHERE i.template_id = t.id AND i.instance_type = 'WORLD' AND i.npc_role = 'MAP') AS npc_count
     FROM npc_templates t
     LEFT JOIN dialogue_packages dp ON dp.id = t.dialogue_package_id
     WHERE t.id = ?`
  )
    .bind(c.req.param('id'))
    .first<any>();

  if (!row) return c.json({ error: 'NPC 模板不存在' }, 404);
  return c.json({ success: true, data: templateDto(row) });
});

/**
 * 新建 NPC 模板
 * POST /api/admin/npc-templates
 */
npcTemplatesRoutes.post('/npc-templates', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未初始化' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  if (!name) return c.json({ error: 'NPC 模板名称不能为空' }, 400);

  const id = String(body.id || '').trim() || `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const key = String(body.key || '').trim() || id;

  const conflict = await c.env.DB.prepare('SELECT id FROM npc_templates WHERE id = ? OR key = ?')
    .bind(id, key)
    .first();
  if (conflict) return c.json({ error: `模板 ID 或 key [${id}/${key}] 已存在` }, 400);

  const growthTemplate = normalizeGrowthTemplate(body.growth_template);
  const profile = NPC_GROWTH_TEMPLATES[
    (growthTemplate || NPC_ATTRIBUTE_CONFIG.defaultGrowthTemplate) as keyof typeof NPC_GROWTH_TEMPLATES
  ];
  const quality = normalizeQuality(body.quality) || NPC_ATTRIBUTE_CONFIG.defaultQuality;
  const base = {
    hp: Math.max(1, toNumber(body.base_hp, profile.base.hp)),
    mp: Math.max(0, toNumber(body.base_mp, profile.base.mp)),
    atk: Math.max(1, toNumber(body.base_attack, profile.base.atk)),
    matk: Math.max(0, toNumber(body.base_matk, profile.base.matk)),
    def: Math.max(0, toNumber(body.base_defense, profile.base.def)),
    mdef: Math.max(0, toNumber(body.base_mdef, profile.base.mdef)),
    spd: Math.max(1, toNumber(body.base_speed, profile.base.spd)),
    crit: Math.min(1, Math.max(0, toNumber(body.base_crit, profile.base.crit))),
  };
  const growth = {
    hp: toNullableInt(body.growth_hp, 0) ?? profile.growth.hp,
    mp: toNullableInt(body.growth_mp, 0) ?? profile.growth.mp,
    atk: toNullableInt(body.growth_attack, 0) ?? profile.growth.atk,
    matk: toNullableInt(body.growth_matk, 0) ?? profile.growth.matk,
    def: toNullableInt(body.growth_defense, 0) ?? profile.growth.def,
    mdef: toNullableInt(body.growth_mdef, 0) ?? profile.growth.mdef,
    spd: toNullableNumber(body.growth_speed, 0) ?? profile.growth.spd,
    crit: toNullableNumber(body.growth_crit, 0) ?? profile.growth.crit,
  };
  const bonusJson =
    typeof body.bonus_json === 'string'
      ? body.bonus_json
      : JSON.stringify(body.bonuses || {});

  const dialoguePackageId = String(body.dialogue_package_id || '').trim() || null;
  const dialogueRootNodeId = String(body.dialogue_root_node_id || '').trim() || null;
  const quote = String(body.quote || '').trim();
  const gossip = String(body.gossip || '').trim();

  await c.env.DB.prepare(
    `INSERT INTO npc_templates
      (id, key, name, title, badge, avatar, idle_avatar, attack_avatar,
       base_hp, base_mp, base_attack, base_matk, base_defense, base_mdef, base_speed, base_crit,
       growth_template, quality,
       growth_hp, growth_mp, growth_attack, growth_matk,
       growth_defense, growth_mdef, growth_speed, growth_crit,
       bonus_json, role, sort_order, skills_json, description,
       dialogue_package_id, dialogue_root_node_id, quote, gossip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      key,
      name,
      String(body.title || '').trim(),
      String(body.badge || '').trim(),
      String(body.avatar || '').trim(),
      String(body.idle_avatar || '').trim(),
      String(body.attack_avatar || '').trim(),
      base.hp,
      base.mp,
      base.atk,
      base.matk,
      base.def,
      base.mdef,
      base.spd,
      base.crit,
      growthTemplate,
      quality,
      growth.hp,
      growth.mp,
      growth.atk,
      growth.matk,
      growth.def,
      growth.mdef,
      growth.spd,
      growth.crit,
      bonusJson,
      String(body.role || 'DPS').trim() || 'DPS',
      Math.round(toNumber(body.sort_order, 0)),
      typeof body.skills_json === 'string' ? body.skills_json : JSON.stringify(body.skills || []),
      String(body.description || '').trim(),
      dialoguePackageId,
      dialogueRootNodeId,
      quote,
      gossip
    )
    .run();

  return c.json({ success: true, message: `NPC 模板 [${name}] 创建成功`, data: { id, key, name } });
});

/**
 * 更新 NPC 模板
 * PUT /api/admin/npc-templates/:id
 */
npcTemplatesRoutes.put('/npc-templates/:id', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未初始化' }, 500);
  const id = c.req.param('id');

  const existing = await c.env.DB.prepare('SELECT * FROM npc_templates WHERE id = ?').bind(id).first<any>();
  if (!existing) return c.json({ error: 'NPC 模板不存在' }, 404);

  const body = await c.req.json().catch(() => ({}));
  const name = String(body.name ?? existing.name).trim();
  if (!name) return c.json({ error: 'NPC 模板名称不能为空' }, 400);

  const key = String(body.key ?? existing.key).trim() || existing.key;
  if (key !== existing.key) {
    const conflict = await c.env.DB.prepare('SELECT id FROM npc_templates WHERE key = ? AND id <> ?')
      .bind(key, id)
      .first();
    if (conflict) return c.json({ error: `模板 key [${key}] 已存在` }, 400);
  }

  const growthTemplate =
    body.growth_template !== undefined
      ? normalizeGrowthTemplate(body.growth_template)
      : existing.growth_template || null;
  const profile = growthTemplate
    ? NPC_GROWTH_TEMPLATES[growthTemplate as keyof typeof NPC_GROWTH_TEMPLATES]
    : null;
  const quality =
    body.quality !== undefined
      ? normalizeQuality(body.quality) || NPC_ATTRIBUTE_CONFIG.defaultQuality
      : existing.quality || NPC_ATTRIBUTE_CONFIG.defaultQuality;

  const pickNumber = (field: string, fallback: number, min = 0, max = Number.POSITIVE_INFINITY) => {
    const raw = body[field] !== undefined ? body[field] : fallback;
    return Math.min(max, Math.max(min, toNumber(raw, fallback)));
  };
  const pickGrowth = (
    field: string,
    existingField: string,
    profileValue: number
  ) => {
    if (body[field] !== undefined) return toNumber(body[field], 0);
    // 编辑时切换成长模板：直接按新模板覆盖成长值；保持自定义时沿用数据库现值
    if (body.growth_template !== undefined && profile) return profileValue;
    return toNumber(existing[existingField], 0);
  };
  const bonusJson =
    typeof body.bonus_json === 'string'
      ? body.bonus_json
      : existing.bonus_json || '{}';

  const dialoguePackageId = body.dialogue_package_id !== undefined
    ? (String(body.dialogue_package_id || '').trim() || null)
    : (existing.dialogue_package_id || null);
  const dialogueRootNodeId = body.dialogue_root_node_id !== undefined
    ? (String(body.dialogue_root_node_id || '').trim() || null)
    : (existing.dialogue_root_node_id || null);
  const quote = body.quote !== undefined
    ? String(body.quote || '').trim()
    : (existing.quote || '');
  const gossip = body.gossip !== undefined
    ? String(body.gossip || '').trim()
    : (existing.gossip || '');

  await c.env.DB.prepare(
    `UPDATE npc_templates SET
      key = ?, name = ?, title = ?, badge = ?, avatar = ?, idle_avatar = ?, attack_avatar = ?,
      base_hp = ?, base_mp = ?, base_attack = ?, base_matk = ?, base_defense = ?, base_mdef = ?,
      base_speed = ?, base_crit = ?,
      growth_template = ?, quality = ?,
      growth_hp = ?, growth_mp = ?, growth_attack = ?, growth_matk = ?,
      growth_defense = ?, growth_mdef = ?, growth_speed = ?, growth_crit = ?,
      bonus_json = ?, role = ?, sort_order = ?,
      skills_json = ?, description = ?,
      dialogue_package_id = ?, dialogue_root_node_id = ?, quote = ?, gossip = ?,
      updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(
      key,
      name,
      String(body.title ?? existing.title).trim(),
      String(body.badge ?? existing.badge).trim(),
      String(body.avatar ?? existing.avatar).trim(),
      String(body.idle_avatar ?? existing.idle_avatar).trim(),
      String(body.attack_avatar ?? existing.attack_avatar).trim(),
      pickNumber('base_hp', existing.base_hp, 1),
      pickNumber('base_mp', existing.base_mp, 0),
      pickNumber('base_attack', existing.base_attack, 1),
      pickNumber('base_matk', existing.base_matk, 0),
      pickNumber('base_defense', existing.base_defense, 0),
      pickNumber('base_mdef', existing.base_mdef, 0),
      pickNumber('base_speed', existing.base_speed, 1),
      pickNumber('base_crit', existing.base_crit, 0, 1),
      growthTemplate,
      quality,
      pickGrowth('growth_hp', 'growth_hp', profile?.growth.hp ?? 0),
      pickGrowth('growth_mp', 'growth_mp', profile?.growth.mp ?? 0),
      pickGrowth('growth_attack', 'growth_attack', profile?.growth.atk ?? 0),
      pickGrowth('growth_matk', 'growth_matk', profile?.growth.matk ?? 0),
      pickGrowth('growth_defense', 'growth_defense', profile?.growth.def ?? 0),
      pickGrowth('growth_mdef', 'growth_mdef', profile?.growth.mdef ?? 0),
      pickGrowth('growth_speed', 'growth_speed', profile?.growth.spd ?? 0),
      pickGrowth('growth_crit', 'growth_crit', profile?.growth.crit ?? 0),
      bonusJson,
      String(body.role ?? existing.role ?? 'DPS').trim() || 'DPS',
      Math.round(toNumber(body.sort_order ?? existing.sort_order, 0)),
      typeof body.skills_json === 'string' ? body.skills_json : existing.skills_json,
      String(body.description ?? existing.description).trim(),
      dialoguePackageId,
      dialogueRootNodeId,
      quote,
      gossip,
      id
    )
    .run();

  return c.json({ success: true, message: `NPC 模板 [${name}] 更新成功`, data: { id, key, name } });
});

/**
 * 删除 NPC 模板（被地图实例或战斗配置引用时阻断）
 * DELETE /api/admin/npc-templates/:id
 */
npcTemplatesRoutes.delete('/npc-templates/:id', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未初始化' }, 500);
  const id = c.req.param('id');

  const refs = await c.env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM monster_group_members m JOIN npc_instances i ON i.npc_id = m.npc_instance_id WHERE i.template_id = ?) AS configRefs,
       (SELECT COUNT(*) FROM npc_instances WHERE template_id = ?) AS npcRefs`
  )
    .bind(id, id)
    .first<any>();

  if ((Number(refs?.configRefs) || 0) > 0 || (Number(refs?.npcRefs) || 0) > 0) {
    return c.json(
      {
        error: `无法删除：该模板仍被 ${Number(refs?.configRefs) || 0} 个战斗配置槽位、${Number(refs?.npcRefs) || 0} 个 NPC 实例引用，请先解除引用`,
      },
      400
    );
  }

  await c.env.DB.prepare('DELETE FROM npc_templates WHERE id = ?').bind(id).run();
  return c.json({ success: true, message: 'NPC 模板已删除' });
});

// ==============================================================================
// 4.0 NPC 属性成长配置与预览
// ==============================================================================

/** 解析 1,10,20,50,100 这类等级列表；默认返回验收等级 */
function parsePreviewLevels(raw: string | undefined): number[] {
  const defaults = [1, 10, 20, 50, 100];
  if (!raw) return defaults;
  const levels = raw
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item >= 1);
  return levels.length > 0 ? levels : defaults;
}

/**
 * 成长配置总览：供后台展示四种成长模板、四档品质与境界加成
 * GET /api/admin/npc-attributes/config
 */
npcTemplatesRoutes.get('/npc-attributes/config', async (c) => {
  return c.json({
    success: true,
    data: {
      baseLevel: NPC_ATTRIBUTE_CONFIG.baseLevel,
      maxLevel: NPC_ATTRIBUTE_CONFIG.maxLevel,
      defaultGrowthTemplate: NPC_ATTRIBUTE_CONFIG.defaultGrowthTemplate,
      defaultLevels: [1, 10, 20, 50, 100],
      growthTemplates: Object.values(NPC_GROWTH_TEMPLATES),
      qualities: Object.values(NPC_QUALITY_DEFINITIONS),
      realms: NPC_REALM_DEFINITIONS,
    },
  });
});

/**
 * 查看某个 NPC 模板 / 成长模板在不同等级的成长属性
 * GET /api/admin/npc-attributes/preview?templateId=tpl_cangyun&levels=1,10,20,50,100&quality=COMMON
 * 也可不传 templateId，直接查看成长模板：?growthTemplate=warrior&levels=1,10,20
 */
npcTemplatesRoutes.get('/npc-attributes/preview', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未初始化' }, 500);

  try {
    const templateId = String(c.req.query('templateId') || '').trim();
    const growthTemplate = normalizeGrowthTemplate(c.req.query('growthTemplate'));
    const quality = normalizeQuality(c.req.query('quality'));
    const realmQuery = c.req.query('realm');
    const levels = parsePreviewLevels(c.req.query('levels'));

    if (!templateId && !growthTemplate) {
      return c.json({ error: '请提供 templateId 或 growthTemplate' }, 400);
    }

    if (templateId) {
      const row = await c.env.DB.prepare('SELECT * FROM npc_templates WHERE id = ?')
        .bind(templateId)
        .first<any>();
      if (!row) return c.json({ error: 'NPC 模板不存在' }, 404);

      const previewRow = {
        ...row,
        growth_template: growthTemplate ?? row.growth_template,
        quality: quality ?? row.quality,
      };
      const previewRealm = realmQuery !== undefined ? (realmQuery || null) : null;

      const data = previewNpcAttributesFromRows({
        template: previewRow,
        levels,
        realm: previewRealm,
      });
      return c.json({
        success: true,
        data: {
          ...data,
          sourceLabel: row.name || templateId,
          templateId,
          quality: normalizeQuality(previewRow.quality) || NPC_ATTRIBUTE_CONFIG.defaultQuality,
          growthTemplate: normalizeGrowthTemplate(previewRow.growth_template),
          realm: previewRealm || '',
        },
      });
    }

    const profile = NPC_GROWTH_TEMPLATES[growthTemplate as keyof typeof NPC_GROWTH_TEMPLATES];
    const rows = npcAttributeCalculator.preview(
      {
        growthTemplate: profile.id,
        quality: quality || NPC_ATTRIBUTE_CONFIG.defaultQuality,
        realm: realmQuery || null,
      },
      levels
    );
    return c.json({
      success: true,
      data: {
        sourceLabel: profile.label,
        levels: rows,
        templateId: null,
        quality: quality || NPC_ATTRIBUTE_CONFIG.defaultQuality,
        growthTemplate: profile.id,
        realm: realmQuery || '',
      },
    });
  } catch (err: any) {
    console.error('[adminRoutes] NPC 属性预览失败:', err);
    return c.json({ error: err.message || 'NPC 属性预览失败' }, 500);
  }
});

/**
 * 战斗配置槽位实时预览：前端编辑等级/品质时由服务端统一计算
 * POST /api/admin/npc-attributes/preview-batch
 * body: { slots: [{ slot_index, template_id, level, quality, hp_override... }] }
 */
npcTemplatesRoutes.post('/npc-attributes/preview-batch', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未初始化' }, 500);

  try {
    const body = await c.req.json().catch(() => ({}));
    const slots = Array.isArray(body.slots) ? body.slots : [];
    if (slots.length === 0) return c.json({ success: true, data: { members: [] } });

    const templateMap = await loadTemplateMap(
      c.env.DB,
      slots.map((slot: any) => String(slot?.template_id || ''))
    );

    const members = slots.map((slot: any, index: number) => {
      const templateId = String(slot?.template_id || '').trim();
      const template = templateMap.get(templateId);
      if (!template) {
        return {
          slot_index: Number.isInteger(Number(slot?.slot_index)) ? Number(slot.slot_index) : index,
          error: `模板 [${templateId || '空'}] 不存在`,
        };
      }

      const level = Math.max(1, Math.round(toNumber(slot?.level, 1)));
      const final = calculateNpcAttributesFromRows({
        template,
        qualityOverride: normalizeQuality(slot?.quality),
        realm: String(slot?.realm || '').trim() || null,
        level,
        overrides: {
          hp: toNullableInt(slot?.hp_override, 1) ?? undefined,
          mp: toNullableInt(slot?.mp_override, 0) ?? undefined,
          atk: toNullableInt(slot?.attack_override, 1) ?? undefined,
          def: toNullableInt(slot?.defense_override, 0) ?? undefined,
          spd: toNullableInt(slot?.speed_override, 1) ?? undefined,
        },
      });

      return {
        slot_index: Number.isInteger(Number(slot?.slot_index)) ? Number(slot.slot_index) : index,
        hp: final.maxHp,
        maxHp: final.maxHp,
        mp: final.maxMp,
        maxMp: final.maxMp,
        attack: final.atk,
        matk: final.matk,
        defense: final.def,
        mdef: final.mdef,
        speed: final.spd,
        crit: final.crit,
        combatPower: final.combatPower,
        quality: final.quality,
        quality_label: final.qualityLabel,
        growth_template: final.growthTemplateId,
      };
    });

    return c.json({ success: true, data: { members } });
  } catch (err: any) {
    console.error('[adminRoutes] NPC 槽位预览失败:', err);
    return c.json({ error: err.message || 'NPC 槽位预览失败' }, 500);
  }
});

