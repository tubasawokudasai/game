import { PlayerRecord } from '../models/types';

/**
 * 认证与账号合并数据库底层模块 (authDb.ts)
 * 严格使用 Cloudflare D1 (db.batch) 事务保证游客账号创建、正式转正、数据合并的原子性
 */
export const authDb = {
  /**
   * 根据前端设备标识查询已有的匿名游客账号
   */
  async findGuestByDeviceId(db: D1Database, deviceId: string): Promise<PlayerRecord | null> {
    const player = await db
      .prepare('SELECT * FROM players WHERE device_id = ? AND is_guest = 1 LIMIT 1')
      .bind(deviceId)
      .first<PlayerRecord>();
    return player || null;
  },

  /**
   * 生成全局唯一的 6 位数字玩家 UUID (100000 - 999999)
   */
  async generateUniquePlayerId(db: D1Database, preferredId?: string): Promise<string> {
    if (preferredId && /^\d{6}$/.test(preferredId)) {
      const existing = await db
        .prepare('SELECT id FROM players WHERE id = ? LIMIT 1')
        .bind(preferredId)
        .first();
      if (!existing) {
        return preferredId;
      }
    }

    for (let i = 0; i < 15; i++) {
      const candidate = String(Math.floor(100000 + Math.random() * 900000));
      const existing = await db
        .prepare('SELECT id FROM players WHERE id = ? LIMIT 1')
        .bind(candidate)
        .first();
      if (!existing) {
        return candidate;
      }
    }
    return String(Math.floor(100000 + Math.random() * 900000));
  },

  /**
   * 为新设备生成并插入一个全新匿名游客账号 (采用 6 位数字玩家 UUID)
   */
  async createGuestPlayer(db: D1Database, deviceId: string): Promise<PlayerRecord> {
    const guestId = await this.generateUniquePlayerId(db, deviceId);
    const guestUsername = `guest_${guestId}`;
    const guestNickname = `玩家_${guestId}`;

    await db.batch([
      db.prepare(
        `INSERT INTO players (
          id, username, account_id, password_hash, is_guest, device_id,
          nickname, level, exp, hp, max_hp, mp, max_mp,
          combat_power, sect, sect_position, realm, vip_level,
          spiritual_root, reputation, residence, likes_count,
          silver, ingot, copper, zone_id, area_id, signature, avatar, title, status
        ) VALUES (
          ?, ?, NULL, NULL, 1, ?,
          ?, 1, 0, 3000, 3000, 1500, 1500,
          800, '散修盟', '记名弟子', '练气初期', 1,
          '五行杂灵根', '初出茅庐 (壹品)', '长乐客栈·丙等', 0,
          2000, 100, 10000,
          'changle_city', 'square', '身如浮萍寄九州，仙路迢迢踏歌游。',
          NULL,
          '初入仙途', 'ONLINE'
        )`
      ).bind(guestId, guestUsername, deviceId, guestNickname),
      // 初始入门佩装
      db.prepare(
        `INSERT INTO inventory (id, player_id, item_id, item_name, item_type, count, is_equipped, slot, quality, stats, enhance_level)
         VALUES (?, ?, 'item_sword_starter', '青竹剑', 'EQUIPMENT', 1, 1, 'WEAPON', 'COMMON', '{"outer_attack":25}', 1)`
      ).bind(`inv_wpn_${guestId}`, guestId),
      db.prepare(
        `INSERT INTO inventory (id, player_id, item_id, item_name, item_type, count, is_equipped, slot, quality, stats, enhance_level)
         VALUES (?, ?, 'item_crown_starter', '布带青巾', 'EQUIPMENT', 1, 1, 'HELMET', 'COMMON', '{"defense":10}', 1)`
      ).bind(`inv_hlm_${guestId}`, guestId),
      db.prepare(
        `INSERT INTO inventory (id, player_id, item_id, item_name, item_type, count, is_equipped, slot, quality, stats, enhance_level)
         VALUES (?, ?, 'item_robe_starter', '粗布道袍', 'EQUIPMENT', 1, 1, 'ARMOR', 'COMMON', '{"hp_max":120}', 1)`
      ).bind(`inv_arm_${guestId}`, guestId),
      db.prepare(
        `INSERT INTO inventory (id, player_id, item_id, item_name, item_type, count, is_equipped, slot, quality, stats, enhance_level)
         VALUES (?, ?, 'item_boots_starter', '麻织履', 'EQUIPMENT', 1, 1, 'BOOTS', 'COMMON', '{"speed":0.05}', 1)`
      ).bind(`inv_bts_${guestId}`, guestId),
      db.prepare(
        `INSERT INTO inventory (id, player_id, item_id, item_name, item_type, count, is_equipped, slot, quality, stats, enhance_level)
         VALUES (?, ?, 'item_pendant_starter', '凝神青玉佩', 'EQUIPMENT', 1, 1, 'ARTIFACT', 'COMMON', '{"mp_max":80}', 1)`
      ).bind(`inv_art_${guestId}`, guestId),
      // 初始乾坤行囊物资 (药品、材料、备用神兵、特殊符箓)
      db.prepare(
        `INSERT INTO inventory (id, player_id, item_id, item_name, item_type, count, is_equipped, quality)
         VALUES (?, ?, 'item_juqi_dan', '聚气丹', 'CONSUMABLE', 5, 0, 'COMMON')`
      ).bind(`inv_bag_jq_${guestId}`, guestId),
      db.prepare(
        `INSERT INTO inventory (id, player_id, item_id, item_name, item_type, count, is_equipped, quality)
         VALUES (?, ?, 'item_healing_dan', '回春金疮散', 'CONSUMABLE', 3, 0, 'COMMON')`
      ).bind(`inv_bag_hc_${guestId}`, guestId),
      db.prepare(
        `INSERT INTO inventory (id, player_id, item_id, item_name, item_type, count, is_equipped, quality)
         VALUES (?, ?, 'item_zhuji_dan', '筑基丹', 'CONSUMABLE', 1, 0, 'RARE')`
      ).bind(`inv_bag_zj_${guestId}`, guestId),
      db.prepare(
        `INSERT INTO inventory (id, player_id, item_id, item_name, item_type, count, is_equipped, slot, quality, stats, enhance_level)
         VALUES (?, ?, 'item_sword_steel', '寒光玄铁剑', 'EQUIPMENT', 1, 0, 'WEAPON', 'RARE', '{"outer_attack":85,"crit_rate":0.05}', 2)`
      ).bind(`inv_bag_swd_${guestId}`, guestId),
      db.prepare(
        `INSERT INTO inventory (id, player_id, item_id, item_name, item_type, count, is_equipped, quality)
         VALUES (?, ?, 'item_ling_shi', '下品灵石', 'MATERIAL', 20, 0, 'COMMON')`
      ).bind(`inv_bag_ls_${guestId}`, guestId),
      db.prepare(
        `INSERT INTO inventory (id, player_id, item_id, item_name, item_type, count, is_equipped, quality)
         VALUES (?, ?, 'item_teleport_rune', '神行符', 'SPECIAL', 3, 0, 'RARE')`
      ).bind(`inv_bag_rn_${guestId}`, guestId),
      // 初始仙途大事纪
      db.prepare(
        `INSERT INTO player_chronicles (id, player_id, title, year, content, order_index)
         VALUES (?, ?, '【初入仙途】', '天启初年', '游历九州，登临长乐古都，问道仙途。', 1)`
      ).bind(`chr_${guestId}_1`, guestId),
      db.prepare(
        `INSERT INTO player_chronicles (id, player_id, title, year, content, order_index)
         VALUES (?, ?, '【引气入体】', '天启初年', '偶得仙缘残卷，感悟天地灵气，开辟丹田紫府。', 2)`
      ).bind(`chr_${guestId}_2`, guestId)
      // 出战伙伴不随建档预置：由剧情动作 JOIN_PARTY 按需入队
    ]);

    const created = await db
      .prepare('SELECT * FROM players WHERE id = ?')
      .bind(guestId)
      .first<PlayerRecord>();

    if (!created) {
      throw new Error('匿名游客初始化失败');
    }

    return created;
  },

  /**
   * 根据用户名精确查询玩家记录
   */
  async findPlayerByUsername(db: D1Database, username: string): Promise<PlayerRecord | null> {
    const player = await db
      .prepare('SELECT * FROM players WHERE username = ? LIMIT 1')
      .bind(username)
      .first<PlayerRecord>();
    return player || null;
  },

  /**
   * 根据玩家 ID 精确查询记录
   */
  async findPlayerById(db: D1Database, playerId: string): Promise<PlayerRecord | null> {
    const player = await db
      .prepare('SELECT * FROM players WHERE id = ? LIMIT 1')
      .bind(playerId)
      .first<PlayerRecord>();
    return player || null;
  },

  /**
   * 账号升级 (原地转正)：将游客账号直接晋级为正式账号
   * 无需数据迁移，更新 is_guest = 0，绑定账号密码
   */
  async upgradeGuestToFormal(
    db: D1Database,
    guestId: string,
    username: string,
    passwordHash: string
  ): Promise<PlayerRecord> {
    // 1. 验证目标用户名是否已被注册
    const existing = await db
      .prepare('SELECT id FROM players WHERE username = ? AND id != ? LIMIT 1')
      .bind(username, guestId)
      .first<{ id: string }>();

    if (existing) {
      throw new Error('此仙名/账号已被九州其他道友注册，请更换');
    }

    const accountId = `acc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // 2. 更新该记录为正式账号
    const res = await db
      .prepare(
        `UPDATE players 
         SET username = ?, account_id = ?, password_hash = ?, is_guest = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND is_guest = 1`
      )
      .bind(username, accountId, passwordHash, guestId)
      .run();

    if (res.meta.changes === 0) {
      throw new Error('未能转正当前账号，可能该账号已是正式账号或不存在');
    }

    const updated = await this.findPlayerById(db, guestId);
    if (!updated) {
      throw new Error('获取升级后档案失败');
    }

    return updated;
  },

  /**
   * 现有账号合并 (核心强事务)：
   * 匿名玩家试玩获得资产后，登录已有正式账号，将试玩产生的数据全数合并进正式账号
   * 步骤：
   * 1. 查询待合并匿名玩家的货币资产 (silver, copper, ingot) 与物品数、信件数
   * 2. 执行 db.batch 原子事务：
   *    - 将 inventory 中属于 guestId 的记录 player_id 更新为 formalId，并置 is_equipped = 0 存入行囊
   *    - 将 mails 中 receiver_id = guestId 更新为 formalId
   *    - 将 mails 中 sender_id = guestId 更新为 formalId
   *    - 累加货币到 formalId 账号
   *    - 删除原匿名游客账号 (或状态置为 MERGED)
   */
  async mergeGuestIntoFormalTx(
    db: D1Database,
    guestId: string,
    formalId: string
  ): Promise<{
    mergedSilver: number;
    mergedCopper: number;
    mergedIngot: number;
    movedItemCount: number;
    movedMailCount: number;
  }> {
    if (guestId === formalId) {
      throw new Error('相同账号无需合并');
    }

    // 1. 查询游客数据
    const guest = await this.findPlayerById(db, guestId);
    if (!guest) {
      throw new Error('未查得该匿名游客档案');
    }
    if (guest.is_guest !== 1) {
      throw new Error('当前操作账号非匿名游客，无法作为源数据进行合并');
    }

    // 2. 查询正式账号数据
    const formal = await this.findPlayerById(db, formalId);
    if (!formal) {
      throw new Error('目标正式账号不存在');
    }
    if (formal.is_guest === 1) {
      throw new Error('目标合并账号不是正式仙籍账号');
    }

    // 3. 统计迁移的背包物品数与邮件数
    const itemsCountRes = await db
      .prepare('SELECT COUNT(*) as count FROM inventory WHERE player_id = ?')
      .bind(guestId)
      .first<{ count: number }>();
    const movedItemCount = itemsCountRes?.count || 0;

    const mailsCountRes = await db
      .prepare('SELECT COUNT(*) as count FROM mails WHERE receiver_id = ?')
      .bind(guestId)
      .first<{ count: number }>();
    const movedMailCount = mailsCountRes?.count || 0;

    // 4. 构建 D1 Batch 批处理事务
    const batchStatements: D1PreparedStatement[] = [];

    // 语句 1: 迁移背包所有物品至正式账号（转入行囊，取消穿戴，防止与正式号已穿戴槽位冲突）
    batchStatements.push(
      db
        .prepare('UPDATE inventory SET player_id = ?, is_equipped = 0 WHERE player_id = ?')
        .bind(formalId, guestId)
    );

    // 语句 2: 迁移收件箱邮件
    batchStatements.push(
      db.prepare('UPDATE mails SET receiver_id = ? WHERE receiver_id = ?').bind(formalId, guestId)
    );

    // 语句 3: 迁移发件箱邮件 (如有)
    batchStatements.push(
      db.prepare('UPDATE mails SET sender_id = ? WHERE sender_id = ?').bind(formalId, guestId)
    );

    // 语句 4: 累加货币资产至正式账号
    batchStatements.push(
      db
        .prepare(
          `UPDATE players 
           SET silver = silver + ?, copper = copper + ?, ingot = ingot + ?, updated_at = CURRENT_TIMESTAMP 
           WHERE id = ?`
        )
        .bind(guest.silver, guest.copper, guest.ingot, formalId)
    );

    // 语句 5: 删除原匿名游客账号（保证单设备状态唯一及外键干净）
    batchStatements.push(db.prepare('DELETE FROM players WHERE id = ?').bind(guestId));

    // 5. 执行原子事务
    const batchResults = await db.batch(batchStatements);

    for (const res of batchResults) {
      if (res.error) {
        throw new Error(`账号合并事务失败已回滚: ${res.error}`);
      }
    }

    return {
      mergedSilver: guest.silver,
      mergedCopper: guest.copper,
      mergedIngot: guest.ingot,
      movedItemCount,
      movedMailCount,
    };
  },
};
