-- ==============================================================================
-- 迁移: 乾坤行囊核心道具与风物志模版补充 (item_templates)
-- 包含装备、药品、材料、符箓以及拓展功法类型
-- ==============================================================================

INSERT OR IGNORE INTO item_templates (id, name, type, quality, description) VALUES
('item_healing_dan', '回春金疮散', 'CONSUMABLE', 'COMMON', '百花谷秘制金疮圣药，可迅速止血愈伤，调养体魄恢复充沛气血。'),
('item_sword_steel', '寒光玄铁剑', 'EQUIPMENT', 'RARE', '采极北玄铁所铸利刃，剑锋掠寒芒，锋锐逼人。'),
('item_teleport_rune', '神行符', 'SPECIAL', 'RARE', '缩地成寸灵符，撕碎后可瞬息御风而行，免耗盘缠。'),
('item_scroll_taiyi', '太乙心经残卷', 'SKILL_BOOK', 'EPIC', '上古玄门太乙真经残页，参悟可略窥天道玄奥，大幅提升修仙领悟。');
