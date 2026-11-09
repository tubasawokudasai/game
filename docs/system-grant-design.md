# 系统发放（邮件附件）与 NPC 实例台账设计说明

## 1. 相关表

| 表 | 作用 | 关键字段 |
| --- | --- | --- |
| `inventory` | 玩家背包/装备实例 | `player_id`, `item_id`, `count`, `quality`, `is_equipped` |
| `item_templates` | 道具模版（名称/品类/品阶唯一真源） | `id`, `name`, `type`, `quality` |
| `npc_templates` | 所有 NPC / 角色模板（含入队字段） | `id`, `key`, `name`, `role`, `realm`, `level`, `base_hp` … |
| `npc_instances` | **所有从模板创建出来的 NPC 实例台账** | `npc_id`, `template_id`, `instance_type`, `status`, `owner_player_id`, `created_by`, `source` |
| `party_members` | 玩家拥有的角色名册 | `member_key` → `npc_instances.npc_id`, `is_active` |
| `monster_group_members` | 战斗配置槽位 | `npc_instance_id` → `npc_instances.npc_id` |
| `mails` | 邮件主表 | `mail_type='SYSTEM'`, `has_attachment` |
| `mail_attachments` | 邮件附件 | `grant_type`, `grant_payload` |

`companion_templates` 已删除；任何 `npc_templates` 模板都可以进入玩家队伍。
`npcs` 已并入 `npc_instances`，地图 NPC 的身份字段与战斗配置同表保存。

## 2. NPC 实例分类

`npc_instances.instance_type`：

| 类型 | 含义 | 典型来源 |
| --- | --- | --- |
| `WORLD` | 地图场景驻留 NPC | 地图初始化 / 后台场景 NPC 管理 |
| `PLAYER` | 玩家拥有的角色实例 | 邮件领取 / 剧情 `JOIN_PARTY` |
| `BATTLE` | 战斗配置槽位实例 | 后台保存 `monster_group_members` 时自动创建 |
| `MAIL` | 系统邮件已发放、待领取 | 后台系统发放角色 |

归属与审计字段：

- `owner_player_id`：属于哪位玩家；`WORLD` / `BATTLE` 为 `NULL`
- `created_by`：发放者/创建者（admin 用户名、`SYSTEM`、`DIALOGUE`）
- `source`：`WORLD` / `MAIL_GRANT` / `DIALOGUE_JOIN` / `MONSTER_GROUP` / `MIGRATION`
- `source_ref`：邮件 ID、战斗配置 ID 等来源引用
- `status`：`ACTIVE` / `PENDING` / `MERGED` / `DISABLED`

## 3. 系统发放角色流程

```text
后台「系统发放」选择 npc_templates 模板
        ↓ POST /api/admin/grants/send
1. 写入 mails + mail_attachments
2. 为每个收件人创建一条 npc_instances:
   instance_type = MAIL
   status        = PENDING
   owner_player_id = 收件玩家
   created_by    = 当前管理员
   source        = MAIL_GRANT
   source_ref    = mailId
   template_id   = 选择的 NPC 模板
3. mail_attachments.grant_payload 记录 npcInstanceId
        ↓
玩家游戏内邮箱点击「领取附件」
        ↓ POST /api/mails/claim/:mailId
1. npc_instances: MAIL/PENDING -> PLAYER/ACTIVE
2. 若玩家已拥有同模板 ACTIVE 实例：
   已有实例升级，本次实例标记 status = MERGED
3. 否则写入 party_members:
   member_key = npcInstanceId
   is_active  = 0（休息，不自动出战）
        ↓ D1 batch 原子提交
```

### 领取行为

| 类型 | 领取行为 |
| --- | --- |
| `ITEM` | 向 `inventory` 插入道具，`count` 为发放数量 |
| `COMPANION` | 激活对应的 `npc_instances`，写入 `party_members`，默认休息；同模板已拥有则只升等级并把新实例标记 `MERGED` |
| `CURRENCY` | 累加 `players.silver / ingot / copper` |

## 4. 邮件附件数据模型

`mail_attachments` 使用 `grant_type` + `grant_payload`：

```json
// COMPANION
{
  "templateId": "tpl_cangyun",
  "memberKey": "tpl_cangyun",
  "npcInstanceId": "npcinst_mail_xxx",
  "grantedBy": "admin",
  "name": "苍云剑客",
  "level": 80,
  "realm": "化神初期",
  "snapshot": { "name": "苍云剑客", "title": "苍云剑宗 · 剑修", "role": "DPS" }
}
```

旧邮件如果没有 `npcInstanceId`，领取时会补建一条 `PLAYER` 实例，再写入队伍，保证实例台账不缺口。

## 5. 后台接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/admin/grants/catalog` | 道具库、`npc_templates` 模板、支持的发放类型 |
| `POST` | `/api/admin/grants/send` | 创建系统发放邮件 + 角色实例 |
| `GET` | `/api/admin/npc-instances` | NPC 实例台账（按类型/状态/来源/归属玩家筛选） |
| `PATCH` | `/api/admin/npc-instances/:id` | 修改实例名称/等级/状态 |
| `DELETE` | `/api/admin/npc-instances/:id` | 删除非地图实例 |
| `GET` | `/api/mails` | 玩家收件箱（含类型化附件摘要） |
| `POST` | `/api/mails/claim/:mailId` | 玩家领取附件 |

后台页面：

- `/npc-instances`：NPC 实例管理，查看归属玩家、发放者、来源、状态。
- `/grants`：系统发放，选择道具 / NPC 模板 / 货币。

## 6. 扩展新发放类型

1. `grantService.ts` 扩展 `GrantType` / `GrantInput`；
2. `schemas.ts` 增加 Zod 分支；
3. `resolveGrant()` 增加发送前校验与快照；
4. `claimMailAttachmentsTx()` 增加领取落库；
5. 后台 `SystemGrant.tsx` 增加表单分支。

如果新类型也需要"实体实例"（如灵宠、坐骑），应复用 `npc_instances` 的实例台账思路，或新增对应的实例表，而不是把状态直接写进模板表。

## 7. 迁移

```bash
# 结构收敛（已执行于本地库；线上部署前执行一次）
npx wrangler d1 execute game_d1_prod --local  --file=migrations/20261107_unify_npc_companions.sql
npx wrangler d1 execute game_d1_prod --remote --file=migrations/20261107_unify_npc_companions.sql

# 系统发放附件字段
npx wrangler d1 execute game_d1_prod --local  --file=migrations/20261107_system_grants.sql
npx wrangler d1 execute game_d1_prod --remote --file=migrations/20261107_system_grants.sql
```

## 8. 已验证链路

1. 后台发放角色：`npc_instances` 立即出现 `MAIL/PENDING`，记录 `owner_player_id` 与 `created_by`。
2. 玩家领取：实例变为 `PLAYER/ACTIVE`，`party_members.member_key = npcInstanceId`，默认休息。
3. 重复发放同模板：已有实例等级提升，新实例标记 `MERGED`。
4. 后台保存战斗配置：每个槽位自动生成 `BATTLE` 实例，`monster_group_members.npc_instance_id` 正确关联。
5. 战斗准备接口：敌方单位 ID 为 `npc_instance_id`，属性来自实例对应模板。
6. 玩家出战队伍：`party_members` → `npc_instances` → `npc_templates` 正确取到战斗立绘与属性。
7. 剧情 `JOIN_PARTY`：按模板创建 `PLAYER` 实例，幂等避免重复入队。
