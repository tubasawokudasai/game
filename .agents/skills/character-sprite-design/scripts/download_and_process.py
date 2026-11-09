#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
一键从 Stitch 下载角色、转换格式并执行洪水填充去背景脚本。
用法:
  python3 download_and_process.py --url <downloadUrl> --key <character_key>
"""

import argparse
import base64
import json
import os
import re
import subprocess
import sys
import urllib.request
import urllib.error

KEY_PATTERN = re.compile(r'^[A-Za-z0-9_-]+$')

def find_project_root():
    """向上查找项目根目录（包含 frontend 和 package.json 或 .git）"""
    current = os.path.abspath(os.path.dirname(__file__))
    while current != os.path.dirname(current):
        if os.path.isdir(os.path.join(current, "frontend")) and (
            os.path.isfile(os.path.join(current, "package.json")) or os.path.isdir(os.path.join(current, ".git"))
        ):
            return current
        current = os.path.dirname(current)
    # 回退：脚本所在目录相对向上 4 级 (.agents/skills/character-sprite-design/scripts -> project root)
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))

PROJECT_ROOT = find_project_root()
BASE_DIR = os.path.abspath(os.path.join(PROJECT_ROOT, "frontend/public/assets/combat/characters"))
SCRIPT_PATH = os.path.abspath(os.path.join(PROJECT_ROOT, "frontend/public/assets/combat/process_transparent.py"))

def main():
    parser = argparse.ArgumentParser(description="从 Stitch 下载并处理透明立绘")
    parser.add_argument("--url", required=True, help="Stitch downloadUrl")
    parser.add_argument("--key", required=True, help="角色英文唯一标识（仅允许字母、数字、下划线和连字符）")
    parser.add_argument("--threshold", type=int, default=26, help="抠图色差容差 (默认 26)")
    parser.add_argument("--feather", type=int, default=1, help="边缘羽化半径 (默认 1)")
    parser.add_argument("--bg", default="auto", help="背景色 r,g,b 或 auto")
    parser.add_argument("--force", action="store_true", help="强制覆盖已存在的文件")
    args = parser.parse_args()

    # 1. 角色 key 格式校验
    if not KEY_PATTERN.match(args.key):
        print(f"[!] 错误: 角色 key '{args.key}' 格式不合法！仅允许英文字母、数字、下划线(_)和连字符(-)。", file=sys.stderr)
        sys.exit(1)

    # 2. 从环境变量读取 STITCH_API_KEY
    api_key = os.environ.get("STITCH_API_KEY", "").strip()
    if not api_key:
        print("[!] 错误: 未检测到环境变量 STITCH_API_KEY，请先设置 export STITCH_API_KEY='your_api_key'", file=sys.stderr)
        sys.exit(1)

    # 3. 检查去背景脚本是否存在
    if not os.path.isfile(SCRIPT_PATH):
        print(f"[!] 错误: 未找到去背景脚本: {SCRIPT_PATH}", file=sys.stderr)
        sys.exit(1)

    # 4. 同名文件防覆盖保护
    os.makedirs(BASE_DIR, exist_ok=True)
    jpg_path = os.path.join(BASE_DIR, f"hero_{args.key}.jpg")
    png_path = os.path.join(BASE_DIR, f"hero_{args.key}.png")
    trans_path = os.path.join(BASE_DIR, f"hero_{args.key}_trans.png")

    if not args.force:
        existing_files = [p for p in (jpg_path, png_path, trans_path) if os.path.exists(p)]
        if existing_files:
            print(f"[!] 错误: 已存在同名角色文件，已阻止覆盖: {', '.join(existing_files)}", file=sys.stderr)
            print("[*] 提示: 请使用新的角色 key，或在确认替换时传入 --force 参数。", file=sys.stderr)
            sys.exit(1)

    # 5. 下载响应和 Base64 数据校验（带超时设置）
    print(f"[*] 正在从 Stitch 下载素材: {args.url[:60]}...")
    req = urllib.request.Request(args.url, headers={"X-Goog-Api-Key": api_key})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw_body = resp.read().decode("utf-8")
            data = json.loads(raw_body)
    except urllib.error.HTTPError as e:
        print(f"[!] 下载失败: HTTP {e.code} - {e.reason}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"[!] 下载请求异常: {e.reason}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"[!] 下载响应解析 JSON 失败: {e}", file=sys.stderr)
        sys.exit(1)

    if not isinstance(data, dict) or "dataString" not in data:
        print("[!] 错误: Stitch 返回数据格式异常，缺少 'dataString' 字段！", file=sys.stderr)
        sys.exit(1)

    try:
        img_bytes = base64.b64decode(data["dataString"])
        if not img_bytes:
            print("[!] 错误: 解码后的图片数据为空！", file=sys.stderr)
            sys.exit(1)
    except Exception as e:
        print(f"[!] Base64 解码图片数据失败: {e}", file=sys.stderr)
        sys.exit(1)

    with open(jpg_path, "wb") as f:
        f.write(img_bytes)
    print(f"[+] 下载完成: {jpg_path} ({len(img_bytes)} bytes)")

    # 6. 使用 macOS sips 工具转换 PNG（明确依赖 macOS）
    if sys.platform != "darwin":
        print(f"[!] 警告: 当前系统为 {sys.platform}，sips 工具是 macOS 专属命令。", file=sys.stderr)
    print("[*] 正在转换格式至 PNG (使用 macOS sips)...")
    try:
        subprocess.run(["sips", "-s", "format", "png", jpg_path, "--out", png_path], check=True, stdout=subprocess.DEVNULL)
    except FileNotFoundError:
        print("[!] 错误: 未找到 'sips' 命令。当前转换方案依赖 macOS 自带的 sips 工具，请在 macOS 环境下运行或安装相应转换支持。", file=sys.stderr)
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        print(f"[!] sips 格式转换执行失败: {e}", file=sys.stderr)
        sys.exit(1)
    print(f"[+] PNG 转换就绪: {png_path}")

    # 7. 调用 process_transparent.py 进行边缘采样洪水填充与羽化
    print(f"[*] 正在执行四角自动采样洪水填充边缘去背景 (容差={args.threshold}, 羽化={args.feather})...")
    try:
        subprocess.run([
            sys.executable, SCRIPT_PATH, png_path, trans_path,
            "--bg", args.bg,
            "--threshold", str(args.threshold),
            "--feather", str(args.feather)
        ], check=True)
    except subprocess.CalledProcessError as e:
        print(f"[!] 去背景处理执行失败: {e}", file=sys.stderr)
        sys.exit(1)

    # 8. 严格校验输出文件存在且大于 0 字节
    if not os.path.exists(trans_path) or os.path.getsize(trans_path) == 0:
        print(f"[!] 错误: 最终立绘文件生成失败或大小为 0 字节: {trans_path}", file=sys.stderr)
        sys.exit(1)

    print(f"[√] 最终透明立绘已生成: {trans_path} ({os.path.getsize(trans_path)} bytes)")

if __name__ == "__main__":
    main()

