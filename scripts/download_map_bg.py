#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 Google Stitch 下载地图底图并转换为 PNG 格式。
用法:
  python3 download_map_bg.py --url "<downloadUrl>" --key "<scene_key>"
  或
  python3 download_map_bg.py "<downloadUrl>" "<scene_key>"
"""

import sys, os, urllib.request, urllib.error, json, base64, subprocess, argparse

def find_project_root():
    current = os.path.abspath(os.path.dirname(__file__))
    while current != os.path.dirname(current):
        if os.path.isdir(os.path.join(current, "frontend")) and (
            os.path.isfile(os.path.join(current, "package.json")) or os.path.isdir(os.path.join(current, ".git"))
        ):
            return current
        current = os.path.dirname(current)
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))

def main():
    parser = argparse.ArgumentParser(description="从 Stitch 下载地图底图并转为 PNG")
    parser.add_argument("pos_url", nargs="?", help="Stitch downloadUrl (位置参数)")
    parser.add_argument("pos_key", nargs="?", help="场景唯一 key (位置参数)")
    parser.add_argument("--url", dest="opt_url", help="Stitch downloadUrl")
    parser.add_argument("--key", dest="opt_key", help="场景唯一 key")
    args = parser.parse_args()

    url = args.opt_url or args.pos_url
    scene_key = args.opt_key or args.pos_key

    if not url or not scene_key:
        print("[!] 用法: python3 download_map_bg.py --url <downloadUrl> --key <scene_key>", file=sys.stderr)
        sys.exit(1)

    api_key = os.environ.get("STITCH_API_KEY", "").strip()
    if not api_key:
        print("[!] 错误: 未检测到环境变量 STITCH_API_KEY，请先设置 export STITCH_API_KEY='your_api_key'", file=sys.stderr)
        sys.exit(1)

    project_root = find_project_root()
    out_dir = os.path.join(project_root, "frontend/public/assets/maps")
    os.makedirs(out_dir, exist_ok=True)
    tmp_jpg = os.path.join(out_dir, f"{scene_key}_bg.jpg")
    out_png = os.path.join(out_dir, f"{scene_key}_bg.png")

    print(f"[*] 正在从 Stitch 下载地图底图素材: {url[:60]}...")
    req = urllib.request.Request(url, headers={"X-Goog-Api-Key": api_key})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"[!] 下载失败: HTTP {e.code} - {e.reason}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"[!] 请求异常: {e.reason}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"[!] 响应 JSON 解析失败: {e}", file=sys.stderr)
        sys.exit(1)

    if not isinstance(data, dict) or "dataString" not in data:
        print("[!] 错误: Stitch 返回数据缺少 'dataString' 字段", file=sys.stderr)
        sys.exit(1)

    try:
        img_bytes = base64.b64decode(data["dataString"])
        if not img_bytes:
            print("[!] 错误: 解码后的图片数据为空！", file=sys.stderr)
            sys.exit(1)
    except Exception as e:
        print(f"[!] Base64 解码失败: {e}", file=sys.stderr)
        sys.exit(1)

    with open(tmp_jpg, "wb") as f:
        f.write(img_bytes)

    print(f"[*] 正在转换格式至 PNG (使用 macOS sips)...")
    try:
        subprocess.run(["sips", "-s", "format", "png", tmp_jpg, "--out", out_png], check=True, stdout=subprocess.DEVNULL)
    except FileNotFoundError:
        print("[!] 错误: 未找到 'sips' 命令，该转换依赖 macOS 原生 sips 工具", file=sys.stderr)
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        print(f"[!] sips 格式转换执行失败: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        if os.path.exists(tmp_jpg):
            os.remove(tmp_jpg)

    # 严格校验文件存在且大于 0 字节
    if not os.path.exists(out_png) or os.path.getsize(out_png) == 0:
        print(f"[!] 错误: 地图底图生成失败或文件为 0 字节: {out_png}", file=sys.stderr)
        sys.exit(1)

    file_size = os.path.getsize(out_png)
    print(f"[√] 地图底图保存成功: {out_png} ({file_size} bytes)")

if __name__ == "__main__":
    main()
