-- ==============================================================================
-- 迁移：NPC 模板库 + 地图实例 + 战斗配置槽位
--
-- 设计：
--   npc_templates          可复用的 NPC / 怪物模板
--   npc_instances          地图 NPC 实例（模板 + 战斗配置 + 等级/奖励/重生）
--   monster_group_members  战斗配置的 1~4 个槽位，每个槽位是模板实例（可定制等级/属性）
--   player_encounter_state 玩家击杀/冷却状态
--
-- 本迁移只新增表与数据，不改 npcs 结构，可在旧库上重复执行。
-- 全新库请直接执行 schema.sql（已包含同样的表与种子）。
-- ==============================================================================

-- 1. NPC 模板库
CREATE TABLE IF NOT EXISTS npc_templates (
    id TEXT PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    badge TEXT NOT NULL DEFAULT '',
    avatar TEXT NOT NULL DEFAULT '',
    idle_avatar TEXT NOT NULL DEFAULT '',
    attack_avatar TEXT NOT NULL DEFAULT '',
    base_hp INTEGER NOT NULL DEFAULT 10000,
    base_mp INTEGER NOT NULL DEFAULT 200,
    base_attack INTEGER NOT NULL DEFAULT 1500,
    base_defense INTEGER NOT NULL DEFAULT 800,
    base_speed INTEGER NOT NULL DEFAULT 100,
    skills_json TEXT NOT NULL DEFAULT '[]',
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. 战斗配置头（旧库可能已有 monster_groups）
CREATE TABLE IF NOT EXISTS monster_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    enemies_json TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. 地图 NPC 实例
CREATE TABLE IF NOT EXISTS npc_instances (
    npc_id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    battle_group_id TEXT DEFAULT NULL,
    battle_level INTEGER NOT NULL DEFAULT 1,
    battle_reward_json TEXT NOT NULL DEFAULT '{}',
    respawn_seconds INTEGER NOT NULL DEFAULT 0,
    once_flag TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (npc_id) REFERENCES npcs(id) ON DELETE CASCADE,
    FOREIGN KEY (template_id) REFERENCES npc_templates(id) ON DELETE RESTRICT,
    FOREIGN KEY (battle_group_id) REFERENCES monster_groups(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_npc_instances_template ON npc_instances(template_id);
CREATE INDEX IF NOT EXISTS idx_npc_instances_group ON npc_instances(battle_group_id);

-- 4. 战斗配置槽位
CREATE TABLE IF NOT EXISTS monster_group_members (
    group_id TEXT NOT NULL,
    slot_index INTEGER NOT NULL,
    template_id TEXT NOT NULL,
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
    FOREIGN KEY (template_id) REFERENCES npc_templates(id) ON DELETE RESTRICT
);

-- 5. 玩家遭遇状态
CREATE TABLE IF NOT EXISTS player_encounter_state (
    player_id TEXT NOT NULL,
    npc_id TEXT NOT NULL,
    defeat_count INTEGER NOT NULL DEFAULT 0,
    last_defeat_at INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (player_id, npc_id)
);
CREATE INDEX IF NOT EXISTS idx_encounter_player ON player_encounter_state(player_id);

-- 6. 奖励道具补种（旧库可能缺少）
INSERT OR IGNORE INTO item_templates (id, name, type, quality, description) VALUES
('item_juqi_dan', '聚气丹', 'CONSUMABLE', 'COMMON', '聚引周遭灵气入体，助益练气破阶。'),
('item_zhuji_dan', '筑基丹', 'CONSUMABLE', 'RARE', '破境筑基之丹，服之可固本培元。'),
('item_jindan_yuye', '金丹玉液', 'CONSUMABLE', 'EPIC', '金丹期修士淬炼之玉液，蕴含浩荡纯阳真力。'),
('item_shangpin_lingshi', '上品灵石', 'MATERIAL', 'EPIC', '通体晶莹剔透的高纯度灵石，灵气纯澈沛然。'),
('item_hantie_ore', '寒铁精矿', 'MATERIAL', 'RARE', '极北苦寒之地所凝玄铁精魄，铸剑绝佳灵材。');

-- 7. 既有场景 NPC 生成模板与实例
INSERT OR IGNORE INTO npc_templates (
    id, key, name, title, badge, avatar,
    base_hp, base_mp, base_attack, base_defense, base_speed, skills_json, description
)
SELECT
    'tpl_' || key, key, name, title, COALESCE(badge, ''), COALESCE(avatar, ''),
    10000, 200, 1500, 800, 100, '[]', '由既有场景 NPC 自动生成的模板'
FROM npcs;

-- 8. 战斗首领模板
INSERT INTO npc_templates
    (id, key, name, title, badge, avatar, idle_avatar, attack_avatar,
     base_hp, base_mp, base_attack, base_defense, base_speed, skills_json, description)
VALUES
('tpl_jianwuhen', 'jianwuhen', '剑无痕', '独孤剑痴', '剑痴', '', '', '', 12000, 400, 1600, 900, 120, '[]', '演武校场剑道魁首'),
('tpl_tuobalie', 'tuobalie', '拓跋烈', '霸刀门主', '门主', '', '', '', 14000, 300, 1800, 1000, 110, '[]', '霸刀门当代门主'),
('tpl_changle_guard', 'changle_guard', '长乐统领', '都城宿卫', '宿卫', '', '', '', 16000, 400, 1900, 1200, 105, '[]', '长乐都城禁军统领'),
('tpl_qingyun_jiankui', 'qingyun_jiankui', '玄剑傀儡', '青云试炼剑灵', '剑灵', '', '', '', 18000, 500, 2100, 1300, 130, '[]', '青云灵山试炼剑傀')
ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    title = excluded.title,
    badge = excluded.badge,
    base_hp = excluded.base_hp,
    base_mp = excluded.base_mp,
    base_attack = excluded.base_attack,
    base_defense = excluded.base_defense,
    base_speed = excluded.base_speed,
    description = excluded.description,
    updated_at = CURRENT_TIMESTAMP;

UPDATE npc_templates SET avatar = (SELECT avatar FROM npcs WHERE npcs.key = npc_templates.key)
WHERE id IN ('tpl_jianwuhen', 'tpl_tuobalie', 'tpl_changle_guard', 'tpl_qingyun_jiankui');

-- 9. 战斗随从 / 野怪模板
INSERT INTO npc_templates
    (id, key, name, title, badge, avatar, idle_avatar, attack_avatar,
     base_hp, base_mp, base_attack, base_defense, base_speed, skills_json, description)
VALUES
('tpl_jianshi_a', 'jianshi_a', '剑侍甲', '演武剑侍', '', '/assets/combat/characters/hero_shieldman_trans.png', '', '', 5000, 200, 800, 500, 110, '[]', '演武剑阵前排剑侍'),
('tpl_jianshi_b', 'jianshi_b', '剑侍乙', '演武剑侍', '', '/assets/combat/characters/enemy_cultist_trans.png', '', '', 4800, 200, 850, 480, 115, '[]', '演武剑阵后排剑侍'),
('tpl_kuangdao_a', 'kuangdao_a', '霸刀门徒', '霸刀门弟子', '', '/assets/combat/characters/hero_shieldman_trans.png', '', '', 6000, 200, 1000, 600, 105, '[]', '霸刀门横练弟子'),
('tpl_kuangdao_b', 'kuangdao_b', '霸刀门徒·狂', '霸刀门弟子', '', '/assets/combat/characters/enemy_cultist_trans.png', '', '', 5500, 200, 1100, 550, 115, '[]', '霸刀门狂化弟子'),
('tpl_suwei_a', 'suwei_a', '长乐宿卫', '都城禁军', '', '/assets/combat/characters/hero_shieldman_trans.png', '', '', 7000, 200, 1100, 800, 100, '[]', '长乐都城宿卫'),
('tpl_suwei_b', 'suwei_b', '长乐宿卫·弩', '都城禁军', '', '/assets/combat/characters/enemy_cultist_trans.png', '', '', 6000, 200, 1200, 700, 110, '[]', '长乐都城弩手'),
('tpl_jianling_a', 'jianling_a', '剑灵·青', '青云剑灵', '', '/assets/combat/characters/enemy_firefox_trans.png', '', '', 6500, 300, 1300, 700, 130, '[]', '青云试炼青锋剑灵'),
('tpl_jianling_b', 'jianling_b', '剑灵·玄', '青云剑灵', '', '/assets/combat/characters/enemy_cultist_trans.png', '', '', 6200, 300, 1400, 650, 135, '[]', '青云试炼玄锋剑灵'),
('tpl_nether_guard', 'nether_guard', '幽冥守卫', '血炼阵眼', 'Boss', '/assets/combat/characters/hero_shieldman_trans.png', '', '', 12000, 200, 1400, 1700, 95, '[]', '幽冥死气凝成的阵眼肉盾'),
('tpl_nether_firefox', 'nether_firefox', '山野妖灵', '幽冥妖灵', '', '/assets/combat/characters/enemy_firefox_trans.png', '', '', 8000, 180, 1800, 700, 140, '[]', '被死气侵蚀的山野妖灵'),
('tpl_nether_cultist', 'nether_cultist', '邪化修士', '魔道散修', '', '/assets/combat/characters/enemy_cultist_trans.png', '', '', 11000, 500, 2200, 900, 120, '[]', '受幽冥死气侵蚀的邪修')
ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    title = excluded.title,
    avatar = excluded.avatar,
    base_hp = excluded.base_hp,
    base_mp = excluded.base_mp,
    base_attack = excluded.base_attack,
    base_defense = excluded.base_defense,
    base_speed = excluded.base_speed,
    description = excluded.description,
    updated_at = CURRENT_TIMESTAMP;

-- 10. 战斗配置
INSERT OR IGNORE INTO monster_groups (id, name, enemies_json) VALUES
('npc_jianwuhen', '演武剑阵', '[]'),
('npc_tuobalie', '霸刀横刀阵', '[]'),
('npc_changle_guard', '长乐宿卫阵', '[]'),
('npc_qingyun_jiankui', '青云试炼剑阵', '[]');

-- 11. 战斗配置槽位
INSERT INTO monster_group_members
    (group_id, slot_index, template_id, level, position, is_boss,
     hp_override, mp_override, attack_override, defense_override, speed_override)
VALUES
('npc_jianwuhen', 0, 'tpl_jianwuhen', 15, 'FRONT', 1, NULL, NULL, NULL, NULL, NULL),
('npc_jianwuhen', 1, 'tpl_jianshi_a', 12, 'FRONT', 0, NULL, NULL, NULL, NULL, NULL),
('npc_jianwuhen', 2, 'tpl_jianshi_b', 12, 'BACK', 0, NULL, NULL, NULL, NULL, NULL),
('npc_tuobalie', 0, 'tpl_tuobalie', 20, 'FRONT', 1, NULL, NULL, NULL, NULL, NULL),
('npc_tuobalie', 1, 'tpl_kuangdao_a', 16, 'FRONT', 0, NULL, NULL, NULL, NULL, NULL),
('npc_tuobalie', 2, 'tpl_kuangdao_b', 16, 'BACK', 0, NULL, NULL, NULL, NULL, NULL),
('npc_changle_guard', 0, 'tpl_changle_guard', 25, 'FRONT', 1, NULL, NULL, NULL, NULL, NULL),
('npc_changle_guard', 1, 'tpl_suwei_a', 20, 'FRONT', 0, NULL, NULL, NULL, NULL, NULL),
('npc_changle_guard', 2, 'tpl_suwei_b', 20, 'BACK', 0, NULL, NULL, NULL, NULL, NULL),
('npc_qingyun_jiankui', 0, 'tpl_qingyun_jiankui', 30, 'FRONT', 1, NULL, NULL, NULL, NULL, NULL),
('npc_qingyun_jiankui', 1, 'tpl_jianling_a', 25, 'FRONT', 0, NULL, NULL, NULL, NULL, NULL),
('npc_qingyun_jiankui', 2, 'tpl_jianling_b', 25, 'BACK', 0, NULL, NULL, NULL, NULL, NULL),
('nether_01', 0, 'tpl_nether_guard', 15, 'FRONT', 1, NULL, NULL, NULL, NULL, NULL),
('nether_01', 1, 'tpl_nether_firefox', 12, 'FRONT', 0, NULL, NULL, NULL, NULL, NULL),
('nether_01', 2, 'tpl_nether_cultist', 14, 'BACK', 0, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT(group_id, slot_index) DO UPDATE SET
    template_id = excluded.template_id,
    level = excluded.level,
    position = excluded.position,
    is_boss = excluded.is_boss,
    hp_override = excluded.hp_override,
    mp_override = excluded.mp_override,
    attack_override = excluded.attack_override,
    defense_override = excluded.defense_override,
    speed_override = excluded.speed_override;

-- 12. 地图 NPC 实例
INSERT OR IGNORE INTO npc_instances
    (npc_id, template_id, battle_group_id, battle_level, battle_reward_json, respawn_seconds, once_flag)
SELECT id, 'tpl_' || key, NULL, 1, '{}', 0, NULL FROM npcs;

UPDATE npc_instances SET
    battle_group_id = 'npc_jianwuhen',
    battle_level = 15,
    battle_reward_json = '{"exp":800,"gold":500,"items":[{"id":"item_juqi_dan","name":"聚气丹","count":2}]}',
    respawn_seconds = 60,
    updated_at = CURRENT_TIMESTAMP
WHERE npc_id = 'npc_jianwuhen_001';

UPDATE npc_instances SET
    battle_group_id = 'npc_tuobalie',
    battle_level = 20,
    battle_reward_json = '{"exp":1200,"gold":800,"items":[{"id":"item_zhuji_dan","name":"筑基丹","count":1}]}',
    respawn_seconds = 120,
    updated_at = CURRENT_TIMESTAMP
WHERE npc_id = 'npc_tuobalie_001';

UPDATE npc_instances SET
    battle_group_id = 'npc_changle_guard',
    battle_level = 25,
    battle_reward_json = '{"exp":1800,"gold":1200,"items":[{"id":"item_zhuji_dan","name":"筑基丹","count":2}]}',
    respawn_seconds = 180,
    updated_at = CURRENT_TIMESTAMP
WHERE npc_id = 'npc_changle_guard_001';

UPDATE npc_instances SET
    battle_group_id = 'npc_qingyun_jiankui',
    battle_level = 30,
    battle_reward_json = '{"exp":2500,"gold":2000,"items":[{"id":"item_jindan_yuye","name":"金丹玉液","count":1}]}',
    respawn_seconds = 300,
    updated_at = CURRENT_TIMESTAMP
WHERE npc_id = 'npc_qingyun_jiankui_001';
