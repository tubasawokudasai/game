-- ------------------------------------------------------------------------------
-- 仙友系统：好友关系与结交申请表
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS friends (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    friend_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    FOREIGN KEY (friend_id) REFERENCES players(id) ON DELETE CASCADE,
    UNIQUE(player_id, friend_id)
);

CREATE INDEX IF NOT EXISTS idx_friends_player ON friends(player_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend ON friends(friend_id);

CREATE TABLE IF NOT EXISTS friend_requests (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, ACCEPTED, REJECTED
    mail_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES players(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES players(id) ON DELETE CASCADE,
    UNIQUE(sender_id, receiver_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver ON friend_requests(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_friend_requests_sender ON friend_requests(sender_id, status);
