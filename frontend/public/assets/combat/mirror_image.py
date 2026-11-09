#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
图片原地镜像翻转工具

支持单张图片或批量图片的原地镜像（水平翻转/垂直翻转）。
- 优先使用 Pillow (PIL) 库；
- 若未安装 Pillow，在 macOS 环境下自动使用系统自带的 `sips` 工具；
- 默认进行水平镜像（左右对调），常用于角色立绘、NPC 朝向调整。

用法：
  # 1. 作为模块导入使用
  from mirror_image import mirror_image
  mirror_image("characters/hero_cangyun_idle.png")

  # 2. 命令行直接执行
  python3 mirror_image.py <图片路径1> [图片路径2 ...]
  python3 mirror_image.py characters/hero_*.png
  python3 mirror_image.py characters/enemy_guard.png --direction horizontal
  python3 mirror_image.py characters/enemy_guard.png --direction vertical
  python3 mirror_image.py characters/enemy_guard.png --backup
"""

import os
import sys
import shutil
import argparse
import subprocess

try:
    from PIL import Image
    HAS_PILLOW = True
except ImportError:
    HAS_PILLOW = False


def _mirror_with_pillow(file_path: str, direction: str) -> None:
    """使用 Pillow 原地翻转图片（支持 PNG、JPG、WEBP 等全部格式，保留透明通道）"""
    with Image.open(file_path) as img:
        img_format = img.format
        img_info = img.info.copy()

        # 确定翻转模式
        if direction == "horizontal":
            transpose_method = Image.Transpose.FLIP_LEFT_RIGHT
        else:
            transpose_method = Image.Transpose.FLIP_TOP_BOTTOM

        # 翻转并载入内存
        flipped = img.transpose(transpose_method)
        flipped.load()

        # 使用临时文件写入后原子替换，防止原地覆写出现文件损坏
        temp_file = f"{file_path}.tmp_mirror"
        save_kwargs = {}
        if img_format:
            save_kwargs["format"] = img_format
        if "transparency" in img_info:
            save_kwargs["transparency"] = img_info["transparency"]

        flipped.save(temp_file, **save_kwargs)
        os.replace(temp_file, file_path)


def _mirror_with_sips(file_path: str, direction: str) -> None:
    """使用 macOS 自带的 sips 原地翻转图片"""
    sips_dir = "horizontal" if direction == "horizontal" else "vertical"
    res = subprocess.run(
        ["sips", "-f", sips_dir, file_path],
        capture_output=True,
        text=True
    )
    if res.returncode != 0:
        raise RuntimeError(f"sips 处理失败: {res.stderr.strip()}")


def mirror_image(image_path: str, direction: str = "horizontal", backup: bool = False) -> bool:
    """
    原地镜像指定图片。

    :param image_path: 图片路径（相对路径或绝对路径）
    :param direction: 'horizontal'（水平镜像/左右翻转，默认）或 'vertical'（垂直镜像/上下翻转）
    :param backup: 是否在翻转前保留 `.bak` 备份文件
    :return: 成功返回 True，失败返回 False
    """
    if not os.path.isfile(image_path):
        print(f"[-] 文件不存在: {image_path}", file=sys.stderr)
        return False

    direction = direction.lower().strip()
    if direction in ("h", "horizontal", "lr", "left-right"):
        norm_direction = "horizontal"
    elif direction in ("v", "vertical", "tb", "top-bottom"):
        norm_direction = "vertical"
    else:
        raise ValueError(f"不支持的镜像方向: {direction}，请使用 'horizontal' 或 'vertical'")

    # 如果需要备份
    if backup:
        backup_path = f"{image_path}.bak"
        shutil.copy2(image_path, backup_path)
        print(f"[i] 已生成备份: {backup_path}")

    try:
        if HAS_PILLOW:
            _mirror_with_pillow(image_path, norm_direction)
        elif shutil.which("sips"):
            _mirror_with_sips(image_path, norm_direction)
        else:
            raise RuntimeError(
                "未找到图片处理引擎：请安装 Pillow (`pip install Pillow`)，或者在 macOS 系统下运行。"
            )

        dir_desc = "水平翻转 (左右)" if norm_direction == "horizontal" else "垂直翻转 (上下)"
        print(f"[✓] 原地镜像成功 [{dir_desc}]: {image_path}")
        return True
    except Exception as e:
        print(f"[✗] 镜像图片失败 {image_path}: {e}", file=sys.stderr)
        return False


def mirror_images(paths: list, direction: str = "horizontal", backup: bool = False) -> dict:
    """批量原地镜像图片"""
    results = {}
    for p in paths:
        results[p] = mirror_image(p, direction=direction, backup=backup)
    return results


def main():
    parser = argparse.ArgumentParser(
        description="原地镜像翻转图片工具（默认水平镜像，左右调转）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""示例：
  python3 mirror_image.py characters/hero_cangyun_idle.png
  python3 mirror_image.py characters/hero_*.png --direction horizontal
  python3 mirror_image.py characters/enemy_cultist.png --backup
"""
    )
    parser.add_argument(
        "images",
        nargs="+",
        help="要原地翻转的图片路径（支持多个文件路径或通配符）"
    )
    parser.add_argument(
        "-d", "--direction",
        choices=["horizontal", "vertical", "h", "v"],
        default="horizontal",
        help="镜像方向：horizontal (水平镜像/左右，默认) 或 vertical (垂直镜像/上下)"
    )
    parser.add_argument(
        "-b", "--backup",
        action="store_true",
        help="在翻转修改原图之前，生成一份同名 .bak 备份文件"
    )

    args = parser.parse_args()

    success_count = 0
    fail_count = 0

    for img_path in args.images:
        ok = mirror_image(img_path, direction=args.direction, backup=args.backup)
        if ok:
            success_count += 1
        else:
            fail_count += 1

    print(f"\n处理完成: 成功 {success_count} 个, 失败 {fail_count} 个。")
    if fail_count > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
