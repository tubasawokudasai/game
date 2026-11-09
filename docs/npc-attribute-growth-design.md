# NPC 数值成长系统设计

> 目标：把 NPC 的八维属性、等级成长、品质倍率、境界加成、装备/永久加成和当前生命状态统一收敛到 **一个配置源 + 一个计算服务**。模板属性、成长值、品质全部以数据库为唯一真源，不再保留运行时旧版推导。

---

## 1. 八维属性

统一使用 `NpcAttributes`（`backend/src/services/npc/attributes/npcAttributeTypes.ts`）：

| Key | 含义 | 说明 |
| --- | --- | --- |
| `hp` | 生命上限 | 最终输出为 `maxHp` |
| `mp` | 内力上限 | 最终输出为 `maxMp` |
| `atk` | 物理攻击 | 对应引擎 `outerAttack` |
| `matk` | 法术攻击 | 对应引擎 `innerAttack` |
| `def` | 物理防御 | 对应引擎 `outerDefense` |
| `mdef` | 法术防御 | 对应引擎 `innerDefense` |
| `spd` | 速度 | 出手顺序 |
| `crit` | 暴击率 | `0~1`，最终夹取到合法范围 |

战斗单位在 `CombatFighter` 上增加**可选**字段 `matk / mdef / critRate / critDmg / level / quality / growthTemplate`。玩家主角等非 NPC 单位仍可使用旧引擎基线；NPC 属性全部由计算服务显式下发。

---

## 2. 成长模板

配置位置：`backend/src/services/npc/attributes/npcAttributeConfig.ts`。

内置四种模板：

- `warrior` 战士型：高气血、高物攻、高物防
- `mage` 法术型：高内力、高法攻、高法防
- `balanced` 均衡型：八维均衡
- `support` 辅助型：高气血、高法防、高内力

每种模板同时配置：

```ts
{
  base: { hp, mp, atk, matk, def, mdef, spd, crit },
  growth: { hp, mp, atk, matk, def, mdef, spd, crit }
}
```

这些配置现在主要作为**新建模板时的预设**。模板创建/编辑后，`base_*` 与 `growth_*` 会直接写入 `npc_templates`，战斗计算读取数据库字段，不再根据基础值推导成长。

公式：

```text
最终基础属性 = base[attr] + (level - 1) × growth[attr]
```

数值配置不允许散落在路由、DB 访问层或前端。

---

## 3. 品质系统

配置位置同上，倍率集中在 `NPC_QUALITY_DEFINITIONS`：

| 品质 | ID | 常规属性倍率 | 暴击倍率 |
| --- | --- | --- | --- |
| 普通 | `COMMON` | 1.0 | 1.0 |
| 精英 | `ELITE` | 1.3 | 1.15 |
| 首领 | `BOSS` | 1.7 | 1.35 |
| 传说 | `LEGENDARY` | 2.2 | 1.6 |

品质可配置在三层，优先级从高到低：

1. `monster_group_members.quality`（单场战斗槽位）
2. `npc_instances.quality`（NPC 实例）
3. `npc_templates.quality`（模板）

默认 `COMMON`。品质倍率在计算服务中统一应用。

---

## 4. 境界系统

`NPC_REALM_DEFINITIONS` 实现了境界加成：

- 支持 `练气 / 筑基 / 金丹 / 元婴 / 化神 / 炼虚 / 合体 / 大乘`
- 通过 `aliases` 匹配 `金丹中期`、`元婴圆满` 等文案
- 境界保存在 `npc_instances.realm` / `party_members.realm`，模板不再保存默认境界
- 只对本次计算输出生效，不修改 `npc_templates` 的 `base_*` 或 `growth_*`
- 加成 = 非暴击属性统一百分比 + 暴击率绝对值

测试中明确断言：境界计算前后，成长模板对象的值保持不变。

---

## 4.1 地图 NPC 专属敌方槽位等级

`monster_group_members.level` 仍是战斗配置的默认等级，但同一个战斗配置可能被多个地图 NPC 复用。
因此 `npc_instances` 增加：

```text
battle_member_levels_json TEXT NOT NULL DEFAULT '{}'
```

格式：`{"0":20,"1":15}`，key 为槽位序号。地图 NPC 编辑弹窗选择战斗配置后，会列出该配置的全部敌人并允许逐槽设置等级：

- 地图 NPC 专属覆盖 > `monster_group_members.level` > 1
- 未覆盖的槽位继续使用战斗配置默认等级
- 后台保存时会按当前战斗配置的槽位白名单过滤，避免残留无效槽位

迁移：`backend/migrations/20261107_npc_battle_member_levels.sql`

## 5. 装备与永久加成

`npc_templates.bonus_json` / `npc_instances.bonus_json` 支持：

```json
{
  "equipment": [
    { "sourceId": "eq_sword", "flat": { "atk": 120 }, "percent": { "matk": 0.1 } }
  ],
  "permanent": [
    { "sourceId": "title", "percent": { "hp": 0.05 } }
  ]
}
```

也兼容直接写属性对象（如 `{"hp":500,"attack":20}`）和数组形式。属性别名支持 `max_hp / attack / outer_attack / magic_attack / crit_rate` 等。

---

## 6. 统一计算服务

入口：`NpcAttributeCalculator.calculate()`。

固定流水线：

```text
基础值 + 等级成长
  -> 品质倍率
  -> 境界加成
  -> 装备加成
  -> 永久加成
  -> 战斗配置绝对覆盖值
  -> 取整 / 夹取 / 当前状态保留
```

`NpcAttributeCalculator` 同时提供：

- `calculateBaseAttributes()`：仅等级成长
- `calculateFromGrowthTemplate()`：按模板 + 等级计算
- `applyQuality()` / `applyRealmBonus()` / `applyBonuses()`
- `calculate()`：完整最终属性
- `recalculate()`：升级 / 换装 / 修正时保留当前生命与内力
- `preview()`：多等级成长预览

DB 行到计算入参的映射统一在 `npcAttributeService.ts`：

- `calculateNpcAttributesFromRows()`：模板 + 实例 + 槽位覆盖
- `toNpcCombatStats()`：最终属性 -> `CombatFighter` 字段
- `previewNpcAttributesFromRows()`：后台等级预览

---

## 7. 数据一致性规则

最终输出同时包含：

```ts
{
  maxHp, maxMp,       // 最终上限
  currentHp, currentMp // 当前战斗状态
}
```

规则：

1. **新生成 NPC**：未传 `current`，按满血满蓝初始化。
2. **重算 / 升级 / 换装**：传入 `currentHp/currentMp`，只做 `[0, max]` 夹取，绝不自动回满。
3. **上限提高**：当前值保持不变（不会因为升级而回血）。
4. **上限降低**：当前值夹取到新上限。
5. **阵亡 / 空蓝**：`current = 0` 会保留，不会因换装复活。
6. 战斗配置覆盖值（`hp_override` 等）仍保持旧语义，作为最终绝对值优先。

---

## 8. 数据库迁移（直接改数据）

迁移文件：`backend/migrations/20261107_npc_attribute_growth.sql`。

本次不保留运行时兼容分支，迁移会一次性把旧数据转换成新模型：

### `npc_templates`

- `base_matk / base_mdef / base_crit`：新增并直接回填
  - `base_matk = base_attack`
  - `base_mdef = base_defense`
  - `base_crit = 0.25`
- `growth_hp ... growth_crit`：新增并直接回填为 `base × 10%`，把旧版缩放固化成数据库数据
- `growth_template`：可空的预设标识；实际计算以 `growth_*` 列为准
- `quality`：默认 `COMMON`
- `bonus_json`：默认 `{}`
- **删除** `realm`、`level`：模板不再保存默认等级与境界

### `npc_instances`

- 新增 `realm`：迁移时优先从 `party_members.realm` 回填，其次继承旧模板境界
- 新增 `quality / growth_template / bonus_json`
- 旧模板的默认等级只迁移给尚未设置等级的 `PLAYER / MAIL` 实例

### `monster_group_members`

- 新增 `quality`：单槽位品质覆盖

### 迁移后的读取规则

- `base_* / growth_*` 全部从数据库读取，不再存在 `base_matk = base_attack`、`base × 10%` 之类的运行时兜底
- 等级从 `npc_instances.level` / `monster_group_members.level` / `party_members.level` 读取
- 境界从 `npc_instances.realm` / `party_members.realm` 读取
- 缺少 `growth_*` 时只会回落到成长预设或 0，不再推导旧版成长
- `monster_groups.enemies_json` 仅保留审计快照，战斗准备不再读取；缺少 `monster_group_members` 槽位时直接报错

## 9. 接入点

| 模块 | 接入方式 |
| --- | --- |
| `backend/src/db/combatDb.ts` | 敌方槽位、出战伙伴都由 `calculateNpcAttributesFromRows()` 生成 |
| `backend/src/routes/adminRoutes.ts` | 模板 DTO、战斗配置槽位 DTO、属性预览接口 |
| `backend/src/services/combat` | `toEngineFighter()` 使用 `matk/mdef/critRate/critDmg`，缺省回落旧值 |
| 后台 NPC 模板库 | 品质 / 成长预设 / 八维基础值 / 成长预览（等级与境界不在模板上） |
| 后台战斗配置 | 槽位等级 / 境界 / 品质覆盖，实时调用服务端预览 |

---

## 10. 管理接口

统一前缀：`/api/admin/npc-attributes`

- `GET /config`：成长模板、品质、境界配置总览
- `GET /preview?templateId=...&levels=1,10,20,50,100&quality=...&realm=...`：模板成长预览
- `GET /preview?growthTemplate=warrior&levels=1,10,20,50,100`：直接查看成长模板
- `POST /preview-batch`：战斗配置槽位实时预览

---

## 11. 测试

测试文件：`backend/test/npcAttributes.test.ts`。

覆盖：

1. 四大成长模板 × 等级 `1 / 10 / 20 / 50 / 100` 的完整公式
2. 数据库直存成长值，且不存在 `base × 10%` 的运行时推导
3. 四档品质倍率与差异
4. 战士 / 法术 / 均衡 / 辅助成长差异
5. 境界加成且不修改成长模板
6. 装备 + 永久加成
7. 重算不自动回血、升级保留当前值、降级夹取、阵亡不复活
8. 战斗配置覆盖值优先级
9. 模板行 + 实例行统一映射
10. 多等级预览去重排序
11. 地图 NPC 专属敌方槽位等级解析与槽位过滤

执行：

```bash
yarn --cwd backend test
```
