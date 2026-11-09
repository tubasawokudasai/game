# 地图 NPC · 单人遭遇（免战斗配置）设计

> 目标：在「放置地图 NPC」里支持**只放一个 NPC 就能打**，不必先去战斗配置里拼 1~4 人的战阵。
> 核心约定：**战斗型 NPC 的 `battle_group_id` 为空 = 单人遭遇**，该 NPC 自己的模板就是唯一敌人。

---

## 一、为什么不是「再造一张表」

现状里一场地图遭遇的敌阵来自：

```
npc_instances(type=battle, battle_group_id)
  → monster_groups
  → monster_group_members(1~4 槽)
  → npc_instances(instance_type=BATTLE) + npc_templates
```

也就是说，战斗配置（`monster_groups`）是**多敌编队**的容器；如果只有一名敌人，这层容器没有任何信息增量，只是逼管理员多点两下。

所以单人遭遇不落新表、不落隐藏战阵，只把「没有战阵」从**错误配置**升级为**一等语义**：

| `type` | `battle_group_id` | 语义 | 敌方阵容 |
| --- | --- | --- | --- |
| `battle` | 有值 | 多人战阵 | `monster_group_members` 1~4 人 |
| `battle` | `NULL` | **单人遭遇** | 该 NPC 的 `template_id` 1 人 |
| `dialogue` | `NULL` | 对话人物 | 无 |

好处：

- 零迁移，老数据里的「战斗型 + 未绑战阵」从「不可挑战」自动变成「可单挑」，不再需要人工补配置；
- 战斗引擎、地图接口、前端遭遇弹窗继续共用一条数据链，没有第二套单体战斗实现；
- 管理员后续想升级成多敌战阵，只要在同一个弹窗里切到「多人战阵」并选配置即可。

---

## 二、后端设计

### 2.1 统一的敌阵解析入口

新增 `loadEncounterEnemies(db, npc)`（[combatDb.ts](../backend/src/db/combatDb.ts)）：

```ts
if (isSoloEncounter(npc)) return loadSoloEncounterEnemy(db, npc); // 自身模板
return loadMonsterGroup(db, npc.battle_group_id, overrides);      // 多敌战阵
```

- `isSoloEncounter(npc)`：`type === 'battle' && !battle_group_id`；
- `loadSoloEncounterEnemy`：读取 `npc_instances + npc_templates`，按实例品质/境界/加成 + 模板成长走
  `calculateNpcAttributesFromRows`，生成 1 名 `FRONT` 敌人，`slotIndex = 0`；
- **等级**：优先 `battle_member_levels["0"]`（兼容老数据），否则用 `battle_level`；
  多人战阵仍走槽位等级覆盖表。

`prepareEncounterCombat` / `preparePveEncounter` / `settleEncounterCombat` 三条入口全部改为调用
`prepareNpcEncounterCombat → loadEncounterEnemies`，不再直接拿 `npc.battle_group_id` 去查战阵。

### 2.2 资格校验

`validateEncounterEligibility` 的拦截条件由

```ts
if (npc.type !== 'battle' || !npc.battle_group_id) throw ...
```

改为

```ts
if (npc.type !== 'battle' || (!npc.battle_group_id && !npc.template_id)) throw ...
```

即：有模板就能单挑；只有「战斗型但连模板都没有」的脏数据才继续拦截。

### 2.3 地图接口

`GET /api/map/:mapId`（[mapRoutes.ts](../backend/src/routes/mapRoutes.ts)）：

- 战阵预览按 `groupId + battle_member_levels` 缓存，同一战阵不同等级覆盖不会互相串；
- 单人遭遇直接生成 1 条 `enemyPreview`，因此前端「阵容未配置」的判断条件可以退化为
  `enemyPreview.length > 0`；
- NPC 输出新增 `battleMode: 'SOLO' | 'GROUP'`，`battleGroupName` 仅战阵模式下发。

### 2.4 后台保存

`POST/PUT /api/admin/npcs`（[adminRoutes.ts](../backend/src/routes/adminRoutes.ts)）：

- 战斗型不再强制要求 `battle_group_id`：传了才校验战阵是否存在，不传即单人遭遇；
- `PUT` 用「字段是否出现」区分「沿用原战阵」与「显式清空转单人」——`battle_group_id: null` 会真正落成 `NULL`；
- 单人遭遇时 `battle_member_levels` 统一存 `{}`，避免残留槽位等级；
- 列表接口补 `battle_mode`，单人的 `enemyCount = 1`、`enemyNames = [NPC 名]`，后台徽章不再显示「未绑组」。

---

## 三、后台交互设计

「放置地图 NPC → 战斗遭遇」下新增**遭遇模式**二选一：

- **单人遭遇（默认）**：不出现战斗配置下拉；展示「唯一对手」卡片（当前 NPC 模板立绘/姓名/称号/前排/Lv），
  只填「遭遇等级（同时用于战斗）」；
- **多人战阵**：保留原战斗配置下拉 + 逐槽位等级覆盖面板。

奖励（经验/铜钱/纹银/掉落）、重生冷却、一次性击败标记在两种模式下**完全共用**同一组字段。

切换模式时：

- 已有 NPC 按 `battle_group_id` 是否为空回显模式；
- 单人 → 战阵：必须选一套配置才能保存；
- 战阵 → 单人：提交 `battle_group_id: null`，后端清空战阵与槽位等级。

---

## 四、玩家端表现

- 遭遇弹窗的「可挑战」判定改为 `enemyPreview.length > 0`，不再依赖 `battleGroupId`；
- 单人遭遇在阵容栏右侧显示「单人强敌」，多人战阵仍显示「战队: xxx」；
- 战斗演出/结算逻辑不变：单人敌人 `isActionActive = true`，天然成为镜头焦点。

---

## 五、后续可扩展

1. **单人对手换模板**：目前单人敌人固定用被放置 NPC 的模板；若需要「一个 NPC 外表、另一套战斗数值」，
   可加 `npc_instances.solo_enemy_template_id`，`loadSoloEncounterEnemy` 优先读它。
2. **单人站位**：目前固定前排；如需后排法师型单人，可加 `solo_position` 列。
3. **战阵降级为单人**：删除战阵时若仍有 NPC 引用，可把引用方自动转为单人（当前是删除保护，不做自动转换）。
