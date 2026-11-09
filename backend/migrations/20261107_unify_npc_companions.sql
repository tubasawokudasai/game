-- ==============================================================================
-- 迁移: NPC 模板 / 实例 / 伙伴 / 战斗槽位结构收敛
--
-- 目标:
--   1. companion_templates 删除：任何 NPC 模板都可以进入玩家队伍；
--      npc_templates 增加 role / realm / level / sort_order，
--      party_members.member_key 改为具体 npc_instances.npc_id。
--   2. npcs 合并进 npc_instances：
--      地图 NPC 的身份字段、模板绑定、战斗配置统一落在一张表。
--   3. npc_instances 成为"所有从模板创建出来的 NPC 实例"的唯一记录表：
--      WORLD(地图驻留) / PLAYER(玩家拥有) / BATTLE(战斗槽位) / MAIL(待领取)
--   4. monster_group_members 改为通过 npc_instance_id 关联 npc_instances。
--
-- 执行:
--   npx wrangler d1 execute game_d1_prod --local  --file=migrations/20261107_unify_npc_companions.sql
--   npx wrangler d1 execute game_d1_prod --remote --file=migrations/20261107_unify_npc_companions.sql
--
-- 注意:
--   - 本迁移会重建 npc_instances / monster_group_members / npc_dialogue_routers，
--     并 DROP npcs、companion_templates。
--   - SQLite 不支持 ADD COLUMN IF NOT EXISTS，请只执行一次。
--   - 新库直接执行 schema.sql 即可，无需本迁移。
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. npc_templates 增加玩家侧入队字段
-- ------------------------------------------------------------------------------
ALTER TABLE npc_templates ADD COLUMN role TEXT NOT NULL DEFAULT 'DPS';
ALTER TABLE npc_templates ADD COLUMN realm TEXT;
ALTER TABLE npc_templates ADD COLUMN level INTEGER NOT NULL DEFAULT 1;
ALTER TABLE npc_templates ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- ------------------------------------------------------------------------------
-- 2. companion_templates 并入 npc_templates
-- ------------------------------------------------------------------------------
INSERT OR IGNORE INTO npc_templates (
    id, key, name, title, badge, avatar, idle_avatar, attack_avatar,
    base_hp, base_mp, base_attack, base_defense, base_speed,
    skills_json, description, role, realm, level, sort_order
)
SELECT
    c.member_key,
    REPLACE(REPLACE(c.member_key, 'npc_', ''), '_001', ''),
    c.name,
    COALESCE(c.title, ''),
    '',
    COALESCE(c.avatar, ''),
    COALESCE(c.combat_idle_avatar, c.avatar, ''),
    COALESCE(c.combat_attack_avatar, c.combat_idle_avatar, c.avatar, ''),
    COALESCE(c.base_hp, 12000),
    COALESCE(c.base_mp, 300),
    COALESCE(c.base_attack, 2800),
    COALESCE(c.base_defense, 1500),
    COALESCE(c.base_speed, 120),
    '[]',
    '由 companion_templates 迁移的角色模板',
    COALESCE(c.role, 'DPS'),
    c.realm,
    COALESCE(c.level, 1),
    COALESCE(c.sort_order, 0)
FROM companion_templates c
WHERE NOT EXISTS (
    SELECT 1 FROM npc_templates t WHERE t.name = c.name
);

UPDATE npc_templates
SET
    role = COALESCE((SELECT c.role FROM companion_templates c WHERE c.name = npc_templates.name), role),
    realm = COALESCE((SELECT c.realm FROM companion_templates c WHERE c.name = npc_templates.name), realm),
    level = COALESCE((SELECT c.level FROM companion_templates c WHERE c.name = npc_templates.name), level),
    sort_order = COALESCE((SELECT c.sort_order FROM companion_templates c WHERE c.name = npc_templates.name), sort_order),
    updated_at = CURRENT_TIMESTAMP
WHERE EXISTS (
    SELECT 1 FROM companion_templates c WHERE c.name = npc_templates.name
);

-- ------------------------------------------------------------------------------
-- 3. party_members.member_key 先统一为 npc_templates.id
-- ------------------------------------------------------------------------------
UPDATE party_members
SET
    member_key = COALESCE((
        SELECT t.id
        FROM companion_templates c
        JOIN npc_templates t ON t.name = c.name
        WHERE c.member_key = party_members.member_key
        LIMIT 1
    ), member_key),
    member_name = COALESCE((
        SELECT t.name
        FROM companion_templates c
        JOIN npc_templates t ON t.name = c.name
        WHERE c.member_key = party_members.member_key
        LIMIT 1
    ), member_name),
    title = COALESCE((
        SELECT t.title FROM companion_templates c JOIN npc_templates t ON t.name = c.name
        WHERE c.member_key = party_members.member_key LIMIT 1
    ), title),
    avatar = COALESCE((
        SELECT t.avatar FROM companion_templates c JOIN npc_templates t ON t.name = c.name
        WHERE c.member_key = party_members.member_key LIMIT 1
    ), avatar),
    role = COALESCE((
        SELECT t.role FROM companion_templates c JOIN npc_templates t ON t.name = c.name
        WHERE c.member_key = party_members.member_key LIMIT 1
    ), role),
    realm = COALESCE((
        SELECT t.realm FROM companion_templates c JOIN npc_templates t ON t.name = c.name
        WHERE c.member_key = party_members.member_key LIMIT 1
    ), realm),
    updated_at = CURRENT_TIMESTAMP;

UPDATE party_members SET id = player_id || ':' || member_key;

-- ------------------------------------------------------------------------------
-- 4. 保证每个旧 npcs 都有模板和旧 npc_instances 记录（合并前兜底）
-- ------------------------------------------------------------------------------
INSERT OR IGNORE INTO npc_templates (
    id, key, name, title, badge, avatar,
    base_hp, base_mp, base_attack, base_defense, base_speed,
    skills_json, description
)
SELECT
    'tpl_' || key, key, name, title, COALESCE(badge, ''), COALESCE(avatar, ''),
    10000, 200, 1500, 800, 100, '[]', '由既有地图 NPC 自动补全的模板'
FROM npcs;

INSERT OR IGNORE INTO npc_instances (npc_id, template_id)
SELECT id, 'tpl_' || key FROM npcs;

-- ------------------------------------------------------------------------------
-- 5. 构建新 npc_instances（WORLD + BATTLE 实例）
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS npc_instances_merged;
CREATE TABLE npc_instances_merged (
    npc_id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    instance_type TEXT NOT NULL DEFAULT 'WORLD',
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    scene_id TEXT,
    key TEXT,
    name TEXT NOT NULL,
    badge TEXT DEFAULT '',
    title TEXT NOT NULL,
    avatar TEXT,
    type TEXT NOT NULL DEFAULT 'dialogue',
    quote TEXT DEFAULT '',
    gossip TEXT DEFAULT '',
    owner_player_id TEXT,
    created_by TEXT NOT NULL DEFAULT 'SYSTEM',
    source TEXT NOT NULL DEFAULT 'WORLD',
    source_ref TEXT,
    battle_group_id TEXT DEFAULT NULL,
    battle_level INTEGER NOT NULL DEFAULT 1,
    battle_reward_json TEXT NOT NULL DEFAULT '{}',
    respawn_seconds INTEGER NOT NULL DEFAULT 0,
    once_flag TEXT DEFAULT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
    FOREIGN KEY (template_id) REFERENCES npc_templates(id) ON DELETE RESTRICT,
    FOREIGN KEY (battle_group_id) REFERENCES monster_groups(id) ON DELETE SET NULL,
    FOREIGN KEY (owner_player_id) REFERENCES players(id) ON DELETE CASCADE
);

-- 5.1 地图 WORLD 实例：npcs + 旧 npc_instances 合并
INSERT INTO npc_instances_merged (
    npc_id, template_id, instance_type, status, scene_id, key, name, badge, title,
    avatar, type, quote, gossip, owner_player_id, created_by, source, source_ref,
    battle_group_id, battle_level, battle_reward_json, respawn_seconds, once_flag,
    level, created_at, updated_at
)
SELECT
    n.id,
    CASE
      WHEN i.template_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM npc_templates t WHERE t.id = i.template_id)
      THEN i.template_id
      ELSE 'tpl_' || n.key
    END,
    'WORLD', 'ACTIVE', n.scene_id, n.key, n.name, COALESCE(n.badge, ''), n.title,
    n.avatar, COALESCE(n.type, 'dialogue'), COALESCE(n.quote, ''), COALESCE(n.gossip, ''),
    NULL, 'SYSTEM', 'WORLD', NULL,
    CASE
      WHEN i.battle_group_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM monster_groups g WHERE g.id = i.battle_group_id)
      THEN i.battle_group_id
      ELSE NULL
    END,
    COALESCE(i.battle_level, 1), COALESCE(i.battle_reward_json, '{}'),
    COALESCE(i.respawn_seconds, 0), i.once_flag,
    1, COALESCE(n.created_at, CURRENT_TIMESTAMP), COALESCE(n.updated_at, CURRENT_TIMESTAMP)
FROM npcs n
LEFT JOIN npc_instances i ON i.npc_id = n.id;

-- 5.2 战斗槽位 BATTLE 实例：每个 monster_group_members 槽位一条实例
INSERT INTO npc_instances_merged (
    npc_id, template_id, instance_type, status, scene_id, key, name, badge, title,
    avatar, type, quote, gossip, owner_player_id, created_by, source, source_ref,
    battle_group_id, battle_level, battle_reward_json, respawn_seconds, once_flag,
    level
)
SELECT
    'npcinst_battle_' || m.group_id || '_' || m.slot_index,
    m.template_id, 'BATTLE', 'ACTIVE', NULL, NULL,
    t.name, COALESCE(t.badge, ''), COALESCE(t.title, ''),
    t.avatar, 'battle', '', '',
    NULL, 'SYSTEM', 'MONSTER_GROUP', m.group_id,
    NULL, 1, '{}', 0, NULL,
    COALESCE(m.level, 1)
FROM monster_group_members m
JOIN npc_templates t ON t.id = m.template_id;

-- ------------------------------------------------------------------------------
-- 6. 切换 npc_instances，并重建 monster_group_members 关联实例
-- ------------------------------------------------------------------------------
ALTER TABLE npc_instances RENAME TO npc_instances_legacy;
ALTER TABLE npc_instances_merged RENAME TO npc_instances;

-- 旧 npc_instances 改名后仍占用这两个索引名，先释放再为合并表建索引
DROP INDEX IF EXISTS idx_npc_instances_template;
DROP INDEX IF EXISTS idx_npc_instances_group;

CREATE UNIQUE INDEX idx_npc_instances_world_key ON npc_instances(key)
    WHERE key IS NOT NULL AND instance_type = 'WORLD';
CREATE INDEX idx_npc_instances_scene ON npc_instances(scene_id, type);
CREATE INDEX idx_npc_instances_template ON npc_instances(template_id);
CREATE INDEX idx_npc_instances_group ON npc_instances(battle_group_id);
CREATE INDEX idx_npc_instances_owner ON npc_instances(owner_player_id, status);
CREATE INDEX idx_npc_instances_source ON npc_instances(source, status);

DROP TABLE IF EXISTS monster_group_members_new;
CREATE TABLE monster_group_members_new (
    group_id TEXT NOT NULL,
    slot_index INTEGER NOT NULL,
    npc_instance_id TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    position TEXT NOT NULL DEFAULT 'FRONT',
    is_boss INTEGER NOT NULL DEFAULT 0,
    hp_override INTEGER DEFAULT NULL,
    mp_override INTEGER DEFAULT NULL,
    attack_override INTEGER DEFAULT NULL,
    defense_override INTEGER DEFAULT NULL,
    speed_override INTEGER DEFAULT NULL,
    PRIMARY KEY (group_id, slot_index),
    FOREIGN KEY (group_id) REFERENCES monster_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (npc_instance_id) REFERENCES npc_instances(npc_id) ON DELETE CASCADE
);

INSERT INTO monster_group_members_new (
    group_id, slot_index, npc_instance_id, level, position, is_boss,
    hp_override, mp_override, attack_override, defense_override, speed_override
)
SELECT
    m.group_id, m.slot_index,
    'npcinst_battle_' || m.group_id || '_' || m.slot_index,
    m.level, m.position, m.is_boss,
    m.hp_override, m.mp_override, m.attack_override, m.defense_override, m.speed_override
FROM monster_group_members m
WHERE EXISTS (
    SELECT 1 FROM npc_instances i
    WHERE i.npc_id = 'npcinst_battle_' || m.group_id || '_' || m.slot_index
);

DROP TABLE monster_group_members;
ALTER TABLE monster_group_members_new RENAME TO monster_group_members;
CREATE INDEX idx_monster_group_members_instance ON monster_group_members(npc_instance_id);

-- ------------------------------------------------------------------------------
-- 7. 现有 party_members 每条记录生成一条 PLAYER 实例
-- ------------------------------------------------------------------------------
INSERT INTO npc_instances (
    npc_id, template_id, instance_type, status, scene_id, key, name, badge, title,
    avatar, type, quote, gossip, owner_player_id, created_by, source, source_ref,
    battle_group_id, battle_level, battle_reward_json, respawn_seconds, once_flag,
    level
)
SELECT
    'npcinst_party_' || REPLACE(p.id, ':', '_'),
    t.id, 'PLAYER', 'ACTIVE', NULL, NULL,
    COALESCE(p.member_name, t.name), COALESCE(t.badge, ''), COALESCE(p.title, t.title, ''),
    COALESCE(p.avatar, t.avatar), 'companion', '', '',
    p.player_id, 'MIGRATION', 'MIGRATION', NULL,
    NULL, 1, '{}', 0, NULL,
    COALESCE(p.level, t.level, 1)
FROM party_members p
JOIN npc_templates t ON t.id = p.member_key OR t.key = p.member_key
WHERE NOT EXISTS (
    SELECT 1 FROM npc_instances i
    WHERE i.npc_id = 'npcinst_party_' || REPLACE(p.id, ':', '_')
);

UPDATE party_members
SET member_key = 'npcinst_party_' || REPLACE(id, ':', '_')
WHERE EXISTS (
    SELECT 1 FROM npc_instances i
    WHERE i.npc_id = 'npcinst_party_' || REPLACE(party_members.id, ':', '_')
);

UPDATE party_members SET id = player_id || ':' || member_key;

-- ------------------------------------------------------------------------------
-- 8. 重建 npc_dialogue_routers（去掉对 npcs 的物理外键）
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS npc_dialogue_routers_new;
CREATE TABLE npc_dialogue_routers_new (
    id TEXT PRIMARY KEY,
    npc_id TEXT NOT NULL,
    priority INTEGER DEFAULT 0,
    root_node_id TEXT NOT NULL,
    conditions_json TEXT DEFAULT '[]',
    description TEXT
);

INSERT INTO npc_dialogue_routers_new (id, npc_id, priority, root_node_id, conditions_json, description)
SELECT id, npc_id, priority, root_node_id, conditions_json, description FROM npc_dialogue_routers;

DROP TABLE npc_dialogue_routers;
ALTER TABLE npc_dialogue_routers_new RENAME TO npc_dialogue_routers;
CREATE INDEX idx_npc_dialogue_routers_priority ON npc_dialogue_routers(npc_id, priority DESC);

-- ------------------------------------------------------------------------------
-- 9. 清理旧表
-- ------------------------------------------------------------------------------
DROP TABLE npc_instances_legacy;
DROP TABLE npcs;
DROP TABLE companion_templates;

-- ------------------------------------------------------------------------------
-- 10. 剧情 JOIN_PARTY 的 memberKey 从旧伙伴键改为 npc_templates.id
-- ------------------------------------------------------------------------------
UPDATE dialogue_options
SET actions_json = REPLACE(
    REPLACE(
        REPLACE(actions_json, '"npc_cangyun_001"', '"tpl_cangyun"'),
        '"npc_luoqinghan_001"', '"tpl_luoqinghan"'
    ),
    '"npc_suningxiang_001"', '"tpl_suningxiang"'
)
WHERE actions_json LIKE '%"JOIN_PARTY"%';
