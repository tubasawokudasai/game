-- ==============================================================================
-- 迁移：剧情节点地图、玩家剧情进度、节点触发器与剧情通知配置
-- ==============================================================================

-- 1. 对话节点扩展：节点发生地图 + 进入/完成触发器
ALTER TABLE dialogue_nodes ADD COLUMN scene_id TEXT DEFAULT NULL;
ALTER TABLE dialogue_nodes ADD COLUMN on_enter_actions_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE dialogue_nodes ADD COLUMN on_complete_actions_json TEXT NOT NULL DEFAULT '[]';
CREATE INDEX IF NOT EXISTS idx_dialogue_nodes_scene ON dialogue_nodes(scene_id);

-- 2. 玩家剧情进度：每套剧本记录当前节点
CREATE TABLE IF NOT EXISTS player_story_progress (
    player_id TEXT NOT NULL,
    package_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE / COMPLETED
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (player_id, package_id)
);
CREATE INDEX IF NOT EXISTS idx_player_story_progress_player ON player_story_progress(player_id);
CREATE INDEX IF NOT EXISTS idx_player_story_progress_package ON player_story_progress(package_id);

-- 3. 通知管理接入剧情节点触发器事件
INSERT OR IGNORE INTO notification_configs
    (event_code, enabled, title, content, reward_items_json, updated_by)
VALUES
    (
        'STORY_NODE_TRIGGER',
        1,
        '剧情推进',
        '少侠在【{chapterTitle}】中的抉择，已引动九州风云。',
        '[]',
        'SYSTEM'
    );
