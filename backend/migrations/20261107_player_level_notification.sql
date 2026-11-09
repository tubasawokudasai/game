-- ==============================================================================
-- 通知管理 · 玩家升级通知
--
-- 1. notification_configs：通知规则配置（当前仅 PLAYER_LEVEL_UP 一个事件）
-- 2. level_up_events：升级事件 Outbox，作为通知/奖励邮件的幂等依据
--
-- 设计说明：
-- - 复用现有邮件与附件发放链路（grantService / mail_attachments），不新建道具发放系统。
-- - 每个玩家每提升一级只允许一条事件（UNIQUE(player_id, new_level)），
--   事件 ID 同时用于奖励邮件 ID 的幂等键，避免重复发奖。
-- ==============================================================================

CREATE TABLE IF NOT EXISTS notification_configs (
    event_code TEXT PRIMARY KEY,                   -- 事件编码，如 PLAYER_LEVEL_UP
    enabled INTEGER NOT NULL DEFAULT 1,            -- 是否启用: 0/1
    title TEXT NOT NULL,                          -- 通知标题（支持已注册动态变量）
    content TEXT NOT NULL,                        -- 通知内容（支持已注册动态变量）
    reward_items_json TEXT NOT NULL DEFAULT '[]', -- 发放内容 JSON（道具 / 角色 / 货币；旧格式自动兼容）
    updated_by TEXT,                              -- 最后修改管理员
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO notification_configs
    (event_code, enabled, title, content, reward_items_json, updated_by)
VALUES
    (
        'PLAYER_LEVEL_UP',
        1,
        '恭喜升级！',
        '恭喜少侠 {playerName}，成功提升至 Lv.{newLevel}！',
        '[]',
        'SYSTEM'
    );

CREATE TABLE IF NOT EXISTS level_up_events (
    event_id TEXT PRIMARY KEY,                    -- 事件唯一 ID（同时作为奖励邮件幂等键）
    player_id TEXT NOT NULL,                      -- 升级玩家 ID
    player_name TEXT NOT NULL,                    -- 升级玩家名称快照
    old_level INTEGER NOT NULL,                   -- 升级前等级
    new_level INTEGER NOT NULL,                   -- 升级后等级
    status TEXT NOT NULL DEFAULT 'PENDING',       -- PENDING / PROCESSING / PROCESSED
    attempts INTEGER NOT NULL DEFAULT 0,          -- 处理尝试次数（用于排查与重试）
    notification_sent INTEGER NOT NULL DEFAULT 0, -- 即时通知是否已成功投递到长连接
    mail_id TEXT,                                 -- 已创建的奖励邮件 ID
    last_error TEXT,                              -- 最近一次处理失败原因
    locked_at TIMESTAMP,                          -- 处理锁时间，超时后可被重新领取
    processed_at TIMESTAMP,                       -- 处理完成时间
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, new_level)
);

CREATE INDEX IF NOT EXISTS idx_level_up_events_player
    ON level_up_events(player_id, new_level);

CREATE INDEX IF NOT EXISTS idx_level_up_events_status
    ON level_up_events(status, created_at);
