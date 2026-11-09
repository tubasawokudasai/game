# 通知管理 · 玩家升级通知设计说明

## 1. 目标与边界

- 后台新增「通知管理 → 玩家升级通知」页面；
- 玩家每次升级时，按后台配置：
  - 发送即时通知（复用现有 WebSocket `NOTICE:TOAST` 与前端 Toast）；
  - 可选附带发放内容：道具 / 角色 / 货币（复用现有系统邮件与附件领取链路）。
- 不重复实现道具库、邮件、附件领取逻辑；
- 只实现 `PLAYER_LEVEL_UP` 一个事件，不扩展其他通知事件。

## 2. 数据模型

迁移：`backend/migrations/20261107_player_level_notification.sql`

### notification_configs

| 字段 | 说明 |
|---|---|
| `event_code` | 事件编码，当前固定 `PLAYER_LEVEL_UP` |
| `enabled` | 是否启用 |
| `title` / `content` | 即时通知标题 / 内容，支持已注册变量 |
| `reward_items_json` | 发放内容 JSON（列名沿用历史命名，支持道具 / 角色 / 货币） |
| `updated_by` / `updated_at` | 审计信息 |

默认配置：

```json
{
  "enabled": true,
  "title": "恭喜升级！",
  "content": "恭喜少侠 {playerName}，成功提升至 Lv.{newLevel}！",
  "grants": []
}
```

发放内容 `grants` 与系统发放（`grantService`）共用同一套类型：

```json
[
  { "type": "ITEM", "itemId": "item_yuanbao", "quantity": 10 },
  { "type": "COMPANION", "memberKey": "tpl_cangyun", "level": 5, "realm": "金丹中期" },
  { "type": "CURRENCY", "silver": 500, "ingot": 2, "copper": 30 }
]
```

历史数据 `[{ "itemId": "...", "quantity": 1 }]` 没有 `type` 字段，读取时自动按 `ITEM` 兼容。

### level_up_events（Outbox）

每次等级变化写入一条事件：

- `event_id`：`lvlup_{playerId}_{newLevel}`，同时作为奖励邮件幂等键；
- `UNIQUE(player_id, new_level)`：同一玩家同一等级只允许一条事件；
- `status`：`PENDING / PROCESSING / PROCESSED`；
- `notification_sent`：即时通知是否已成功投递（送达后立即落库，重试不重复弹窗）；
- `mail_id`：已创建的奖励邮件 ID；
- `attempts / last_error / locked_at`：重试与排障信息。

## 3. 升级事件接入

`backend/src/services/experience/experienceService.ts`

- 升级 UPDATE 与升级事件插入在同一个 D1 batch 中提交；
- 事件插入使用递归 CTE 批量生成连续等级，并带条件：

```sql
WHERE EXISTS (
  SELECT 1 FROM players
  WHERE id = ? AND level = ? AND exp = ?
)
```

- 乐观锁失败（`changes = 0`）时不会写入假事件；
- 未升级（只加经验）不会触发；
- 连续升级 N 级会写入 N 条事件，每级独立处理；
- 升级失败不触发事件。

## 4. 通知与奖励处理

`backend/src/services/levelUpNotificationService.ts`

处理单条事件：

1. 条件 UPDATE 抢占事件（`PENDING → PROCESSING`），避免同一事件被并发处理；
2. 读取 `notification_configs`：
   - 未启用：直接标记 `PROCESSED`，不发通知、不发奖、不建邮件；
   - 已启用：仅替换 `{playerName}` / `{oldLevel}` / `{newLevel}` 三个已注册变量；
3. 通过现有 `ZONE_DO.sendTo` 下发 `NOTICE:TOAST`；
4. 若 `grants` 非空，按类型映射为 `sendSystemGrantMails` 的发放参数，创建系统奖励邮件；
5. 邮件附件写入 `mail_attachments`，**不直接修改玩家背包 / 名册 / 钱庄**；
6. 邮件失败时事件回退 `PENDING`，角色升级不回滚，等待队列/下次升级重试。

## 5. 幂等保证

1. `level_up_events` 的 `UNIQUE(player_id, new_level)` 防止同一级重复建事件；
2. 事件处理前用条件 UPDATE 抢占，避免重复消费；
3. `sendSystemGrantMails` 支持 `idempotencyKey`：
   - 邮件 ID、附件 ID 确定性生成；
   - 使用 `INSERT OR IGNORE`，重复处理不会重复创建邮件/附件；
4. `notification_sent` 记录即时通知已送达，重试时不重复弹 Toast；
5. 已 `PROCESSED` 的事件再次处理会直接跳过。

## 6. 可靠异步

- Outbox 事件先落库，再尝试同步处理；
- 同步处理失败时，把待处理事件投递到现有 `GAME_EVENT_QUEUE`；
- `backend/src/index.ts` 的队列消费者按事件 ID 重试 `processLevelUpEvents`；
- 队列重试同样受幂等约束，不会重复发奖；
- 战斗 PvE 在 Durable Object 内结算时关闭 WS 直推，改用现有战斗 Toast 展示后台文案，避免 DO 自请求。

## 7. 后台接口

所有接口复用 `adminAuthMiddleware`：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/admin/notifications` | 通知事件列表（一级页面） |
| GET | `/api/admin/notifications/player-level-up` | 读取玩家升级配置、固定规则、可用变量、默认值 |
| PUT | `/api/admin/notifications/player-level-up` | 保存玩家升级配置 |
| POST | `/api/admin/notifications/player-level-up/reset` | 恢复玩家升级默认配置 |

后台页面结构：

- 一级：`/notifications` 通知事件列表，按事件展示启用状态、发放内容数量、最近更新与配置入口；
- 二级：`/notifications/player-level-up` 玩家升级通知配置页；
- 侧边栏「通知管理」展开后显示「玩家升级通知」子菜单。

保存时后端重新校验：

- 标题/内容非空；
- 最多 20 项发放内容；
- 道具：必须存在于 `item_templates`，数量为正整数（1–99999），同一道具不允许重复；
- 角色：必须存在于 `npc_templates`（id 或 key），等级 1–9999，境界不超过 64 字；
- 货币：纹银 / 元宝 / 铜钱均为非负整数，且至少填写一种（单项上限 999999999）；
- 空白发放项（未选道具 / 未选角色 / 货币全为 0）不会保存。

## 8. 前端即时通知

- 后台一级列表页见 `admin/src/pages/NotificationManager.tsx`，二级配置页见 `admin/src/pages/PlayerLevelUpNotification.tsx`；
- 发放内容编辑器复用系统发放页抽离出的 `admin/src/components/GrantContentEditor.tsx`：
  - 系统发放页 `/grants` 与玩家升级通知页均使用全部类型（道具 / 角色 / 货币）；
  - 玩家升级通知设置 `minItems={0}` 允许空发放内容、`preventDuplicateItems` 防止重复道具；
- 复用 `frontend/src/components/Toast.tsx`；
- `App.tsx` 将 Toast 改为队列，连续升级多条通知逐条展示；
- `NOTICE:TOAST` 支持可选 `title` 字段；
- 展示后台配置的标题与内容，不占用页面永久空间。

## 9. 部署

```bash
# 本地
yarn --cwd backend d1:player-level-notification:local

# 远程
yarn --cwd backend d1:player-level-notification:remote
```

## 10. 测试

```bash
yarn --cwd backend test
```

新增 `backend/test/levelUpNotification.test.ts`，覆盖：

1. 启用 + 空发放内容：仅即时通知；
2. 启用 + 单个道具：通知 + 奖励邮件 + 领取入包；
3. 启用 + 多个道具：数量与种类正确；
4. 关闭：不发通知、不发奖；
5. 连续升级多级：每级各一次，不漏不重；
6. 道具不存在 / 数量非法 / 重复道具：保存失败；
7. 邮件异常：升级正常完成，事件保留重试，不重复发奖；
8. 修改文案：新通知使用最新配置；
9. 恢复默认：默认状态、文案与空发放内容；
10. 邮件已创建但事件状态未写回：重试复用确定性邮件，不重复发奖；
11. 角色发放：领取后进入同道名册并保持休息；
12. 货币发放：领取后纹银 / 元宝 / 铜钱直接入钱庄；
13. 混合发放（道具 + 角色 + 货币）与非法配置校验；
14. 历史 `reward_items_json` 兼容：旧条目按道具发放读取。
