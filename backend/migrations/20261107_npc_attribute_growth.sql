-- ==============================================================================
-- NPC 数值成长系统（数据库唯一真源版）
--
-- 本次不再保留运行时“旧版兼容”分支：
-- 1. 八维基础值、每级成长值、品质全部直接写入 npc_templates；
-- 2. 等级与境界从 npc_templates 移除，改由 npc_instances 保存；
-- 3. 迁移时一次性回填旧数据，计算服务只读数据库字段，不再推导 base × 10%。
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. NPC 模板：补八维、品质、成长字段
-- ------------------------------------------------------------------------------
ALTER TABLE npc_templates ADD COLUMN base_matk INTEGER NOT NULL DEFAULT 0;
ALTER TABLE npc_templates ADD COLUMN base_mdef INTEGER NOT NULL DEFAULT 0;
ALTER TABLE npc_templates ADD COLUMN base_crit REAL NOT NULL DEFAULT 0;
ALTER TABLE npc_templates ADD COLUMN growth_template TEXT DEFAULT NULL;
ALTER TABLE npc_templates ADD COLUMN quality TEXT NOT NULL DEFAULT 'COMMON';
ALTER TABLE npc_templates ADD COLUMN growth_hp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE npc_templates ADD COLUMN growth_mp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE npc_templates ADD COLUMN growth_attack INTEGER NOT NULL DEFAULT 0;
ALTER TABLE npc_templates ADD COLUMN growth_matk INTEGER NOT NULL DEFAULT 0;
ALTER TABLE npc_templates ADD COLUMN growth_defense INTEGER NOT NULL DEFAULT 0;
ALTER TABLE npc_templates ADD COLUMN growth_mdef INTEGER NOT NULL DEFAULT 0;
ALTER TABLE npc_templates ADD COLUMN growth_speed REAL NOT NULL DEFAULT 0;
ALTER TABLE npc_templates ADD COLUMN growth_crit REAL NOT NULL DEFAULT 0;
ALTER TABLE npc_templates ADD COLUMN bonus_json TEXT NOT NULL DEFAULT '{}';

-- 直接把旧五维模板转换为八维直存数据：
-- 法攻/法防沿用物攻/物防，暴击沿用旧引擎 25%；
-- 成长值按基础值 × 10%/级 固化为数据库数值，保证历史战斗数值不变。
UPDATE npc_templates SET
    base_matk = base_attack,
    base_mdef = base_defense,
    base_crit = 0.25,
    growth_hp = CAST(ROUND(base_hp * 0.1) AS INTEGER),
    growth_mp = CAST(ROUND(base_mp * 0.1) AS INTEGER),
    growth_attack = CAST(ROUND(base_attack * 0.1) AS INTEGER),
    growth_matk = CAST(ROUND(base_attack * 0.1) AS INTEGER),
    growth_defense = CAST(ROUND(base_defense * 0.1) AS INTEGER),
    growth_mdef = CAST(ROUND(base_defense * 0.1) AS INTEGER),
    growth_speed = base_speed * 0.1,
    growth_crit = 0;

-- ------------------------------------------------------------------------------
-- 2. NPC 实例：接收模板迁移出来的等级与境界
-- ------------------------------------------------------------------------------
ALTER TABLE npc_instances ADD COLUMN realm TEXT DEFAULT NULL;
ALTER TABLE npc_instances ADD COLUMN quality TEXT DEFAULT NULL;
ALTER TABLE npc_instances ADD COLUMN growth_template TEXT DEFAULT NULL;
ALTER TABLE npc_instances ADD COLUMN bonus_json TEXT NOT NULL DEFAULT '{}';

-- 2.1 境界：优先沿用玩家伙伴记录中的境界，其次继承旧模板境界
UPDATE npc_instances SET realm = (
    SELECT p.realm FROM party_members p
    WHERE p.member_key = npc_instances.npc_id
    LIMIT 1
)
WHERE realm IS NULL;

UPDATE npc_instances SET realm = (
    SELECT t.realm FROM npc_templates t
    WHERE t.id = npc_instances.template_id
)
WHERE realm IS NULL;

-- 2.2 等级：旧模板的默认等级只迁移给尚未设置等级的玩家角色/邮件实例
UPDATE npc_instances SET level = (
    SELECT t.level FROM npc_templates t
    WHERE t.id = npc_instances.template_id
)
WHERE level <= 1
  AND instance_type IN ('PLAYER', 'MAIL')
  AND EXISTS (
      SELECT 1 FROM npc_templates t
      WHERE t.id = npc_instances.template_id AND t.level > 1
  );

-- ------------------------------------------------------------------------------
-- 3. 战斗配置槽位：支持单槽位品质覆盖
-- ------------------------------------------------------------------------------
ALTER TABLE monster_group_members ADD COLUMN quality TEXT DEFAULT NULL;

-- ------------------------------------------------------------------------------
-- 4. 模板不再保存默认等级 / 境界
-- ------------------------------------------------------------------------------
ALTER TABLE npc_templates DROP COLUMN realm;
ALTER TABLE npc_templates DROP COLUMN level;

-- ==============================================================================
-- 迁移完成后：
-- - 所有 npc_templates 都有显式 base_matk/base_mdef/base_crit/growth_*；
-- - 所有等级从 npc_instances.level / monster_group_members.level / party_members.level 读取；
-- - 所有境界从 npc_instances.realm / party_members.realm 读取；
-- - 运行时不再存在旧版成长兼容分支。
-- ==============================================================================
