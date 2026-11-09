> **实现备注（最新）**：当前落地为「NPC 模板库 `npc_templates` → NPC 实例台账 `npc_instances` → 战斗配置槽位 `monster_group_members`」三层模型。`npcs` 已合并进 `npc_instances`；每个从模板创建出来的 NPC（地图驻留、玩家拥有、战斗槽位、邮件待领取）都会在 `npc_instances` 留痕，并通过 `monster_group_members.npc_instance_id` 关联到战斗配置。本文第四节的 `npcs.battle_group_id` 是早期方案，已被 `20261107_unify_npc_companions.sql` 取代。
>
> **单人遭遇补充**：`battle_group_id` 不再是战斗型 NPC 的必需字段。为空时按「单人遭遇」处理，NPC 自身模板即唯一敌人，详见 [npc-solo-encounter-design.md](npc-solo-encounter-design.md)。下文第 4 节「必需」的表述以该补充为准。

# 地图 NPC 遭遇 · 多敌人战斗配置方案

> 目标：后台把一个野怪/遭遇点配到地图上；玩家点击「战斗」后，战斗界面出现的是这一组里的多个敌人（npc1、npc2…），而不是一个。
>
> 结论：战斗引擎已经支持多敌人，缺的是 **地图 NPC ↔ 怪物组的绑定**、**后台配置入口**、**不经对话的直战通道**。

---

## 一、结论先行

现状不是「不能打多个敌人」，而是配置链路没打通：

1. **多敌人阵容已经存在**：`monster_groups.enemies_json` 是数组，战斗画布也有 4 个敌方站位（[BattleCanvas.tsx:7](../frontend/src/features/combat/stage/BattleCanvas.tsx:7)），服务端 `loadMonsterGroup` 会把数组逐个转成战斗单位（[combatDb.ts:287](../backend/src/db/combatDb.ts:287)）。
2. **地图 NPC 与怪物组没有关联**：`npcs` 表没有 `battle_group_id` 之类的字段；已有的 4 个 `type='battle'` NPC（剑无痕、拓跋烈、长乐统领、玄剑傀儡）点进去只会弹默认对话「江湖偶遇」，不会开战（[MainPersonScreen.tsx:95](../frontend/src/pages/MainPersonScreen.tsx:95)）。
3. **后台没有配置入口**：`admin/src/pages` 只有 Dashboard / Player / Map，没有 NPC 管理，也没有怪物组编辑。
4. **野怪没有直战通道**：现有开战只能由对话选项的 `START_COMBAT` action 触发；野怪如果不配对话，玩家点不进去。

所以设计的关键不是「给每个敌人建一个 NPC」，而是把**「地图上的遭遇点」和「战斗里的敌方单位」拆成两层**。

---

## 二、概念模型

```
scenes（地图）
  └─ npcs（地图上的可交互实体：野怪点 / 对话 NPC）     ← 1 个遭遇点
        └─ monster_groups（战斗阵容）                   ← 1 个组
              └─ enemies / members（敌方单位 1..4）      ← N 个战斗单位
```

- 地图上看到的是 **1 个遭遇点**（例如「幽冥守卫」）；
- 点进去战斗是 **1 个阵容**（幽冥守卫 + 山野妖灵 + 邪化修士）；
- **不要**把 npc1 / npc2 作为独立 NPC 塞进地图列表：地图会被战斗单位污染，而且无法表达「这一组一起上」。

命名上建议区分：

| 概念 | 表 | 生命周期 |
|---|---|---|
| 地图交互点 | `npcs` | 随地图配置，玩家可见可点 |
| 战斗单位 | `monster_templates`（第二阶段） | 只存在于战斗，可被多个阵容复用 |
| 战斗阵容 | `monster_groups` + `monster_group_members` | 随副本/遭遇配置 |

---

## 三、现状盘点

| 能力 | 现状 | 位置 |
|---|---|---|
| 多敌人阵容 | ✅ 已支持，`enemies_json` 数组 | [schema.sql:1302](../backend/schema.sql:1302) |
| 战斗站位 | ✅ 4 个敌方槽位（slotIndex 0–3） | [BattleCanvas.tsx:7](../frontend/src/features/combat/stage/BattleCanvas.tsx:7) |
| 服务端战斗结算 | ✅ 整场推演 + 落库 | [combatDb.ts:399](../backend/src/db/combatDb.ts:399) |
| 地图 NPC 列表 | ✅ 按 `scene_id` 查询 | [mapRoutes.ts:159](../backend/src/routes/mapRoutes.ts:159) |
| 战斗型 NPC | ⚠️ 有 4 个，但点击只弹提示 + 默认对话 | [MainPersonScreen.tsx:95](../frontend/src/pages/MainPersonScreen.tsx:95) |
| NPC ↔ 怪物组绑定 | ❌ 无字段 | `npcs` 表 |
| 后台 NPC 管理 | ❌ 无页面 | `admin/src/pages` |
| 后台怪物组管理 | ❌ 无页面 | `admin/src/pages` |
| 野怪直战接口 | ❌ 只能走对话选项 | `dialogue_options.actions_json` |

**结论：战斗引擎不用改，补配置链路即可。**

---

## 四、数据模型

### 4.1 第一阶段：给 npcs 加战斗配置（推荐先落地）

```sql
-- 地图 NPC 直接绑定战斗阵容
ALTER TABLE npcs ADD COLUMN battle_group_id TEXT DEFAULT NULL;              -- 绑定的怪物组（必需）
ALTER TABLE npcs ADD COLUMN battle_level INTEGER NOT NULL DEFAULT 1;        -- 展示等级
ALTER TABLE npcs ADD COLUMN battle_reward_json TEXT NOT NULL DEFAULT '{}';  -- 胜利奖励
ALTER TABLE npcs ADD COLUMN respawn_seconds INTEGER NOT NULL DEFAULT 0;     -- 0=不限制/常驻
ALTER TABLE npcs ADD COLUMN once_flag TEXT DEFAULT NULL;                    -- 一次性击败标记

CREATE INDEX IF NOT EXISTS idx_npcs_battle_group ON npcs(battle_group_id);
```

说明：

- `battle_group_id` 是唯一必需字段，其余可后续迭代；
- SQLite 的 `ALTER TABLE ADD COLUMN` 不能加外键，引用完整性由后台接口校验；
- 现有 4 个 battle NPC 补上这个字段即可开战，不需要改前端类型定义（`type` 已经是动态字符串）。

玩家侧遭遇状态（冷却 / 首杀 / 重复挑战）：

```sql
CREATE TABLE IF NOT EXISTS player_encounter_state (
    player_id TEXT NOT NULL,
    npc_id TEXT NOT NULL,
    defeat_count INTEGER NOT NULL DEFAULT 0,
    last_defeat_at INTEGER,                 -- 毫秒时间戳
    PRIMARY KEY (player_id, npc_id)
);
```

语义：

| 配置 | 行为 |
|---|---|
| `respawn_seconds = 0` | 可无限重复挑战 |
| `respawn_seconds > 0` | 按 `last_defeat_at` 判断冷却，冷却中返回 `canFight=false` |
| `once_flag` 非空 | 写入 `player_dialogue_flags`，打过一次后不再可战 |
| `once_flag` 为空 | 按 `respawn_seconds` 走 |

### 4.2 第二阶段：怪物库 + 阵容成员

现状 `enemies_json` 把「怪物属性」和「阵容」揉在一个 JSON 里：同一个「山野妖灵」出现在 10 个组里就要复制 10 份属性，改数值要改 10 处。内容量上来后拆成：

```sql
-- 怪物模板（可复用）
CREATE TABLE IF NOT EXISTS monster_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    avatar TEXT DEFAULT '',
    idle_avatar TEXT DEFAULT '',
    attack_avatar TEXT DEFAULT '',
    base_hp INTEGER NOT NULL DEFAULT 1000,
    base_mp INTEGER NOT NULL DEFAULT 0,
    base_attack INTEGER NOT NULL DEFAULT 100,
    base_defense INTEGER NOT NULL DEFAULT 50,
    base_speed INTEGER NOT NULL DEFAULT 100,
    skills_json TEXT NOT NULL DEFAULT '[]',
    tags TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 阵容成员（一个组 1..4 个槽位）
CREATE TABLE IF NOT EXISTS monster_group_members (
    group_id TEXT NOT NULL,
    slot_index INTEGER NOT NULL,               -- 0..3，对齐战斗画布
    template_id TEXT NOT NULL,
    position TEXT NOT NULL DEFAULT 'FRONT',    -- FRONT / BACK
    is_boss INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1,
    stat_override_json TEXT NOT NULL DEFAULT '{}',  -- 等级缩放 / 单场特调
    PRIMARY KEY (group_id, slot_index),
    FOREIGN KEY (group_id) REFERENCES monster_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (template_id) REFERENCES monster_templates(id) ON DELETE RESTRICT
);
```

过渡策略：`loadMonsterGroup` 先查 `monster_group_members`，有成员则 JOIN 组装；没有则回退读 `enemies_json`。这样现有 `nether_01` 不用改，新组走新表，后台逐步迁移。**不要一次性删 `enemies_json`**，否则历史战斗配置会丢。

### 4.3 为什么不直接复用 npcs 当战斗单位

- `npcs` 有 `scene_id`，作为战斗单位会变成地图上的独立 NPC，出现在人物列表里；
- 战斗单位需要 `position / slotIndex / isBoss / 等级缩放`，这些字段对地图 NPC 没意义；
- 同一个怪物要在多个阵容复用，`npcs` 行会被迫复制；
- 掉落、技能、AI 都挂在怪物模板上，和地图交互是两套生命周期。

---

## 五、后台怎么配

### 5.1 新增「战斗配置」页 `/monsters`

侧边栏加一项（参考 `AdminLayout.tsx` 的 `navItems`），页面两个 Tab：

**Tab 1 · 怪物组**

- 列表：组名、敌人数、总血量、总战力、被哪些 NPC 引用；
- 编辑器（右侧抽屉）：
  - 组名、备注；
  - 阵容槽 0–3（对齐战斗画布 4 个站位）：
    - 选择怪物模板（第二阶段）或直接填属性（第一阶段）；
    - 名字、立绘（idle / attack）；
    - HP / MP / 攻 / 防 / 速；
    - 位置 `FRONT` / `BACK`、是否 Boss；
    - 等级（第二阶段）；
  - 实时预览：敌方 4 格站位 + 血条，所见即所得；
  - 保存前校验：至少 1 个敌人、`slotIndex` 不重复且在 0–3、名字/属性非空。

**Tab 2 · 怪物库**（第二阶段）

- 模板 CRUD，组编辑器从这里选怪，避免重复填属性。

### 5.2 地图管理里加「NPC 管理」

在 `MapManager` 选中场景后，右侧增加 NPC 面板：

- 列出该场景 NPC：名称 / 类型 / 绑定怪物组 / 是否可战；
- 新建 / 编辑：
  - 基础：`id`、`key`（全局唯一）、名字、称号、立绘、`type`（对话 / 战斗）；
  - 战斗（`type='battle'` 时显示）：
    - 怪物组下拉（显示 `3 个敌人 · 幽冥守卫、山野妖灵、邪化修士`）；
    - 等级、胜利奖励（经验 / 银两 / 道具）、重生秒数、一次性标记；
  - 保存校验：战斗型必须绑组，否则拒绝保存。

### 5.3 配置示例

目标效果：演武校场 `arena` 放一个野怪点，点击后战斗里出现 3 个敌人。

| 表 | 数据 |
|---|---|
| `npcs` | `id=npc_jianwuhen_001`, `scene_id=arena`, `key=jianwuhen`, `type=battle`, `battle_group_id=arena_swords_01` |
| `monster_groups` | `id=arena_swords_01`, `name=演武剑阵` |
| `enemies_json` | `[{剑无痕, slot 0, FRONT, boss}, {剑侍甲, slot 1}, {剑侍乙, slot 2}]` |

玩家在演武校场点【切磋】→ 服务端按 `npcId` 解析出 `arena_swords_01` → 战斗界面出现 3 个敌人。

---

## 六、后端接口

### 6.1 后台 CRUD

```
GET    /api/admin/monster-groups
GET    /api/admin/monster-groups/:id
POST   /api/admin/monster-groups
PUT    /api/admin/monster-groups/:id
DELETE /api/admin/monster-groups/:id        # 被 npc 引用时拒绝

GET    /api/admin/npcs?sceneId=
POST   /api/admin/npcs
PUT    /api/admin/npcs/:id
DELETE /api/admin/npcs/:id

# 第二阶段
GET/POST/PUT/DELETE /api/admin/monster-templates
```

- 全部挂 `adminAuthMiddleware`（[adminRoutes.ts:14](../backend/src/routes/adminRoutes.ts:14)）；
- 入参用 zod 校验（项目已有 `zod`），`enemies_json` 在写入前先 `JSON.parse` 再按 `MonsterTemplate` 校验，避免脏配置进库；
- 返回体统一 `{ success, data }`，与现有 admin 接口风格保持一致。

### 6.2 玩家侧

**地图接口扩展**：`GET /api/map/:mapId` 的 `npcs` 增加：

```ts
interface MapNpcDto {
  id: string;
  key: string;
  name: string;
  title: string;
  avatar: string | null;
  type: 'dialogue' | 'battle' | string;
  battleGroupId?: string;
  battleLevel?: number;
  canFight?: boolean;                        // 冷却 / 一次性校验结果
  enemyPreview?: Array<{                     // 点击前展示阵容
    name: string;
    avatar: string;
    isBoss: boolean;
  }>;
}
```

**直战接口**（关键：客户端只传 `npcId`，不传 `groupId`，防作弊）：

```
POST /api/combat/encounter/prepare   { npcId }
POST /api/combat/encounter/settle    { npcId }
```

服务端流程：

1. 校验 NPC 存在、`type='battle'`、`battle_group_id` 非空；
2. 校验玩家当前 `zone_id / area_id` 与 NPC 的 `scene_id` 一致（防远程调用）；
3. 校验冷却 / 一次性标记；
4. 复用 `prepareCombat` / `settleCombat`；
5. `settle` 时写 `player_encounter_state`、发奖励、置 flag。

对话剧情战保持不变，继续走 `monsterGroupId`（选项由服务端下发，可信）。

---

## 七、前端流程

```
地图 NPC 列表
  → 点击 type=battle 的 NPC
  → EncounterModal（敌方 3 人立绘 + 等级 + 奖励预览）
  → 点【开战】
  → POST /api/combat/encounter/settle { npcId }
  → 复用 handleDialogueCombat 的 startCombat(...)（服务端已算好胜负与战报）
  → 战斗演出 → onFinish 刷新地图 / 奖励提示
```

改动点：

- `MainPersonScreen.handleNpcAction`：`battle` 不再 `onOpenNpc`，改为打开 `EncounterModal`；
- 新增 `EncounterModal` 组件（仿 `CombatView` 的立绘卡片）；
- `gameApi` 增加 `prepareEncounter(npcId)` / `settleEncounter(npcId)`；
- `useCombatStore.startCombat` 无需改动（现有参数够用）。

---

## 八、奖励、重生与一次性

- **奖励**：`battle_reward_json` 形如
  ```json
  {"exp":500,"silver":100,"items":[{"id":"item_x","count":1}]}
  ```
  `settle` 时在事务内发放；发放逻辑可复用 `GIVE_ITEM` / `ADD_EXP_OR_GOLD` 的现有实现（`DialogueEngine` 的 action 执行器）。
- **重生**：`respawn_seconds` + `player_encounter_state.last_defeat_at`；
- **一次性**：`once_flag` 写入 `player_dialogue_flags`，地图接口据此返回 `canFight=false`；
- **世界 Boss**：需要全局重生 / 全服共享血量，用 Durable Object 计时器，不要用 D1 轮询。

---

## 九、实施步骤（建议顺序）

1. **迁移**：`ALTER TABLE npcs` + `player_encounter_state`；给现有 4 个 battle NPC 补组 id（可先建 `arena_swords_01` 演示组）。
2. **后台接口**：`monster-groups` CRUD + `npcs` CRUD + 校验。
3. **后台页面**：`/monsters` 怪物组编辑器（先用表单，不做模板库）；`MapManager` 加 NPC 面板。
4. **玩家接口**：map DTO 扩展 + `encounter/prepare|settle`。
5. **前端**：`EncounterModal` + 直战流程 + 冷却展示。
6. **第二阶段**：`monster_templates` + `monster_group_members` + 迁移脚本，`loadMonsterGroup` 双读兼容。

工作量估算：1–3 约 1.5 天，4–5 约 1 天，第二阶段 1 天。

---

## 十、边界与坑

- **敌方上限 4**：`ENEMY_SLOTS` 只有 4 个，超过 4 个不会渲染；要 5+ 先改画布布局；
- **slotIndex 必须唯一**：现有 loader 用 `find(slotIndex === index)`，重复会导致单位消失；
- **groupId 不能由客户端传**：剧情战可以，野怪直战必须服务端按 `npcId` 解析；
- **D1 无跨语句事务**：奖励发放 + 状态写入要放进 `db.batch()` 或单条 SQL；
- **NPC 删除**：先解绑或禁止删除有战斗记录的 NPC；
- **多波战斗**：后续加 `battle_waves(group_id, wave_index)`，不要在一个组里塞 8 个敌人；
- **多人同屏打同一只野怪**：按玩家实例化（`player_encounter_state`）最省事；要「抢怪」再上 DO；
- **`npcs.key` 全局唯一**：后台新建 NPC 时自动生成 `npc_<scene>_<n>`，避免冲突。

---

## 十一、一句话总结

**一个地图 NPC = 一个遭遇点；一场战斗 = 一个怪物组；一个怪物组 = 1–4 个战斗单位。**

现有 `monster_groups` 已经能装多个敌人，补上 `npcs.battle_group_id` 和后台配置页，再接一条直战接口就能跑通。
