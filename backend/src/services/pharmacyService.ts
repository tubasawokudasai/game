import { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import { PlayerRecord } from '../models/types';
import { partyDb, PartyMemberDto, toLeaderDto } from '../db/partyDb';

export interface PharmacyGood {
  itemId: string;
  name: string;
  quality: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
  type: string;
  priceCopper: number;
  description: string;
  effectDesc: string;
  icon: string;
}

export interface AlchemyRecipe {
  id: string;
  name: string;
  outputItemId: string;
  outputItemName: string;
  outputCount: number;
  costCopper: number;
  costExp: number;
  quality: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
  description: string;
  icon: string;
}

export const HEAL_COST_COPPER = 100;

export const PHARMACY_GOODS: PharmacyGood[] = [
  {
    itemId: 'item_tianjie_jinchuang',
    name: '天阶金创药',
    quality: 'EPIC',
    type: 'CONSUMABLE',
    priceCopper: 600,
    description: '悬壶馆药王秘炼天阶金创圣药，肉白骨活死人。',
    effectDesc: '服用瞬间恢复 12,000 点气血并平复内伤',
    icon: 'medication',
  },
  {
    itemId: 'item_xisui_dan',
    name: '洗髓丹',
    quality: 'LEGENDARY',
    type: 'CONSUMABLE',
    priceCopper: 3000,
    description: '脱胎换骨之无上灵丹，洗经伐髓。',
    effectDesc: '永久增加 1,000 气血上限与 500 内力上限，全状态回满 + 15,000 修为',
    icon: 'flare',
  },
  {
    itemId: 'item_healing_dan',
    name: '回春金疮散',
    quality: 'COMMON',
    type: 'CONSUMABLE',
    priceCopper: 100,
    description: '百花谷秘制金疮圣药，可迅速止血愈伤。',
    effectDesc: '服用迅速恢复 3,000 点气血',
    icon: 'healing',
  },
  {
    itemId: 'item_juqi_dan',
    name: '聚气丹',
    quality: 'COMMON',
    type: 'CONSUMABLE',
    priceCopper: 120,
    description: '聚引周遭灵气入体，助益练气破阶。',
    effectDesc: '服用恢复 500 点真气与 300 点修为',
    icon: 'spa',
  },
  {
    itemId: 'item_zhuji_dan',
    name: '筑基丹',
    quality: 'RARE',
    type: 'CONSUMABLE',
    priceCopper: 800,
    description: '破境筑基之丹，服之可固本培元。',
    effectDesc: '服用恢复 5,000 气血、2,000 真气与 2,000 修为',
    icon: 'science',
  },
];

export const ALCHEMY_RECIPES: AlchemyRecipe[] = [
  {
    id: 'recipe_healing_dan',
    name: '回春金疮散',
    outputItemId: 'item_healing_dan',
    outputItemName: '回春金疮散',
    outputCount: 1,
    costCopper: 50,
    costExp: 0,
    quality: 'COMMON',
    description: '投入百草经由八卦炉文火慢煨，丹成金疮立愈。',
    icon: 'healing',
  },
  {
    id: 'recipe_juqi_dan',
    name: '聚气丹',
    outputItemId: 'item_juqi_dan',
    outputItemName: '聚气丹',
    outputCount: 1,
    costCopper: 60,
    costExp: 0,
    quality: 'COMMON',
    description: '凝引天地微光灵气入炉，武火淬炼成浑圆聚气丹。',
    icon: 'spa',
  },
  {
    id: 'recipe_tianjie_jinchuang',
    name: '天阶金创药',
    outputItemId: 'item_tianjie_jinchuang',
    outputItemName: '天阶金创药',
    outputCount: 1,
    costCopper: 300,
    costExp: 100,
    quality: 'EPIC',
    description: '以三昧真火与药王秘术淬炼天阶灵药，药力醇厚。',
    icon: 'medication',
  },
  {
    id: 'recipe_xisui_dan',
    name: '洗髓丹',
    outputItemId: 'item_xisui_dan',
    outputItemName: '洗髓丹',
    outputCount: 1,
    costCopper: 1500,
    costExp: 500,
    quality: 'LEGENDARY',
    description: '九转金炉融天地造化，洗经伐髓，脱胎换骨。',
    icon: 'flare',
  },
];

export class PharmacyService {
  /**
   * 获取悬壶馆全貌信息（医馆状态、药王坐镇、疗伤费用、货架药品、炼丹配方、队伍状态）
   */
  async getInfo(db: D1Database, playerId: string) {
    const player = await db
      .prepare('SELECT * FROM players WHERE id = ?')
      .bind(playerId)
      .first<PlayerRecord>();

    if (!player) {
      throw new Error('修仙者档案不存在');
    }

    // 获取队伍出战伙伴
    const companions = await partyDb.listByPlayer(db, playerId);
    const leaderDto = toLeaderDto(player);
    const party = [leaderDto, ...companions.filter((c) => c.isActive)];

    const needHeal = player.hp < player.max_hp || player.mp < player.max_mp;

    // 货架药品列表：优先从 medicines 数据库读取在售药品
    let goods = PHARMACY_GOODS;
    try {
      const { results } = await db
        .prepare(
          'SELECT id, name, quality, type, price_copper, effect_desc, description, icon FROM medicines WHERE status = 1 ORDER BY price_copper ASC'
        )
        .all<any>();
      if (results && Array.isArray(results) && results.length > 0 && typeof results[0]?.price_copper === 'number') {
        goods = results.map((r) => ({
          itemId: r.id,
          name: r.name,
          quality: r.quality,
          type: r.type || 'CONSUMABLE',
          priceCopper: Number(r.price_copper) || 0,
          description: r.description || '',
          effectDesc: r.effect_desc || '',
          icon: r.icon || 'medication',
        }));
      }
    } catch {
      goods = PHARMACY_GOODS;
    }

    return {
      facility: {
        name: '悬壶馆',
        sub: '回春疗伤 · 丹药炼制',
        desc: '本馆有天阶金创药、洗髓丹。药王孙真人坐镇，可消耗铜钱完全恢复全队气血与内力。',
        action: '购药/疗伤',
        icon: 'local_pharmacy',
        color: 'text-tertiary',
        doctor: {
          name: '药王孙真人',
          title: '回春神医 · 悬壶济世',
          dialogue: needHeal
            ? '凡胎肉身，历经苦战难免经脉受阻、气血匮乏。老夫引太乙神针，须臾便教道友全队神清气爽、精血重铸。'
            : '道友神采奕奕，周身真气畅达无碍。若欲精进道法，本馆备有洗髓丹与天阶金创药，亦有神农宝鼎可供开炉炼丹。',
          avatar: '/assets/combat/characters/hero_xuanmen_shushi_trans.png',
        },
      },
      healCost: HEAL_COST_COPPER,
      canHeal: needHeal && player.copper >= HEAL_COST_COPPER,
      needHeal,
      player: {
        id: player.id,
        nickname: player.nickname,
        level: player.level,
        realm: player.realm,
        hp: player.hp,
        maxHp: player.max_hp,
        mp: player.mp,
        maxMp: player.max_mp,
        copper: player.copper,
        silver: player.silver,
        ingot: player.ingot,
      },
      party,
      goods,
      recipes: ALCHEMY_RECIPES,
    };
  }

  /**
   * 药王坐镇 · 全队回春疗伤
   * 消耗铜钱，完全恢复全队气血与内力
   */
  async healParty(db: D1Database, playerId: string) {
    const player = await db
      .prepare('SELECT * FROM players WHERE id = ?')
      .bind(playerId)
      .first<PlayerRecord>();

    if (!player) {
      throw new Error('修仙者档案不存在');
    }

    if (player.hp >= player.max_hp && player.mp >= player.max_mp) {
      return {
        success: false,
        alreadyFull: true,
        message: '道友与随行战队精气神完足，气血内力皆处巅峰，无需回春疗伤！',
        player: {
          hp: player.hp,
          maxHp: player.max_hp,
          mp: player.mp,
          maxMp: player.max_mp,
          copper: player.copper,
        },
      };
    }

    if (player.copper < HEAL_COST_COPPER) {
      throw new Error(`铜钱不足！全队回春疗伤需消耗 ${HEAL_COST_COPPER} 铜钱，当前仅有 ${player.copper} 铜钱。`);
    }

    const hpRecovered = player.max_hp - player.hp;
    const mpRecovered = player.max_mp - player.mp;
    const finalCopper = player.copper - HEAL_COST_COPPER;

    await db
      .prepare(`
        UPDATE players
        SET hp = max_hp, mp = max_mp, copper = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(finalCopper, playerId)
      .run();

    const companions = await partyDb.listByPlayer(db, playerId);
    const updatedLeader: PartyMemberDto = {
      ...toLeaderDto(player),
      level: player.level,
    };
    const activeCompanions = companions.filter((c) => c.isActive);

    return {
      success: true,
      cost: HEAL_COST_COPPER,
      hpRecovered,
      mpRecovered,
      message: `药王孙真人手引金针渡穴，太乙神农生生之气充盈周身！全队气血恢复 +${hpRecovered}，真气恢复 +${mpRecovered}，已重归圆满！`,
      player: {
        id: player.id,
        hp: player.max_hp,
        maxHp: player.max_hp,
        mp: player.max_mp,
        maxMp: player.max_mp,
        copper: finalCopper,
      },
      party: [updatedLeader, ...activeCompanions],
    };
  }

  /**
   * 悬壶药阁 · 购药
   * 选购天阶金创药、洗髓丹等药品入乾坤行囊
   */
  async buyMedicine(db: D1Database, playerId: string, itemId: string, count: number = 1) {
    const buyCount = Math.max(1, Math.floor(count));

    let good: PharmacyGood | undefined;
    try {
      const row = await db
        .prepare('SELECT id, name, quality, type, price_copper, effect_desc, description, icon FROM medicines WHERE id = ?')
        .bind(itemId)
        .first<any>();
      if (row && row.id === itemId && typeof row.price_copper === 'number') {
        good = {
          itemId: row.id,
          name: row.name,
          quality: row.quality,
          type: row.type || 'CONSUMABLE',
          priceCopper: Number(row.price_copper) || 0,
          description: row.description || '',
          effectDesc: row.effect_desc || '',
          icon: row.icon || 'medication',
        };
      }
    } catch {
      // 容错处理
    }

    if (!good) {
      good = PHARMACY_GOODS.find((g) => g.itemId === itemId);
    }
    if (!good) {
      throw new Error('悬壶馆药架上暂无此药丹出售');
    }

    const totalCost = good.priceCopper * buyCount;

    const player = await db
      .prepare('SELECT id, copper FROM players WHERE id = ?')
      .bind(playerId)
      .first<PlayerRecord>();

    if (!player) {
      throw new Error('修仙者档案不存在');
    }

    if (player.copper < totalCost) {
      throw new Error(`铜钱不足！购买 ${buyCount} 份【${good.name}】需 ${totalCost} 铜钱，当前仅有 ${player.copper} 铜钱。`);
    }

    const newCopper = player.copper - totalCost;
    const statements: D1PreparedStatement[] = [];

    // 1. 扣除铜钱
    statements.push(
      db
        .prepare('UPDATE players SET copper = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(newCopper, playerId)
    );

    // 2. 堆叠或新增背包物品
    const existing = await db
      .prepare('SELECT id, count FROM inventory WHERE player_id = ? AND item_id = ? AND is_equipped = 0 LIMIT 1')
      .bind(playerId, itemId)
      .first<{ id: string; count: number }>();

    if (existing) {
      statements.push(
        db
          .prepare('UPDATE inventory SET count = count + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .bind(buyCount, existing.id)
      );
    } else {
      const invId = `inv_${playerId}_${itemId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      statements.push(
        db
          .prepare(
            `INSERT INTO inventory (id, player_id, item_id, item_name, item_type, count, is_equipped, quality)
             VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
          )
          .bind(invId, playerId, itemId, good.name, good.type, buyCount, good.quality)
      );
    }

    await db.batch(statements);

    return {
      success: true,
      message: `花费 ${totalCost} 铜钱，成功购得【${good.name}】×${buyCount}，已妥善收入乾坤行囊！`,
      cost: totalCost,
      good,
      count: buyCount,
      player: {
        copper: newCopper,
      },
    };
  }

  /**
   * 神农药鼎 · 丹药炼制
   * 开炉炼制天阶金创药、洗髓丹等珍品丹药
   */
  async craftMedicine(db: D1Database, playerId: string, recipeId: string, count: number = 1) {
    const craftCount = Math.max(1, Math.floor(count));
    const recipe = ALCHEMY_RECIPES.find((r) => r.id === recipeId);
    if (!recipe) {
      throw new Error('丹炉前未寻获对应炼丹丹方');
    }

    const totalCopper = recipe.costCopper * craftCount;
    const totalExp = recipe.costExp * craftCount;

    const player = await db
      .prepare('SELECT id, copper, exp FROM players WHERE id = ?')
      .bind(playerId)
      .first<PlayerRecord>();

    if (!player) {
      throw new Error('修仙者档案不存在');
    }

    if (player.copper < totalCopper) {
      throw new Error(`铜钱不足！炼制 ${craftCount} 炉【${recipe.outputItemName}】需 ${totalCopper} 铜钱，当前仅有 ${player.copper} 铜钱。`);
    }

    if (totalExp > 0 && player.exp < totalExp) {
      throw new Error(`修仙领悟经验不足！炼制需灌注 ${totalExp} 点气海修为，当前仅有 ${player.exp} 点。`);
    }

    const newCopper = player.copper - totalCopper;
    const newExp = player.exp - totalExp;
    const outputTotal = recipe.outputCount * craftCount;

    const statements: D1PreparedStatement[] = [];

    // 1. 扣除材料/消耗
    statements.push(
      db
        .prepare('UPDATE players SET copper = ?, exp = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(newCopper, newExp, playerId)
    );

    // 2. 丹成出炉入背包
    const existing = await db
      .prepare('SELECT id, count FROM inventory WHERE player_id = ? AND item_id = ? AND is_equipped = 0 LIMIT 1')
      .bind(playerId, recipe.outputItemId)
      .first<{ id: string; count: number }>();

    if (existing) {
      statements.push(
        db
          .prepare('UPDATE inventory SET count = count + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .bind(outputTotal, existing.id)
      );
    } else {
      const invId = `inv_${playerId}_${recipe.outputItemId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      statements.push(
        db
          .prepare(
            `INSERT INTO inventory (id, player_id, item_id, item_name, item_type, count, is_equipped, quality)
             VALUES (?, ?, ?, ?, 'CONSUMABLE', ?, 0, ?)`
          )
          .bind(invId, playerId, recipe.outputItemId, recipe.outputItemName, outputTotal, recipe.quality)
      );
    }

    await db.batch(statements);

    return {
      success: true,
      message: `神农百草鼎烈火纯青，药香扑鼻！炼丹成功，喜得【${recipe.outputItemName}】×${outputTotal}！`,
      recipe,
      outputCount: outputTotal,
      player: {
        copper: newCopper,
        exp: newExp,
      },
    };
  }
}

export const pharmacyService = new PharmacyService();
