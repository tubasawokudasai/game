#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
一键全量清空游戏世界数据脚本（地图场景、NPC 模板、世界 NPC 实例、剧情剧本、战斗战阵与生成立绘）。
用法:
  python3 scripts/clear_world_data.py [--clean-assets]
"""

import argparse
import glob
import os
import re
import sqlite3
import subprocess
import sys

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
D1_DIR = os.path.join(BASE_DIR, "backend/.wrangler/state/v3/d1/miniflare-D1DatabaseObject")
FRONTEND_CHARS_DIR = os.path.join(BASE_DIR, "frontend/public/assets/combat/characters")
ADMIN_CHARS_DIR = os.path.join(BASE_DIR, "admin/dist/assets/combat/characters")
FRONTEND_DIST_CHARS_DIR = os.path.join(BASE_DIR, "frontend/dist/assets/combat/characters")
SPRITES_TS_PATH = os.path.join(BASE_DIR, "admin/src/constants/characterSprites.ts")

# 必须保留的系统底包内置立绘（严禁误删）
DEFAULT_PRESET_SPRITES = {
    "enemy_cultist.png",
    "enemy_cultist_trans.png",
    "enemy_firefox.png",
    "enemy_firefox_trans.png",
    "hero_cangyun_attack.png",
    "hero_cangyun_attack_trans.png",
    "hero_cangyun_idle.png",
    "hero_cangyun_idle_trans.png",
    "hero_luoqinghan.png",
    "hero_luoqinghan_trans.png",
    "hero_shieldman.png",
    "hero_shieldman_trans.png",
    "hero_suningxiang.png",
    "hero_suningxiang_trans.png",
    "hero_xuanmen_shushi_trans.png",
    "hero_zixiao_fashi_trans.png",
    "player_default_trans.png",
}

CLEAR_TABLES_SQL = """
PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

-- 1. 地图场景（保留根世界全貌地图 scene_jiuzhou_world，清理其下动态创建的各级子场景）
DELETE FROM scenes WHERE id != 'scene_jiuzhou_world';

-- 若根地图不存在，则初始化创建根地图节点
INSERT OR IGNORE INTO scenes (
    id, zone_id, name, region, level, parent_id, icon, coord_x, coord_y,
    status_desc, tag, subtitle, thumb, background_url, description, feature, cost_desc, btn_text
) VALUES (
    'scene_jiuzhou_world',
    'changle_city',
    '九州全界',
    '九州全界',
    1,
    NULL,
    'public',
    256,
    256,
    '大千世界 · 九州太虚',
    '',
    '天地玄黄，宇宙洪荒',
    '',
    'https://lh3.googleusercontent.com/aida-public/AB6AXuAaluVIbdGEpLZTED-WOD96wXSIv_jp4Aa5S2P1PvakKJk3iUBCQ_iBZvFG20ptkgvkDrVQRp2kvz9XrDv3GrTlQaawFbBzrhu2-R6YpH7tbQmHWqKBPTCjqJvEE8KsS3oH73gj042f2oPT5SHAMb9bOHIWT6YCwpy0TH6zU48g0z4Jp-io3B3XWRekZZsXJq5Q8Z4SKHgQN2sBPQXRiE5Fx0-ftfk_hE_QY6UL8zdh',
    '东方古典修仙九州大千世界全景全貌，万宗林立，仙凡交织，通衢八达。',
    '',
    '行步耗时：无',
    '纵览九州'
);

-- 2. NPC 实例与模板
DELETE FROM npc_instances;
DELETE FROM npc_templates;

-- 3. 战斗怪物组
DELETE FROM monster_group_members;
DELETE FROM monster_groups;

-- 4. 预设立绘与资产库
DELETE FROM preset_assets;

-- 5. 剧情剧本与对话路由
DELETE FROM dialogue_options;
DELETE FROM dialogue_nodes;
DELETE FROM dialogue_entry_nodes;
DELETE FROM npc_dialogue_routers;
DELETE FROM dialogue_packages;

-- 6. 玩家与剧情/NPC/遭遇状态
DELETE FROM player_dialogue_flags;
DELETE FROM player_encounter_state;
DELETE FROM player_story_progress;

COMMIT;
PRAGMA foreign_keys = ON;
"""


def clear_databases():
    sqlite_files = glob.glob(os.path.join(D1_DIR, "*.sqlite"))
    # 过滤出真实 D1 数据文件（排除 metadata 和备份文件）
    target_dbs = [
        f for f in sqlite_files
        if not os.path.basename(f).startswith("metadata")
        and not os.path.basename(f).startswith("backup")
    ]

    if not target_dbs:
        print("[!] 未找到任何本地 D1 SQLite 数据库文件。")
        return

    print(f"[*] 找到 {len(target_dbs)} 个本地 D1 数据库文件，正在清空数据...")
    for db_path in target_dbs:
        try:
            conn = sqlite3.connect(db_path)
            conn.executescript(CLEAR_TABLES_SQL)
            conn.close()
            print(f"  [√] 已清空数据库: {os.path.basename(db_path)}")
        except Exception as e:
            print(f"  [x] 清空数据库 {os.path.basename(db_path)} 失败: {e}")


def clean_generated_assets():
    print("[*] 正在扫描并清理动态生成的非内置角色立绘...")
    deleted_count = 0
    for target_dir in [FRONTEND_CHARS_DIR, ADMIN_CHARS_DIR, FRONTEND_DIST_CHARS_DIR]:
        if not os.path.isdir(target_dir):
            continue
        for fname in os.listdir(target_dir):
            if fname not in DEFAULT_PRESET_SPRITES and (fname.endswith(".png") or fname.endswith(".jpg")):
                fpath = os.path.join(target_dir, fname)
                try:
                    os.remove(fpath)
                    deleted_count += 1
                except Exception as e:
                    print(f"  [!] 删除文件 {fpath} 失败: {e}")
    print(f"  [√] 已清理 {deleted_count} 个动态生成的立绘素材。")

    # 清理 characterSprites.ts 中非默认立绘登记项
    if os.path.isfile(SPRITES_TS_PATH):
        try:
            with open(SPRITES_TS_PATH, "r", encoding="utf-8") as f:
                content = f.read()

            # 仅保留 DEFAULT_PRESET_SPRITES 里的清单，恢复为基础列表
            clean_ts = """/**
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
];

export const CHARACTER_SPRITE_MAP: Record<string, CharacterSpriteOption> = Object.fromEntries(
  CHARACTER_SPRITE_OPTIONS.map((sprite) => [sprite.url, sprite])
);
"""
            with open(SPRITES_TS_PATH, "w", encoding="utf-8") as f:
                f.write(clean_ts)
            print("  [√] 已将 admin/src/constants/characterSprites.ts 重置为干净基础清单。")
        except Exception as e:
            print(f"  [!] 重置 characterSprites.ts 失败: {e}")


def main():
    parser = argparse.ArgumentParser(description="一键全量清空游戏世界数据与动态立绘")
    parser.add_argument("--clean-assets", action="store_true", default=True, help="同时清理动态生成的角色原图与透明图文件")
    args = parser.parse_args()

    print("==================================================")
    print(" 正在执行全量世界数据清空程序...")
    print("==================================================")
    clear_databases()

    if args.clean_assets:
        clean_generated_assets()

    print("\n[√] 全部清空完成！当前地图、NPC、模板与剧情数据已归零。")


if __name__ == "__main__":
    main()
