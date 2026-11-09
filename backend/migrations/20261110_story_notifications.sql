-- ==============================================================================
-- 迁移：剧情通知资产化（一套剧本 / 一个节点可配置多条独立通知）
-- ==============================================================================

-- 1. 剧情通知资产表：package_id -> 多条通知
CREATE TABLE IF NOT EXISTS story_notifications (
    id TEXT PRIMARY KEY,
    package_id TEXT NOT NULL,                       -- 所属剧情剧本 (dialogue_packages.id)
    node_id TEXT DEFAULT NULL,                      -- 可选：绑定到具体节点；NULL 为该剧本通用通知
    trigger_event TEXT NOT NULL DEFAULT 'ANY',      -- ENTER / COMPLETE / ANY
    name TEXT NOT NULL,                             -- 后台可读名称，如「洛清寒初识 · 完成通知」
    title TEXT NOT NULL,                            -- 通知标题
    content TEXT NOT NULL,                          -- 通知正文，支持 {playerName} {chapterTitle} {packageName} {nodeId}
    enabled INTEGER NOT NULL DEFAULT 1,
    created_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_story_notifications_package ON story_notifications(package_id);
CREATE INDEX IF NOT EXISTS idx_story_notifications_node ON story_notifications(node_id);

-- 2. 为已有剧本各生成一条默认通知，作为迁移起点
INSERT OR IGNORE INTO story_notifications
    (id, package_id, node_id, trigger_event, name, title, content, enabled, created_by)
SELECT
    'snotif_default_' || p.id,
    p.id,
    NULL,
    'ANY',
    p.name || ' · 默认通知',
    nc.title,
    nc.content,
    nc.enabled,
    'SYSTEM'
FROM dialogue_packages p
JOIN notification_configs nc ON nc.event_code = 'STORY_NODE_TRIGGER'
WHERE EXISTS (SELECT 1 FROM dialogue_nodes dn WHERE dn.package_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM story_notifications sn WHERE sn.package_id = p.id);
