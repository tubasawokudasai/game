import { D1Database } from '@cloudflare/workers-types';
import { inventoryDb, InventoryItemDetail } from '../db/inventoryDb';
import { PlayerRecord } from '../models/types';
import { experienceService } from './experienceService';

/**
 * 物品分类元数据定义
 * 支持后期任意拓展新类型（如功法秘籍、灵宠坐骑、上古宝匣、阵法符阵等）
 */
export interface ItemTypeDefinition {
  code: string;               // 内部类型主标识 (如 EQUIPMENT, MEDICINE, MATERIAL, SPECIAL, SKILL_BOOK)
  name: string;               // 中文名 (如 装备, 药品, 材料, 特殊, 功法, 宝匣, 坐骑)
  icon: string;               // Material Symbols 图标标识
  description: string;        // 分类说明
  isEquippable: boolean;      // 是否可装备生效
  isUsable: boolean;          // 是否可直接使用/服用
  isStackable: boolean;       // 是否可堆叠
  order: number;              // 排序优先级权重
  aliases?: string[];         // 别名列表 (如 MEDICINE 支持 CONSUMABLE, POTION, PILL 等映射)
}

/**
 * 乾坤行囊分类注册中心 (ItemCategoryRegistry)
 * 具备高度可拓展性：支持代码热注册、配置拓展与未知类型的动态自适应降级
 */
class ItemCategoryRegistry {
  private categories: Map<string, ItemTypeDefinition> = new Map();
  private aliasMap: Map<string, string> = new Map();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults() {
    // 1. 装备类
    this.register({
      code: 'EQUIPMENT',
      name: '装备',
      icon: 'swords',
      description: '神兵法宝、护甲冠冕与遁速云履',
      isEquippable: true,
      isUsable: false,
      isStackable: false,
      order: 1,
      aliases: ['EQUIP', 'WEAPON', 'ARMOR'],
    });

    // 2. 药品/丹药类 (兼容现有系统的 CONSUMABLE)
    this.register({
      code: 'MEDICINE',
      name: '药品',
      icon: 'medication',
      description: '九转灵丹、金疮愈伤妙药与培元玉液',
      isEquippable: false,
      isUsable: true,
      isStackable: true,
      order: 2,
      aliases: ['CONSUMABLE', 'POTION', 'PILL', 'DRUG', 'DAN'],
    });

    // 3. 材料/矿石类
    this.register({
      code: 'MATERIAL',
      name: '材料',
      icon: 'diamond',
      description: '炼器矿石、天材地宝与灵草仙藤',
      isEquippable: false,
      isUsable: false,
      isStackable: true,
      order: 3,
      aliases: ['ORE', 'HERB', 'INGREDIENT'],
    });

    // 4. 特殊/符箓类
    this.register({
      code: 'SPECIAL',
      name: '特殊',
      icon: 'auto_fix_high',
      description: '神行仙符、宗门凭据与灵信',
      isEquippable: false,
      isUsable: true,
      isStackable: true,
      order: 4,
      aliases: ['TALISMAN', 'RUNE', 'TOKEN'],
    });

    // 5. 功法秘籍类 (后期拓展预置)
    this.register({
      code: 'SKILL_BOOK',
      name: '功法',
      icon: 'menu_book',
      description: '心法秘籍、剑诀残卷与神通心经',
      isEquippable: false,
      isUsable: true,
      isStackable: true,
      order: 5,
      aliases: ['BOOK', 'MANUAL', 'SCROLL'],
    });

    // 6. 宝匣礼包类 (后期拓展预置)
    this.register({
      code: 'CHEST',
      name: '宝匣',
      icon: 'featured_play_list',
      description: '机缘宝箱、上古匣匮与天道礼包',
      isEquippable: false,
      isUsable: true,
      isStackable: true,
      order: 6,
      aliases: ['BOX', 'GIFT', 'PACKAGE'],
    });

    // 7. 灵宠坐骑类 (后期拓展预置)
    this.register({
      code: 'MOUNT',
      name: '坐骑',
      icon: 'pets',
      description: '通灵仙兽、御空灵兽与护山神禽',
      isEquippable: false,
      isUsable: false,
      isStackable: false,
      order: 7,
      aliases: ['PET', 'BEAST'],
    });

    // 8. 任务信物类
    this.register({
      code: 'QUEST',
      name: '任务',
      icon: 'assignment',
      description: '委托信物、宗门敕令与秘境凭据',
      isEquippable: false,
      isUsable: false,
      isStackable: true,
      order: 8,
      aliases: ['MISSION', 'CLUE'],
    });
  }

  /**
   * 注册或拓展新物品分类
   */
  public register(def: ItemTypeDefinition): void {
    const code = def.code.toUpperCase();
    this.categories.set(code, { ...def, code });
    this.aliasMap.set(code, code);

    if (def.aliases) {
      for (const alias of def.aliases) {
        this.aliasMap.set(alias.toUpperCase(), code);
      }
    }
  }

  /**
   * 解析任意类型字符串到标准分类定义（含动态自适应容错）
   */
  public resolve(typeStr: string | undefined | null): ItemTypeDefinition {
    if (!typeStr) {
      return this.categories.get('MATERIAL')!;
    }
    const cleanStr = String(typeStr).trim().toUpperCase();
    const canonicalCode = this.aliasMap.get(cleanStr) || cleanStr;

    const existing = this.categories.get(canonicalCode);
    if (existing) {
      return existing;
    }

    // 动态生成未知拓展分类，保证系统永不报错，自适应渲染
    const dynamicDef: ItemTypeDefinition = {
      code: cleanStr,
      name: this.formatDynamicName(cleanStr),
      icon: 'category',
      description: '天机玄秘异物',
      isEquippable: false,
      isUsable: false,
      isStackable: true,
      order: 99,
    };
    this.categories.set(cleanStr, dynamicDef);
    this.aliasMap.set(cleanStr, cleanStr);
    return dynamicDef;
  }

  private formatDynamicName(code: string): string {
    const customNames: Record<string, string> = {
      FORMATION_FLAG: '阵旗',
      FORMATION_CORE: '阵眼',
      PET_EGG: '灵兽卵',
      RECIPE: '丹方',
      FORGE_TICKET: '淬炼符',
    };
    return customNames[code] || code;
  }

  /**
   * 获取所有已注册分类定义
   */
  public getAllDefinitions(): ItemTypeDefinition[] {
    return Array.from(this.categories.values()).sort((a, b) => a.order - b.order);
  }
}

export const itemCategoryRegistry = new ItemCategoryRegistry();

/**
 * 乾坤行囊业务逻辑服务层 (inventoryService)
 */
export const inventoryService = {
  DEFAULT_BAG_CAPACITY: 50,

  /**
   * 获取玩家行囊视图（按分类汇总、容量统计、装备/物品区分与可执行动作注入）
   */
  async getQiankunBag(
    db: D1Database,
    playerId: string,
    filterCategory?: string,
    equippedFilter?: 'all' | 'true' | 'false'
  ) {
    // 首次进入若行囊空无一物，赠予一份新手仙途起手补给
    await inventoryDb.seedStarterBagIfEmpty(db, playerId);

    const rawItems = await inventoryDb.getPlayerInventory(db, playerId);

    // 查询玩家基础信息（气血/真气/货币/战力）
    const player = await db
      .prepare('SELECT id, level, realm, hp, max_hp, mp, max_mp, combat_power, silver, ingot, copper FROM players WHERE id = ?')
      .bind(playerId)
      .first<PlayerRecord>();

    if (!player) {
      throw new Error('修仙者资料不存在');
    }

    // 统计当前行囊（未装备）占用的格子数
    const unequippedItems = rawItems.filter((i) => !i.isEquipped);
    const usedCapacity = unequippedItems.length;
    const totalCapacity = this.DEFAULT_BAG_CAPACITY;
    const freeCapacity = Math.max(0, totalCapacity - usedCapacity);

    // 计算各分类现存物品数量，供前端动态渲染页签角标
    const categoryCountMap = new Map<string, number>();
    for (const item of rawItems) {
      const def = itemCategoryRegistry.resolve(item.itemType);
      categoryCountMap.set(def.code, (categoryCountMap.get(def.code) || 0) + item.count);
    }

    // 组装动态分类页签列表 (全部 + 各存在或预设分类)
    const allDefs = itemCategoryRegistry.getAllDefinitions();
    const categories = [
      {
        code: 'ALL',
        name: '全部',
        icon: 'apps',
        count: rawItems.length,
        description: '乾坤纳芥子，包罗万象',
      },
      ...allDefs.map((def) => ({
        code: def.code,
        name: def.name,
        icon: def.icon,
        count: categoryCountMap.get(def.code) || 0,
        description: def.description,
      })),
    ];

    // 格式化富属性物品清单
    let formattedItems = rawItems.map((item) => {
      const catDef = itemCategoryRegistry.resolve(item.itemType);
      const isMedicineOrConsumable = catDef.code === 'MEDICINE' || catDef.isUsable;

      return {
        id: item.id,
        playerId: item.playerId,
        itemId: item.itemId,
        itemName: item.itemName,
        itemType: item.itemType,
        category: catDef.code,
        categoryName: catDef.name,
        categoryIcon: catDef.icon,
        count: item.count,
        isEquipped: item.isEquipped,
        slot: item.slot,
        quality: item.quality,
        stats: item.stats,
        enhanceLevel: item.enhanceLevel,
        description: item.description || catDef.description,
        actions: {
          canUse: isMedicineOrConsumable && !item.isEquipped,
          canEquip: catDef.isEquippable && !item.isEquipped,
          canUnequip: item.isEquipped,
          canDiscard: !item.isEquipped,
          canSell: !item.isEquipped && item.quality !== 'MYTHIC',
        },
        createdAt: item.createdAt,
      };
    });

    // 过滤分类（若传入）
    if (filterCategory && filterCategory.toUpperCase() !== 'ALL') {
      const targetCode = itemCategoryRegistry.resolve(filterCategory).code;
      formattedItems = formattedItems.filter((i) => i.category === targetCode);
    }

    // 过滤佩戴状态（若传入）
    if (equippedFilter === 'true') {
      formattedItems = formattedItems.filter((i) => i.isEquipped);
    } else if (equippedFilter === 'false') {
      formattedItems = formattedItems.filter((i) => !i.isEquipped);
    }

    return {
      success: true,
      capacity: {
        total: totalCapacity,
        used: usedCapacity,
        free: freeCapacity,
        isFull: freeCapacity <= 0,
      },
      categories,
      items: formattedItems,
      playerSummary: {
        hp: player.hp,
        maxHp: player.max_hp,
        mp: player.mp,
        maxMp: player.max_mp,
        silver: player.silver,
        ingot: player.ingot,
        copper: player.copper,
        combatPower: player.combat_power,
      },
    };
  },

  /**
   * 使用/服用行囊中的药品或消耗品
   */
  async useItem(db: D1Database, playerId: string, inventoryId: string, count: number = 1) {
    if (count < 1) count = 1;

    const item = await inventoryDb.getInventoryItem(db, playerId, inventoryId);
    if (!item) {
      throw new Error('行囊中未寻获此法宝道具');
    }

    if (item.isEquipped) {
      throw new Error('穿戴中的神兵不可直接服用');
    }

    if (item.count < count) {
      throw new Error(`道具存量不足，当前仅余 ${item.count} 件`);
    }

    const catDef = itemCategoryRegistry.resolve(item.itemType);
    if (!catDef.isUsable && catDef.code !== 'MEDICINE') {
      throw new Error(`【${item.itemName}】为${catDef.name}，不可直接吞服使用`);
    }

    // 获取玩家当前数值
    const player = await db
      .prepare('SELECT * FROM players WHERE id = ?')
      .bind(playerId)
      .first<PlayerRecord>();

    if (!player) {
      throw new Error('修仙者档案不存在');
    }

    // 尝试查询动态药品配置
    let medicineRecord: any = null;
    try {
      medicineRecord = await db
        .prepare('SELECT * FROM medicines WHERE id = ?')
        .bind(item.itemId)
        .first<any>();
    } catch {
      // 容错
    }

    // 执行丹药/消耗品效果推演
    const effects = this.calculateItemEffects(item, player, count, medicineRecord);

    // 扣减物品
    const { remaining } = await inventoryDb.reduceOrRemoveItem(
      db,
      inventoryId,
      count,
      item.count
    );

    // 应用到玩家数据库
    const updateStmts: any[] = [];
    let newExp = player.exp;
    let newLevel = player.level;
    let levelUpNotice = '';

    // 统一通过经验服务发放修为，自动处理多级连升与等级上限
    if (effects.expGain > 0) {
      try {
        const expRes = await experienceService.addExperience(db, playerId, effects.expGain);
        newExp = expRes.remainingExp;
        newLevel = expRes.postLevel;
        if (expRes.levelUpCount > 0) {
          levelUpNotice = expRes.levelUpCount === 1
            ? ` 天降祥瑞，道基圆满！突破晋升至 Lv.${newLevel}！`
            : ` 气海滔天，连破 ${expRes.levelUpCount} 境！突破晋升至 Lv.${newLevel}！`;

          // WS 未送达时，把后台配置的升级通知文案并入本次服用回执
          const fallbackNotices = (expRes.levelUpNotifications || [])
            .filter((notification) => !notification.delivered)
            .map((notification) =>
              notification.title
                ? `${notification.title}：${notification.content}`
                : notification.content
            );
          if (fallbackNotices.length > 0) {
            levelUpNotice += ` ${fallbackNotices.join('；')}`;
          }
        }
      } catch (err) {
        console.warn('[inventoryService] 丹药修为增加异常:', err);
      }
    }

    // 严禁升级时再次累加基础属性；仅应用丹药本身的永久加成 (如洗髓丹)
    let newMaxHp = player.max_hp + (effects.maxHpGain || 0);
    let newMaxMp = player.max_mp + (effects.maxMpGain || 0);
    const finalHp = Math.min(newMaxHp, Math.max(0, player.hp + effects.hpGain));
    const finalMp = Math.min(newMaxMp, Math.max(0, player.mp + effects.mpGain));
    const finalSilver = Math.max(0, player.silver + effects.silverGain);
    const finalIngot = Math.max(0, player.ingot + effects.ingotGain);

    updateStmts.push(
      db
        .prepare(`
          UPDATE players 
          SET hp = ?, max_hp = ?, mp = ?, max_mp = ?, exp = ?, level = ?,
              silver = ?, ingot = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `)
        .bind(
          finalHp,
          newMaxHp,
          finalMp,
          newMaxMp,
          newExp,
          newLevel,
          finalSilver,
          finalIngot,
          playerId
        )
    );

    await db.batch(updateStmts);

    // 触发既有综合战力重算引擎（依据基础等级+境界基底+穿戴装备词条与强化）
    const newCombatPower = await this.recalculatePlayerCombatPower(db, playerId);

    const message = `${effects.summaryText}${levelUpNotice}`;

    return {
      success: true,
      message,
      usedItem: {
        id: item.id,
        itemName: item.itemName,
        usedCount: count,
        remainingCount: remaining,
      },
      effects: {
        hpGain: effects.hpGain,
        mpGain: effects.mpGain,
        expGain: effects.expGain,
        silverGain: effects.silverGain,
        ingotGain: effects.ingotGain,
        isLevelUp: newLevel > player.level,
      },
      player: {
        hp: finalHp,
        maxHp: newMaxHp,
        mp: finalMp,
        maxMp: newMaxMp,
        exp: newExp,
        level: newLevel,
        combatPower: newCombatPower,
        silver: finalSilver,
        ingot: finalIngot,
      },
    };
  },

  /**
   * 推演丹药与特殊消耗品的使用效果
   */
  calculateItemEffects(
    item: InventoryItemDetail,
    player: PlayerRecord,
    count: number,
    medicineRecord?: any
  ) {
    let hpGain = 0;
    let mpGain = 0;
    let expGain = 0;
    let silverGain = 0;
    let ingotGain = 0;
    let maxHpGain = 0;
    let maxMpGain = 0;
    let combatPowerGain = 0;
    let summaryParts: string[] = [];

    const itemId = item.itemId;

    // 若配置了自定义动态药品属性，优先应用动态属性配置
    if (
      medicineRecord &&
      (medicineRecord.hp_restore > 0 ||
        medicineRecord.mp_restore > 0 ||
        medicineRecord.exp_restore > 0 ||
        medicineRecord.max_hp_bonus > 0 ||
        medicineRecord.max_mp_bonus > 0)
    ) {
      if (medicineRecord.hp_restore > 0) {
        hpGain = medicineRecord.hp_restore * count;
        summaryParts.push(`气血 +${hpGain}`);
      }
      if (medicineRecord.mp_restore > 0) {
        mpGain = medicineRecord.mp_restore * count;
        summaryParts.push(`真气 +${mpGain}`);
      }
      if (medicineRecord.exp_restore > 0) {
        expGain = medicineRecord.exp_restore * count;
        summaryParts.push(`修为 +${expGain}`);
      }
      if (medicineRecord.max_hp_bonus > 0) {
        maxHpGain = medicineRecord.max_hp_bonus * count;
        summaryParts.push(`气血上限 +${maxHpGain}`);
      }
      if (medicineRecord.max_mp_bonus > 0) {
        maxMpGain = medicineRecord.max_mp_bonus * count;
        summaryParts.push(`内力上限 +${maxMpGain}`);
      }
    }
    // 1. 聚气丹 (item_juqi_dan): 回复内力 + 修为
    else if (itemId === 'item_juqi_dan') {
      mpGain = 500 * count;
      expGain = 300 * count;
      summaryParts.push(`真气 +${mpGain}`, `修为 +${expGain}`);
    }
    // 2. 回春金疮散 (item_healing_dan): 回复大量气血
    else if (itemId === 'item_healing_dan') {
      hpGain = 3000 * count;
      summaryParts.push(`气血 +${hpGain}`);
    }
    // 3. 天阶金创药 (item_tianjie_jinchuang): 悬壶馆绝品伤药，极效愈伤
    else if (itemId === 'item_tianjie_jinchuang') {
      hpGain = 12000 * count;
      summaryParts.push(`气血恢复 +${hpGain}`);
    }
    // 4. 洗髓丹 (item_xisui_dan): 脱胎换骨，永久增幅气血上限与内力上限，全状态回满 + 海量修为
    else if (itemId === 'item_xisui_dan') {
      maxHpGain = 1000 * count;
      maxMpGain = 500 * count;
      combatPowerGain = 200 * count;
      hpGain = player.max_hp + maxHpGain;
      mpGain = player.max_mp + maxMpGain;
      expGain = 15000 * count;
      summaryParts.push(
        `洗经伐髓！气血上限 +${maxHpGain}`,
        `内力上限 +${maxMpGain}`,
        `战力 +${combatPowerGain}`,
        `全状态回满`,
        `修为 +${expGain}`
      );
    }
    // 5. 筑基丹 (item_zhuji_dan): 大量气血真气 + 丰厚修为
    else if (itemId === 'item_zhuji_dan') {
      hpGain = 5000 * count;
      mpGain = 2000 * count;
      expGain = 2000 * count;
      summaryParts.push(`气血 +${hpGain}`, `真气 +${mpGain}`, `修为 +${expGain}`);
    }
    // 6. 金丹玉液 (item_jindan_yuye): 状态全满 + 巨额修为
    else if (itemId === 'item_jindan_yuye') {
      hpGain = player.max_hp;
      mpGain = player.max_mp;
      expGain = 10000 * count;
      summaryParts.push(`状态完全补满`, `修为 +${expGain}`);
    }
    // 7. 下品灵石 (item_ling_shi): 汲取灵韵化为盘缠纹银
    else if (itemId === 'item_ling_shi') {
      silverGain = 500 * count;
      summaryParts.push(`纹银 +${silverGain}两`);
    }
    // 8. 上品灵石 (item_shangpin_lingshi): 汲取极品灵脉化为元宝
    else if (itemId === 'item_shangpin_lingshi') {
      ingotGain = 100 * count;
      summaryParts.push(`元宝 +${ingotGain}枚`);
    }
    // 9. 神行符 (item_teleport_rune):
    else if (itemId === 'item_teleport_rune') {
      summaryParts.push(`御风神行道韵加持，随时可免盘缠瞬移九州`);
    }
    // 10. 通用保底规则：从 stats 属性或根据品质回复
    else {
      const stats = item.stats;
      if (stats && (stats.hp || stats.mp || stats.exp)) {
        if (typeof stats.hp === 'number') hpGain = stats.hp * count;
        if (typeof stats.mp === 'number') mpGain = stats.mp * count;
        if (typeof stats.exp === 'number') expGain = stats.exp * count;
      } else {
        // 凡品默认 1000 血，灵品 3000 血
        hpGain = (item.quality === 'RARE' ? 3000 : 1000) * count;
        mpGain = (item.quality === 'RARE' ? 1500 : 500) * count;
      }
      if (hpGain > 0) summaryParts.push(`气血 +${hpGain}`);
      if (mpGain > 0) summaryParts.push(`真气 +${mpGain}`);
      if (expGain > 0) summaryParts.push(`修为 +${expGain}`);
    }

    const summaryText = summaryParts.length > 0
      ? `服下【${item.itemName}】${count > 1 ? `x${count}` : ''}，四肢百骸灵力流转：${summaryParts.join('，')}！`
      : `已使用【${item.itemName}】。`;

    return {
      hpGain,
      mpGain,
      expGain,
      silverGain,
      ingotGain,
      maxHpGain,
      maxMpGain,
      combatPowerGain,
      summaryText,
    };
  },

  /**
   * 穿戴行囊中的装备，并自动重算修仙综合战力
   */
  async equipItem(db: D1Database, playerId: string, inventoryId: string) {
    const item = await inventoryDb.getInventoryItem(db, playerId, inventoryId);
    if (!item) {
      throw new Error('行囊中未寻得该装备');
    }

    if (item.isEquipped) {
      throw new Error(`【${item.itemName}】已佩戴在身上`);
    }

    const catDef = itemCategoryRegistry.resolve(item.itemType);
    if (!catDef.isEquippable) {
      throw new Error(`【${item.itemName}】为${catDef.name}，不可穿戴上身`);
    }

    if (!item.slot) {
      throw new Error(`装备【${item.itemName}】未配置佩戴槽位`);
    }

    // 执行穿戴数据库事务（同槽位原装备自动卸下）
    const { replacedItem } = await inventoryDb.equipItemTx(db, playerId, item);

    // 重新计算修仙者综合战力
    const newCombatPower = await this.recalculatePlayerCombatPower(db, playerId);

    let message = `已成功穿戴神兵【${item.itemName}】！`;
    if (replacedItem) {
      message += ` (原【${replacedItem.item_name}】已卸入行囊)`;
    }

    return {
      success: true,
      message,
      equippedItem: {
        id: item.id,
        itemName: item.itemName,
        slot: item.slot,
      },
      replacedItem: replacedItem
        ? {
            id: replacedItem.id,
            itemName: replacedItem.item_name,
            slot: replacedItem.slot,
          }
        : null,
      newCombatPower,
    };
  },

  /**
   * 卸下身上佩戴的装备回行囊
   */
  async unequipItem(db: D1Database, playerId: string, inventoryId: string) {
    const item = await inventoryDb.getInventoryItem(db, playerId, inventoryId);
    if (!item) {
      throw new Error('未查验到该穿戴装备');
    }

    if (!item.isEquipped) {
      throw new Error(`【${item.itemName}】本就在行囊中，未曾穿戴`);
    }

    // 检查背包是否有空余空间
    const rawItems = await inventoryDb.getPlayerInventory(db, playerId);
    const unequippedCount = rawItems.filter((i) => !i.isEquipped).length;
    if (unequippedCount >= this.DEFAULT_BAG_CAPACITY) {
      throw new Error('乾坤行囊空间已满，请先清理或使用药品后再行卸下');
    }

    await inventoryDb.unequipItemTx(db, playerId, inventoryId);

    // 重新计算综合战力
    const newCombatPower = await this.recalculatePlayerCombatPower(db, playerId);

    return {
      success: true,
      message: `已将【${item.itemName}】卸下收归乾坤行囊`,
      unequippedItem: {
        id: item.id,
        itemName: item.itemName,
        slot: item.slot,
      },
      newCombatPower,
    };
  },

  /**
   * 丢弃行囊中的非佩戴物品
   */
  async discardItem(db: D1Database, playerId: string, inventoryId: string, count: number = 1) {
    const item = await inventoryDb.getInventoryItem(db, playerId, inventoryId);
    if (!item) {
      throw new Error('物品不存在或已被移出');
    }

    if (item.isEquipped) {
      throw new Error('正在佩戴生效的神兵法宝不可直接丢弃，请先卸下');
    }

    await inventoryDb.reduceOrRemoveItem(db, inventoryId, count, item.count);

    return {
      success: true,
      message: `已将【${item.itemName}】从乾坤行囊中舍弃`,
    };
  },

  /**
   * 整理行囊：堆叠合并与理顺
   */
  async tidyBag(db: D1Database, playerId: string) {
    const { mergedCount } = await inventoryDb.tidyInventoryTx(db, playerId);
    return {
      success: true,
      message: mergedCount > 0 ? `乾坤理顺，已归拢合并 ${mergedCount} 叠行囊物资` : '乾坤行囊已井然有序，无需重复规整',
      mergedCount,
    };
  },

  /**
   * 综合修仙战力与基础成长属性 (HP/MP) 动态重算引擎
   * 依据：基础等级 + 境界基底 + 当前 5 件穿戴装备词条与强化等级
   * 兼顾丹药脱胎换骨等永久上限增幅
   */
  async recalculatePlayerCombatPower(
    db: D1Database,
    playerId: string,
    options?: { updateHpMp?: boolean }
  ): Promise<number> {
    const player = await db
      .prepare('SELECT id, level, realm, hp, max_hp, mp, max_mp FROM players WHERE id = ?')
      .bind(playerId)
      .first<{
        id: string;
        level: number;
        realm: string;
        hp: number;
        max_hp: number;
        mp: number;
        max_mp: number;
      }>();

    if (!player) return 1000;

    const baseLevel = Math.max(1, Number(player.level) || 1);
    const realmStr = player.realm || '练气初期';
    let calculatedPower = 800 + baseLevel * 120;

    // 查验当前所有已佩戴装备
    const equippedItems = await db
      .prepare('SELECT * FROM inventory WHERE player_id = ? AND is_equipped = 1')
      .bind(playerId)
      .all<any>();

    const qualityMultiplier: Record<string, number> = {
      COMMON: 1.0,
      RARE: 1.4,
      EPIC: 2.0,
      LEGENDARY: 3.0,
      MYTHIC: 4.5,
    };

    let equipHpMax = 0;
    let equipMpMax = 0;

    for (const eq of equippedItems.results || []) {
      const qMul = qualityMultiplier[eq.quality] || 1.0;
      const enhance = Number(eq.enhance_level) || 0;
      calculatedPower += Math.round(enhance * 80 * qMul);

      let statsObj: any = {};
      if (eq.stats) {
        try {
          statsObj = JSON.parse(eq.stats);
        } catch {
          statsObj = {};
        }
      }

      for (const [key, val] of Object.entries(statsObj)) {
        const num = Number(val) || 0;
        if (key.includes('attack')) calculatedPower += Math.round(num * 2.2);
        else if (key.includes('defense')) calculatedPower += Math.round(num * 1.6);
        else if (key.includes('hp')) {
          calculatedPower += Math.round(num * 0.12);
          equipHpMax += num;
        } else if (key.includes('mp')) {
          calculatedPower += Math.round(num * 0.15);
          equipMpMax += num;
        } else if (key.includes('crit_rate')) calculatedPower += Math.round(num * 1500);
        else if (key.includes('speed')) calculatedPower += Math.round(num * 400);
        else calculatedPower += Math.round(num * 1.0);
      }
    }

    calculatedPower = Math.max(500, calculatedPower);

    // 若需要联动重算生命与法力上限（如管理后台修改了等级/境界）
    if (options?.updateHpMp) {
      // 境界加成表 (百分比加成)
      const realmBonusMap: Record<string, number> = {
        '化神': 0.24,
        '元婴': 0.16,
        '金丹': 0.10,
        '筑基': 0.06,
        '练气': 0.03,
      };
      let realmBonus = 0.03;
      for (const [key, bonus] of Object.entries(realmBonusMap)) {
        if (realmStr.includes(key)) {
          realmBonus = bonus;
          break;
        }
      }

      // 基础属性成长：创角初始 3000 HP / 1500 MP，每级成长 +200 HP / +100 MP
      const baseHpGrowth = 3000 + (baseLevel - 1) * 200;
      const baseMpGrowth = 1500 + (baseLevel - 1) * 100;

      const newMaxHp = Math.round(baseHpGrowth * (1 + realmBonus)) + equipHpMax;
      const newMaxMp = Math.round(baseMpGrowth * (1 + realmBonus)) + equipMpMax;

      const currentHp = Number(player.hp) || 0;
      const currentMp = Number(player.mp) || 0;
      const updatedHp = Math.max(1, Math.min(newMaxHp, currentHp));
      const updatedMp = Math.max(0, Math.min(newMaxMp, currentMp));

      await db
        .prepare(
          'UPDATE players SET combat_power = ?, max_hp = ?, max_mp = ?, hp = ?, mp = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        )
        .bind(calculatedPower, newMaxHp, newMaxMp, updatedHp, updatedMp, playerId)
        .run();
    } else {
      // 默认常规只刷新 combat_power (升级逻辑/穿脱装备等已有专职事务管控)
      await db
        .prepare('UPDATE players SET combat_power = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(calculatedPower, playerId)
        .run();
    }

    return calculatedPower;
  },
};
