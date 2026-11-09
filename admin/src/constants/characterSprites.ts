/**
 * NPC 模板可选的「基础立绘」清单。
 *
 * 图片真源：frontend/public/assets/combat/characters/*_trans.png（已去背景）。
 * 这里只登记能被直接用作头像 / 立绘的透明底角色图，
 * URL 使用游戏前端的公共静态路径，保存进 npc_templates.avatar 后前后端都能直接访问。
 */

export type CharacterSpriteFaction = 'HERO' | 'ENEMY' | 'DEFAULT';

export interface CharacterSpriteOption {
  url: string;
  name: string;
  subtitle: string;
  faction: CharacterSpriteFaction;
}

const SPRITE_DIR = '/assets/combat/characters';

export const CHARACTER_SPRITE_OPTIONS: CharacterSpriteOption[] = [
  {
    url: `${SPRITE_DIR}/hero_cangyun_idle_trans.png`,
    name: '苍云剑客',
    subtitle: '剑修 · 待机',
    faction: 'HERO',
  },
  {
    url: `${SPRITE_DIR}/hero_cangyun_attack_trans.png`,
    name: '苍云剑客',
    subtitle: '剑修 · 出剑',
    faction: 'HERO',
  },
  {
    url: `${SPRITE_DIR}/hero_luoqinghan_trans.png`,
    name: '洛清寒',
    subtitle: '冰修 · 法系',
    faction: 'HERO',
  },
  {
    url: `${SPRITE_DIR}/hero_suningxiang_trans.png`,
    name: '苏凝香',
    subtitle: '医仙 · 治疗',
    faction: 'HERO',
  },
  {
    url: `${SPRITE_DIR}/hero_shieldman_trans.png`,
    name: '重甲卫士',
    subtitle: '肉盾 · 前排',
    faction: 'HERO',
  },
  {
    url: `${SPRITE_DIR}/hero_zixiao_fashi_trans.png`,
    name: '紫霄法师',
    subtitle: '雷法 · 法系',
    faction: 'HERO',
  },
  {
    url: `${SPRITE_DIR}/hero_xuanmen_shushi_trans.png`,
    name: '玄门术士',
    subtitle: '符法 · 控场',
    faction: 'HERO',
  },
  {
    url: `${SPRITE_DIR}/player_default_trans.png`,
    name: '默认侠客',
    subtitle: '通用 · 玩家',
    faction: 'DEFAULT',
  },
  {
    url: `${SPRITE_DIR}/enemy_cultist_trans.png`,
    name: '邪化修士',
    subtitle: '魔修 · 敌方',
    faction: 'ENEMY',
  },
  {
    url: `${SPRITE_DIR}/enemy_firefox_trans.png`,
    name: '赤焰九尾狐',
    subtitle: '妖兽 · 敌方',
    faction: 'ENEMY',
  },
  {
    url: `${SPRITE_DIR}/hero_peixingzhi_trans.png`,
    name: '裴行之',
    subtitle: '青镜司 · 左掌使',
    faction: 'HERO',
  },
  {
    url: `${SPRITE_DIR}/hero_liuruyan_trans.png`,
    name: '柳如烟',
    subtitle: '流景阁 · 大掌柜',
    faction: 'HERO',
  },
  {
    url: `${SPRITE_DIR}/hero_chujuefeng_trans.png`,
    name: '楚绝锋',
    subtitle: '折锋卫 · 统领',
    faction: 'HERO',
  },
  {
    url: `${SPRITE_DIR}/hero_suwanling_trans.png`,
    name: '苏晚菱',
    subtitle: '青囊庐 · 医宗传人',
    faction: 'HERO',
  },
  {
    url: `${SPRITE_DIR}/hero_gumoyuan_trans.png`,
    name: '顾墨渊',
    subtitle: '幽泉暗客 · 首领',
    faction: 'ENEMY',
  },
  {
    url: `${SPRITE_DIR}/hero_yanjiugong_trans.png`,
    name: '严九公',
    subtitle: '听雨茶肆 · 老掌柜',
    faction: 'HERO',
  },
  {
    url: `${SPRITE_DIR}/hero_huochiyan_trans.png`,
    name: '霍赤炎',
    subtitle: '无昼铜坑 · 大工头',
    faction: 'HERO',
  },
  {
    url: `${SPRITE_DIR}/hero_yehanyi_trans.png`,
    name: '叶寒衣',
    subtitle: '落星寒潭 · 守魂孤影',
    faction: 'HERO',
  },
  {
    url: `${SPRITE_DIR}/hero_huajiuxian_trans.png`,
    name: '花玖弦',
    subtitle: '浮生茶庐 · 掌柜',
    faction: 'HERO',
  },
  {
    url: `${SPRITE_DIR}/hero_guyuling_trans.png`,
    name: '顾羽灵',
    subtitle: '破虏亲军 · 副将',
    faction: 'HERO',
  },
];

export const CHARACTER_SPRITE_MAP: Record<string, CharacterSpriteOption> = Object.fromEntries(
  CHARACTER_SPRITE_OPTIONS.map((sprite) => [sprite.url, sprite])
);
