import { createAdminRouter, toNumber, toNullableInt, normalizeQuality, loadTemplateMap } from './types';
import { calculateNpcAttributesFromRows } from '../../services/npc/attributes';

export const monsterGroupsRoutes = createAdminRouter();


interface MemberInput {
  slot_index: number;
  template_id: string;
  level: number;
  position: 'FRONT' | 'BACK';
  is_boss: number;
  quality: string | null;
  realm: string | null;
  hp_override: number | null;
  mp_override: number | null;
  attack_override: number | null;
  defense_override: number | null;
  speed_override: number | null;
}

/**
 * 战斗配置槽位 DTO。
 * 最终属性统一由 NpcAttributeCalculator 生成，后台只做展示。
 */
function memberDto(m: any) {
  const level = Math.max(1, Number(m.level) || 1);
  const final = calculateNpcAttributesFromRows({
    template: {
      base_hp: m.base_hp,
      base_mp: m.base_mp,
      base_attack: m.base_attack,
      base_defense: m.base_defense,
      base_speed: m.base_speed,
      base_matk: m.base_matk,
      base_mdef: m.base_mdef,
      base_crit: m.base_crit,
      growth_hp: m.growth_hp,
      growth_mp: m.growth_mp,
      growth_attack: m.growth_attack,
      growth_matk: m.growth_matk,
      growth_defense: m.growth_defense,
      growth_mdef: m.growth_mdef,
      growth_speed: m.growth_speed,
      growth_crit: m.growth_crit,
      growth_template: m.template_growth_template ?? m.growth_template ?? null,
      quality: m.template_quality ?? m.quality ?? null,
      bonus_json: m.template_bonus_json ?? m.bonus_json ?? null,
    },
    instance: {
      quality: m.instance_quality,
      growth_template: m.instance_growth_template,
      bonus_json: m.instance_bonus_json,
    },
    qualityOverride: m.quality || null,
    realm: m.instance_realm || null,
    level,
    overrides: {
      hp: m.hp_override ?? undefined,
      mp: m.mp_override ?? undefined,
      atk: m.attack_override ?? undefined,
      def: m.defense_override ?? undefined,
      spd: m.speed_override ?? undefined,
    },
  });

  return {
    slot_index: Number(m.slot_index) || 0,
    npc_instance_id: m.npc_instance_id || null,
    template_id: m.template_id,
    template_name: m.instance_name || m.template_name || m.name || m.template_id,
    template_avatar: m.instance_avatar || m.template_avatar || m.avatar || '',
    level,
    position: m.position === 'BACK' ? 'BACK' : 'FRONT',
    is_boss: Number(m.is_boss) === 1,
    // quality 保留“槽位覆盖值”，便于编辑时识别继承关系；effective_quality 才是最终品质
    quality: m.quality || null,
    effective_quality: final.quality,
    quality_label: final.qualityLabel,
    growth_template: final.growthTemplateId,
    realm: m.instance_realm || null,
    hp_override: m.hp_override === null || m.hp_override === undefined ? null : Number(m.hp_override),
    mp_override: m.mp_override === null || m.mp_override === undefined ? null : Number(m.mp_override),
    attack_override: m.attack_override === null || m.attack_override === undefined ? null : Number(m.attack_override),
    defense_override: m.defense_override === null || m.defense_override === undefined ? null : Number(m.defense_override),
    speed_override: m.speed_override === null || m.speed_override === undefined ? null : Number(m.speed_override),
    hp: final.maxHp,
    mp: final.maxMp,
    attack: final.atk,
    matk: final.matk,
    defense: final.def,
    mdef: final.mdef,
    speed: final.spd,
    crit: final.crit,
    combatPower: final.combatPower,
  };
}

function memberCombatPower(m: ReturnType<typeof memberDto>): number {
  return Math.round(
    m.combatPower ||
      m.attack * 1.5 +
        m.matk * 1.5 +
        m.defense * 1.2 +
        m.mdef * 1.2 +
        m.hp * 0.1 +
        m.speed * 2 +
        m.crit * 1000
  );
}

function normalizeMemberInputs(raw: any[], templateMap: Map<string, any>): { members?: MemberInput[]; error?: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: '战斗配置至少需要 1 个 NPC 槽位' };
  }
  if (raw.length > 4) {
    return { error: '战斗画布最多支持 4 个敌方槽位' };
  }

  const usedSlots = new Set<number>();
  const members: MemberInput[] = [];

  for (let i = 0; i < raw.length; i++) {
    const input = raw[i] || {};
    const templateId = String(input.template_id || '').trim();
    if (!templateId) return { error: `第 ${i + 1} 个槽位未选择 NPC 模板` };
    if (!templateMap.has(templateId)) return { error: `第 ${i + 1} 个槽位引用的模板 [${templateId}] 不存在` };

    const slot = Number.isInteger(Number(input.slot_index)) ? Number(input.slot_index) : i;
    if (slot < 0 || slot > 3) return { error: `槽位编号必须在 0~3 之间` };
    if (usedSlots.has(slot)) return { error: `槽位 [${slot}] 重复分配` };
    usedSlots.add(slot);

    members.push({
      slot_index: slot,
      template_id: templateId,
      level: Math.max(1, Math.round(toNumber(input.level, 1))),
      position: input.position === 'BACK' ? 'BACK' : 'FRONT',
      is_boss: input.is_boss ? 1 : 0,
      quality: normalizeQuality(input.quality),
      realm: String(input.realm || '').trim() || null,
      hp_override: toNullableInt(input.hp_override, 1),
      mp_override: toNullableInt(input.mp_override, 0),
      attack_override: toNullableInt(input.attack_override, 1),
      defense_override: toNullableInt(input.defense_override, 0),
      speed_override: toNullableInt(input.speed_override, 1),
    });
  }

  return { members };
}


async function loadGroupMembers(db: D1Database, groupId?: string): Promise<any[]> {
  const sql = `SELECT m.*,
                      i.template_id, i.name AS instance_name, i.avatar AS instance_avatar,
                      i.quality AS instance_quality,
                      i.realm AS instance_realm,
                      i.growth_template AS instance_growth_template,
                      i.bonus_json AS instance_bonus_json,
                      t.name AS template_name, t.avatar AS template_avatar, t.badge AS template_badge,
                      t.base_hp, t.base_mp, t.base_attack, t.base_defense, t.base_speed,
                      t.base_matk, t.base_mdef, t.base_crit,
                      t.growth_hp, t.growth_mp, t.growth_attack, t.growth_matk,
                      t.growth_defense, t.growth_mdef, t.growth_speed, t.growth_crit,
                      t.growth_template AS template_growth_template,
                      t.quality AS template_quality,
                      t.bonus_json AS template_bonus_json
               FROM monster_group_members m
               JOIN npc_instances i ON i.npc_id = m.npc_instance_id
               JOIN npc_templates t ON t.id = i.template_id
               ${groupId ? 'WHERE m.group_id = ?' : ''}
               ORDER BY m.group_id ASC, m.slot_index ASC`;
  const query = db.prepare(sql);
  const { results } = groupId ? await query.bind(groupId).all<any>() : await query.all<any>();
  return results || [];
}

async function loadGroupNpcRefs(db: D1Database, groupId?: string): Promise<any[]> {
  const sql = `SELECT DISTINCT i.npc_id AS id, i.name, i.scene_id, i.battle_group_id
               FROM npc_instances i
               WHERE i.instance_type = 'WORLD'
                 AND i.battle_group_id IS NOT NULL ${groupId ? 'AND i.battle_group_id = ?' : ''}`;
  const query = db.prepare(sql);
  const { results } = groupId ? await query.bind(groupId).all<any>() : await query.all<any>();
  return results || [];
}

/**
 * 为战斗配置槽位准备具体的 npc_instances 记录。
 * 每个槽位都是一条从模板创建的 BATTLE 实例，monster_group_members 只保存实例关联与战斗参数。
 */
async function prepareGroupMemberInstances(
  db: D1Database,
  groupId: string,
  members: MemberInput[],
  createdBy: string
): Promise<{ prepared: Array<MemberInput & { npc_instance_id: string; template: any }>; statements: D1PreparedStatement[]; cleanup: D1PreparedStatement }> {
  const existingResult = await db
    .prepare(
      `SELECT m.slot_index, m.npc_instance_id, i.template_id
       FROM monster_group_members m
       JOIN npc_instances i ON i.npc_id = m.npc_instance_id
       WHERE m.group_id = ?`
    )
    .bind(groupId)
    .all<{ slot_index: number; npc_instance_id: string; template_id: string }>();

  const existingBySlot = new Map(
    (existingResult.results || []).map((row) => [Number(row.slot_index), row])
  );
  const templateMap = await loadTemplateMap(db, members.map((m) => m.template_id));
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];
  const prepared: Array<MemberInput & { npc_instance_id: string; template: any }> = [];

  members.forEach((member, index) => {
    const template = templateMap.get(member.template_id);
    if (!template) {
      throw new Error(`槽位 ${member.slot_index} 引用的模板 [${member.template_id}] 不存在`);
    }

    const existing = existingBySlot.get(member.slot_index);
    const instanceId =
      existing?.npc_instance_id || `npcinst_battle_${groupId}_${member.slot_index}_${now}_${index}`;

    if (existing) {
      statements.push(
        db
          .prepare(
            `UPDATE npc_instances SET
               template_id = ?, name = ?, badge = ?, title = ?, avatar = ?,
               type = 'battle', status = 'ACTIVE', source = 'MONSTER_GROUP', source_ref = ?,
               level = ?, realm = ?, updated_at = CURRENT_TIMESTAMP
             WHERE npc_id = ?`
          )
          .bind(
            member.template_id,
            template.name,
            template.badge || '',
            template.title || '',
            template.avatar || '',
            groupId,
            member.level,
            member.realm,
            instanceId
          )
      );
    } else {
      statements.push(
        db
          .prepare(
            `INSERT INTO npc_instances
               (npc_id, template_id, instance_type, status, scene_id, key, name, badge, title, avatar,
                type, quote, gossip, owner_player_id, created_by, source, source_ref,
                battle_group_id, battle_level, battle_reward_json, respawn_seconds, once_flag, level, realm, skills_json)
             VALUES (?, ?, 'BATTLE', 'ACTIVE', NULL, NULL, ?, ?, ?, ?,
                     'battle', '', '', NULL, ?, 'MONSTER_GROUP', ?,
                     NULL, 1, '{}', 0, NULL, ?, ?, ?)`
          )
          .bind(
            instanceId,
            member.template_id,
            template.name,
            template.badge || '',
            template.title || '',
            template.avatar || '',
            createdBy,
            groupId,
            member.level,
            member.realm,
            template.skills_json || null
          )
      );
    }

    prepared.push({ ...member, npc_instance_id: instanceId, template });
  });

  const usedIds = prepared.map((m) => m.npc_instance_id);
  const cleanup = usedIds.length > 0
    ? db
        .prepare(
          `DELETE FROM npc_instances
           WHERE instance_type = 'BATTLE' AND source = 'MONSTER_GROUP' AND source_ref = ?
             AND npc_id NOT IN (${usedIds.map(() => '?').join(',')})`
        )
        .bind(groupId, ...usedIds)
    : db
        .prepare(
          `DELETE FROM npc_instances
           WHERE instance_type = 'BATTLE' AND source = 'MONSTER_GROUP' AND source_ref = ?`
        )
        .bind(groupId);

  return { prepared, statements, cleanup };
}

/**
 * 获取战斗配置列表
 * GET /api/admin/monster-groups
 */
monsterGroupsRoutes.get('/monster-groups', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未初始化' }, 500);

  const { results: rows } = await c.env.DB.prepare(
    'SELECT id, name, created_at FROM monster_groups ORDER BY created_at DESC'
  ).all<any>();

  const members = await loadGroupMembers(c.env.DB);
  const refs = await loadGroupNpcRefs(c.env.DB);

  const membersByGroup = new Map<string, any[]>();
  for (const m of members) {
    const list = membersByGroup.get(m.group_id) || [];
    list.push(memberDto(m));
    membersByGroup.set(m.group_id, list);
  }

  const refsByGroup = new Map<string, any[]>();
  for (const ref of refs) {
    const list = refsByGroup.get(ref.battle_group_id) || [];
    list.push({ id: ref.id, name: ref.name, scene_id: ref.scene_id });
    refsByGroup.set(ref.battle_group_id, list);
  }

  const data = (rows || []).map((row) => {
    const list = membersByGroup.get(row.id) || [];
    return {
      id: row.id,
      name: row.name,
      members: list,
      enemyCount: list.length,
      totalHp: list.reduce((sum, m) => sum + m.hp, 0),
      totalCombatPower: list.reduce((sum, m) => sum + memberCombatPower(m), 0),
      referencedNpcs: refsByGroup.get(row.id) || [],
      created_at: row.created_at,
    };
  });

  return c.json({ success: true, data });
});

/**
 * 获取单个战斗配置
 * GET /api/admin/monster-groups/:id
 */
monsterGroupsRoutes.get('/monster-groups/:id', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未初始化' }, 500);
  const id = c.req.param('id');

  const row = await c.env.DB.prepare('SELECT id, name, created_at FROM monster_groups WHERE id = ?')
    .bind(id)
    .first<any>();
  if (!row) return c.json({ error: '战斗配置不存在' }, 404);

  const members = (await loadGroupMembers(c.env.DB, id)).map(memberDto);
  const refs = await loadGroupNpcRefs(c.env.DB, id);

  return c.json({
    success: true,
    data: {
      id: row.id,
      name: row.name,
      members,
      enemyCount: members.length,
      totalHp: members.reduce((sum, m) => sum + m.hp, 0),
      totalCombatPower: members.reduce((sum, m) => sum + memberCombatPower(m), 0),
      referencedNpcs: refs.map((r) => ({ id: r.id, name: r.name, scene_id: r.scene_id })),
      created_at: row.created_at,
    },
  });
});

/**
 * 新建战斗配置
 * POST /api/admin/monster-groups
 * body: { id?, name, members: [{ slot_index, template_id, level, position, is_boss, hp_override... }] }
 */
monsterGroupsRoutes.post('/monster-groups', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未初始化' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  if (!name) return c.json({ error: '战斗配置名称不能为空' }, 400);

  let id = String(body.id || '').trim();
  if (!id) id = `group_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const existing = await c.env.DB.prepare('SELECT id FROM monster_groups WHERE id = ?').bind(id).first();
  if (existing) return c.json({ error: `战斗配置标识 [${id}] 已存在` }, 400);

  const rawMembers = Array.isArray(body.members) ? body.members : [];
  const templateMap = await loadTemplateMap(c.env.DB, rawMembers.map((m: any) => String(m?.template_id || '')));
  const normalized = normalizeMemberInputs(rawMembers, templateMap);
  if (normalized.error || !normalized.members) return c.json({ error: normalized.error }, 400);

  const createdBy = String(c.get('adminUser')?.username || 'admin');
  const instancePlan = await prepareGroupMemberInstances(c.env.DB, id, normalized.members, createdBy);
  const dtos = instancePlan.prepared.map((m) =>
    memberDto({
      ...m.template,
      ...m,
      // 模板品质/成长与槽位品质分开传递，避免 spread 顺序把模板品质覆盖成 null
      template_quality: m.template.quality,
      template_growth_template: m.template.growth_template,
      template_bonus_json: m.template.bonus_json,
      quality: m.quality,
      instance_realm: m.realm,
      template_name: m.template.name,
      template_avatar: m.template.avatar,
      npc_instance_id: m.npc_instance_id,
    })
  );
  // enemies_json 仅作为审计快照保留；战斗属性以 monster_group_members 为准
  const enemiesJson = JSON.stringify(dtos.map((m) => ({
    id: m.template_id,
    name: m.template_name,
    avatar: m.template_avatar,
    position: m.position,
    slotIndex: m.slot_index,
    isBoss: m.is_boss,
    quality: m.quality,
    realm: m.realm,
    hp: m.hp,
    maxHp: m.hp,
    mp: m.mp,
    maxMp: m.mp,
    attack: m.attack,
    matk: m.matk,
    defense: m.defense,
    mdef: m.mdef,
    speed: m.speed,
    critRate: m.crit,
  })));

  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare('INSERT INTO monster_groups (id, name, enemies_json, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)')
      .bind(id, name, enemiesJson),
    ...instancePlan.statements,
  ];
  for (const m of instancePlan.prepared) {
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO monster_group_members
          (group_id, slot_index, npc_instance_id, level, position, is_boss, quality,
           hp_override, mp_override, attack_override, defense_override, speed_override)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id, m.slot_index, m.npc_instance_id, m.level, m.position, m.is_boss, m.quality,
        m.hp_override, m.mp_override, m.attack_override, m.defense_override, m.speed_override
      )
    );
  }
  statements.push(instancePlan.cleanup);
  await c.env.DB.batch(statements);

  return c.json({
    success: true,
    message: `战斗配置 [${name}] 创建成功`,
    data: { id, name, members: dtos },
  });
});

/**
 * 更新战斗配置
 * PUT /api/admin/monster-groups/:id
 */
monsterGroupsRoutes.put('/monster-groups/:id', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未初始化' }, 500);
  const id = c.req.param('id') || '';

  const existing = await c.env.DB.prepare('SELECT id FROM monster_groups WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ error: '战斗配置不存在' }, 404);

  const body = await c.req.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  if (!name) return c.json({ error: '战斗配置名称不能为空' }, 400);

  const rawMembers = Array.isArray(body.members) ? body.members : [];
  const templateMap = await loadTemplateMap(c.env.DB, rawMembers.map((m: any) => String(m?.template_id || '')));
  const normalized = normalizeMemberInputs(rawMembers, templateMap);
  if (normalized.error || !normalized.members) return c.json({ error: normalized.error }, 400);

  const createdBy = String(c.get('adminUser')?.username || 'admin');
  const instancePlan = await prepareGroupMemberInstances(c.env.DB, id, normalized.members, createdBy);
  const dtos = instancePlan.prepared.map((m) =>
    memberDto({
      ...m.template,
      ...m,
      // 模板品质/成长与槽位品质分开传递，避免 spread 顺序把模板品质覆盖成 null
      template_quality: m.template.quality,
      template_growth_template: m.template.growth_template,
      template_bonus_json: m.template.bonus_json,
      quality: m.quality,
      instance_realm: m.realm,
      template_name: m.template.name,
      template_avatar: m.template.avatar,
      npc_instance_id: m.npc_instance_id,
    })
  );
  // enemies_json 仅作为审计快照保留；战斗属性以 monster_group_members 为准
  const enemiesJson = JSON.stringify(dtos.map((m) => ({
    id: m.template_id,
    name: m.template_name,
    avatar: m.template_avatar,
    position: m.position,
    slotIndex: m.slot_index,
    isBoss: m.is_boss,
    quality: m.quality,
    realm: m.realm,
    hp: m.hp,
    maxHp: m.hp,
    mp: m.mp,
    maxMp: m.mp,
    attack: m.attack,
    matk: m.matk,
    defense: m.defense,
    mdef: m.mdef,
    speed: m.speed,
    critRate: m.crit,
  })));

  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare('UPDATE monster_groups SET name = ?, enemies_json = ? WHERE id = ?').bind(name, enemiesJson, id),
    c.env.DB.prepare('DELETE FROM monster_group_members WHERE group_id = ?').bind(id),
    ...instancePlan.statements,
  ];
  for (const m of instancePlan.prepared) {
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO monster_group_members
          (group_id, slot_index, npc_instance_id, level, position, is_boss, quality,
           hp_override, mp_override, attack_override, defense_override, speed_override)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id, m.slot_index, m.npc_instance_id, m.level, m.position, m.is_boss, m.quality,
        m.hp_override, m.mp_override, m.attack_override, m.defense_override, m.speed_override
      )
    );
  }
  statements.push(instancePlan.cleanup);
  await c.env.DB.batch(statements);

  return c.json({
    success: true,
    message: `战斗配置 [${name}] 更新成功`,
    data: { id, name, members: dtos },
  });
});

/**
 * 删除战斗配置（被地图 NPC 实例引用时阻断）
 * DELETE /api/admin/monster-groups/:id
 */
monsterGroupsRoutes.delete('/monster-groups/:id', async (c) => {
  if (!c.env.DB) return c.json({ error: '数据库未初始化' }, 500);
  const id = c.req.param('id');

  const refs = await loadGroupNpcRefs(c.env.DB, id);
  if (refs.length > 0) {
    const names = refs.map((r) => `【${r.name}】(${r.scene_id})`).join('、');
    return c.json({ error: `无法删除：该战斗配置正被地图 NPC ${names} 引用，请先解绑` }, 400);
  }

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM monster_groups WHERE id = ?').bind(id),
    c.env.DB.prepare(
      `DELETE FROM npc_instances
       WHERE instance_type = 'BATTLE' AND source = 'MONSTER_GROUP' AND source_ref = ?`
    ).bind(id),
  ]);
  return c.json({ success: true, message: '战斗配置已删除' });
});

