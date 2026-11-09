-- ==============================================================================
-- 迁移: 药品管理数据表与初始仙丹名品 (medicines)
-- 包含药品名称、品质、悬壶馆售价、药效数值、风物描述与在售状态
-- ==============================================================================

CREATE TABLE IF NOT EXISTS medicines (
    id TEXT PRIMARY KEY,                           -- 药品唯一标识 (如: item_healing_dan)
    name TEXT NOT NULL,                            -- 药品名称 (如: 回春金疮散)
    quality TEXT NOT NULL DEFAULT 'COMMON',        -- 药品品阶 (COMMON / RARE / EPIC / LEGENDARY / MYTHIC)
    type TEXT NOT NULL DEFAULT 'CONSUMABLE',       -- 药品类别 (CONSUMABLE)
    price_copper INTEGER NOT NULL DEFAULT 100,     -- 悬壶馆售价 (铜钱)
    effect_desc TEXT NOT NULL DEFAULT '',          -- 药效详细说明
    description TEXT NOT NULL DEFAULT '',          -- 风物典故 / 背景简介
    icon TEXT NOT NULL DEFAULT 'medication',       -- 图标标识 (medication, healing, flare, spa, science, etc.)
    hp_restore INTEGER NOT NULL DEFAULT 0,         -- 服用瞬回气血值
    mp_restore INTEGER NOT NULL DEFAULT 0,         -- 服用瞬回真气值
    exp_restore INTEGER NOT NULL DEFAULT 0,        -- 服用增加修为值
    max_hp_bonus INTEGER NOT NULL DEFAULT 0,       -- 永久增加气血上限
    max_mp_bonus INTEGER NOT NULL DEFAULT 0,       -- 永久增加内力上限
    status INTEGER NOT NULL DEFAULT 1,             -- 状态: 1=在售/启用, 0=下架/停用
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 初始化标准仙丹药品数据
INSERT OR REPLACE INTO medicines (id, name, quality, type, price_copper, effect_desc, description, icon, hp_restore, mp_restore, exp_restore, max_hp_bonus, max_mp_bonus, status) VALUES
('item_healing_dan', '回春金疮散', 'COMMON', 'CONSUMABLE', 100, '服用迅速恢复 3,000 点气血', '百花谷秘制金疮圣药，可迅速止血愈伤，调养体魄恢复充沛气血。', 'healing', 3000, 0, 0, 0, 0, 1),
('item_juqi_dan', '聚气丹', 'COMMON', 'CONSUMABLE', 120, '服用恢复 500 点真气与 300 点修为', '聚引周遭灵气入体，助益练气破阶。', 'spa', 0, 500, 300, 0, 0, 1),
('item_zhuji_dan', '筑基丹', 'RARE', 'CONSUMABLE', 800, '服用恢复 5,000 气血、2,000 真气与 2,000 修为', '破境筑基之丹，服之可固本培元。', 'science', 5000, 2000, 2000, 0, 0, 1),
('item_tianjie_jinchuang', '天阶金创药', 'EPIC', 'CONSUMABLE', 600, '服用瞬间恢复 12,000 点气血并平复内伤', '悬壶馆药王秘炼天阶金创圣药，肉白骨活死人。', 'medication', 12000, 0, 0, 0, 0, 1),
('item_xisui_dan', '洗髓丹', 'LEGENDARY', 'CONSUMABLE', 3000, '永久增加 1,000 气血上限与 500 内力上限，全状态回满 + 15,000 修为', '脱胎换骨之无上灵丹，洗经伐髓。', 'flare', 99999, 99999, 15000, 1000, 500, 1),
('item_jindan_yuye', '金丹玉液', 'EPIC', 'CONSUMABLE', 2000, '金丹期修士淬炼之玉液，蕴含浩荡纯阳真力，状态完全补满并获得 10,000 修为。', '金丹期修士淬炼之玉液，蕴含浩荡纯阳真力。', 'water_drop', 99999, 99999, 10000, 0, 0, 1);

-- 确保 item_templates 也同步记录相应道具
INSERT OR REPLACE INTO item_templates (id, name, type, quality, description) VALUES
('item_healing_dan', '回春金疮散', 'CONSUMABLE', 'COMMON', '百花谷秘制金疮圣药，可迅速止血愈伤，调养体魄恢复充沛气血。'),
('item_juqi_dan', '聚气丹', 'CONSUMABLE', 'COMMON', '聚引周遭灵气入体，助益练气破阶。'),
('item_zhuji_dan', '筑基丹', 'CONSUMABLE', 'RARE', '破境筑基之丹，服之可固本培元。'),
('item_tianjie_jinchuang', '天阶金创药', 'CONSUMABLE', 'EPIC', '悬壶馆药王秘炼天阶金创圣药，肉白骨活死人。'),
('item_xisui_dan', '洗髓丹', 'CONSUMABLE', 'LEGENDARY', '脱胎换骨之无上灵丹，洗经伐髓。'),
('item_jindan_yuye', '金丹玉液', 'CONSUMABLE', 'EPIC', '金丹期修士淬炼之玉液，蕴含浩荡纯阳真力。');
