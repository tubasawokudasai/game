#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
战斗立绘去背景脚本（纯标准库实现，不依赖 Pillow）

原理：
1. 解码 PNG 的 RGB / RGBA 扫描线；
2. 从图像四边向内做「洪水填充」，只删除与边缘连通、且颜色接近背景色的像素；
   相比全图颜色阈值，能保住深色头发、靴子、衣纹等靠近背景色的角色内部细节；
3. 对 alpha 通道做 3x3 羽化，避免硬边；
4. 重新编码为 RGBA PNG。

用法：
  python3 process_transparent.py <input.png> <output.png> [--threshold 18] [--feather 1]
  python3 process_transparent.py <input.png>            # 输出到 <input>_trans.png
  python3 process_transparent.py                        # 批量处理 characters/ 目录

示例：
  python3 process_transparent.py "/path/player.png" \
      frontend/public/assets/combat/characters/player_default_trans.png
"""

import argparse
import os
import struct
import zlib


def _decode_png_rgb(path):
    with open(path, 'rb') as f:
        data = f.read()

    offset = 8
    width, height = 0, 0
    bit_depth = 8
    color_type = 2
    idat = bytearray()

    while offset < len(data):
        length, chunk_type = struct.unpack('>I4s', data[offset:offset + 8])
        chunk_data = data[offset + 8:offset + 8 + length]
        offset += 12 + length
        if chunk_type == b'IHDR':
            width, height, bit_depth, color_type = struct.unpack('>IIBB', chunk_data[:10])
        elif chunk_type == b'IDAT':
            idat.extend(chunk_data)

    if bit_depth != 8 or color_type not in (2, 4):
        raise ValueError(
            f'仅支持 8-bit RGB/RGBA PNG（当前 bit_depth={bit_depth}, color_type={color_type}）'
        )

    raw = zlib.decompress(idat)
    bpp = 3 if color_type == 2 else 4
    scanline_len = width * bpp
    rgb = bytearray(width * height * 3)

    prev_row = bytearray(scanline_len)
    current_row = bytearray(scanline_len)
    raw_offset = 0

    for y in range(height):
        filter_type = raw[raw_offset]
        raw_offset += 1
        row_bytes = raw[raw_offset:raw_offset + scanline_len]
        raw_offset += scanline_len

        if filter_type == 0:  # None
            current_row[:] = row_bytes
        elif filter_type == 1:  # Sub
            for i in range(scanline_len):
                left = current_row[i - bpp] if i >= bpp else 0
                current_row[i] = (row_bytes[i] + left) & 0xFF
        elif filter_type == 2:  # Up
            for i in range(scanline_len):
                current_row[i] = (row_bytes[i] + prev_row[i]) & 0xFF
        elif filter_type == 3:  # Average
            for i in range(scanline_len):
                left = current_row[i - bpp] if i >= bpp else 0
                up = prev_row[i]
                current_row[i] = (row_bytes[i] + ((left + up) >> 1)) & 0xFF
        elif filter_type == 4:  # Paeth
            for i in range(scanline_len):
                a = current_row[i - bpp] if i >= bpp else 0
                b = prev_row[i]
                c = prev_row[i - bpp] if i >= bpp else 0
                p = a + b - c
                pa = abs(p - a)
                pb = abs(p - b)
                pc = abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                current_row[i] = (row_bytes[i] + pr) & 0xFF
        else:
            raise ValueError(f'不支持的 PNG 行过滤器: {filter_type}')

        dst_base = y * width * 3
        for x in range(width):
            src = x * bpp
            dst = dst_base + x * 3
            rgb[dst] = current_row[src]
            rgb[dst + 1] = current_row[src + 1]
            rgb[dst + 2] = current_row[src + 2]

        prev_row[:] = current_row

    return width, height, rgb


def _background_alpha(width, height, rgb, bg_color, threshold, feather):
    """从四边洪水填充背景，返回 alpha 通道。"""
    br, bgc, bb = bg_color
    threshold_sq = threshold * threshold
    total_pixels = width * height
    is_bg = bytearray(total_pixels)
    stack = []

    def is_close(idx):
        base = idx * 3
        dr = rgb[base] - br
        dg = rgb[base + 1] - bgc
        db = rgb[base + 2] - bb
        return dr * dr + dg * dg + db * db <= threshold_sq

    # 以四边所有接近背景色的像素为种子
    for x in range(width):
        for y in (0, height - 1):
            idx = y * width + x
            if not is_bg[idx] and is_close(idx):
                is_bg[idx] = 1
                stack.append(idx)
    for y in range(height):
        for x in (0, width - 1):
            idx = y * width + x
            if not is_bg[idx] and is_close(idx):
                is_bg[idx] = 1
                stack.append(idx)

    # 4 邻域洪水填充：只穿过与背景色接近的连通像素
    while stack:
        idx = stack.pop()
        x = idx % width
        y = idx // width

        if x > 0:
            n = idx - 1
            if not is_bg[n] and is_close(n):
                is_bg[n] = 1
                stack.append(n)
        if x < width - 1:
            n = idx + 1
            if not is_bg[n] and is_close(n):
                is_bg[n] = 1
                stack.append(n)
        if y > 0:
            n = idx - width
            if not is_bg[n] and is_close(n):
                is_bg[n] = 1
                stack.append(n)
        if y < height - 1:
            n = idx + width
            if not is_bg[n] and is_close(n):
                is_bg[n] = 1
                stack.append(n)

    alpha = bytearray(total_pixels)
    for i in range(total_pixels):
        alpha[i] = 0 if is_bg[i] else 255

    # 3x3 均值羽化（只影响边缘，内部仍为 255）
    if feather > 0:
        blurred = bytearray(total_pixels)
        for y in range(height):
            y0 = y - 1 if y > 0 else 0
            y1 = y + 2 if y < height - 1 else height
            for x in range(width):
                x0 = x - 1 if x > 0 else 0
                x1 = x + 2 if x < width - 1 else width
                total = 0
                count = 0
                for yy in range(y0, y1):
                    base = yy * width
                    for xx in range(x0, x1):
                        total += alpha[base + xx]
                        count += 1
                blurred[y * width + x] = total // count
        alpha = blurred

    return alpha


def _encode_rgba_png(path, width, height, rgb, alpha):
    out_scanlines = bytearray()
    for y in range(height):
        out_scanlines.append(0)  # Filter None
        row_base = y * width
        for x in range(width):
            idx = row_base + x
            out_scanlines.append(rgb[idx * 3])
            out_scanlines.append(rgb[idx * 3 + 1])
            out_scanlines.append(rgb[idx * 3 + 2])
            out_scanlines.append(alpha[idx])

    compressed = zlib.compress(out_scanlines, level=6)

    def chunk(chunk_type, chunk_data):
        body = chunk_type + chunk_data
        crc = zlib.crc32(body) & 0xFFFFFFFF
        return struct.pack('>I', len(chunk_data)) + body + struct.pack('>I', crc)

    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    png = (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', ihdr_data)
        + chunk(b'IDAT', compressed)
        + chunk(b'IEND', b'')
    )
    with open(path, 'wb') as f:
        f.write(png)
    print(f'Done: {path} ({os.path.getsize(path)} bytes)')


def sample_corner_bg(width, height, rgb, patch_size=10):
    """自动采样图像四角计算实际背景均值 RGB。"""
    samples = []
    corners = [(0, 0), (max(0, width - patch_size), 0), (0, max(0, height - patch_size)), (max(0, width - patch_size), max(0, height - patch_size))]
    for cx, cy in corners:
        for dy in range(patch_size):
            for dx in range(patch_size):
                idx = (cy + dy) * width + (cx + dx)
                samples.append((rgb[idx * 3], rgb[idx * 3 + 1], rgb[idx * 3 + 2]))
    if not samples:
        return (46, 49, 54)
    r = sum(s[0] for s in samples) // len(samples)
    g = sum(s[1] for s in samples) // len(samples)
    b = sum(s[2] for s in samples) // len(samples)
    return (r, g, b)


def remove_background(in_path, out_path, bg_color=None, threshold=26, feather=1):
    width, height, rgb = _decode_png_rgb(in_path)
    if bg_color is None:
        bg_color = sample_corner_bg(width, height, rgb)
        print(f'自动采样背景色: RGB={bg_color}')
    alpha = _background_alpha(width, height, rgb, bg_color, threshold, feather)
    _encode_rgba_png(out_path, width, height, rgb, alpha)
    return width, height


def _parse_bg(value):
    if not value or value.lower() == 'auto':
        return None
    parts = [int(p.strip()) for p in value.split(',')]
    if len(parts) != 3:
        raise ValueError('--bg 需为 auto 或 r,g,b 三个 0-255 整数')
    return tuple(parts)


def main():
    parser = argparse.ArgumentParser(description='战斗立绘去背景（洪水填充 + alpha 羽化）')
    parser.add_argument('input', nargs='?', help='输入 PNG；省略则批量处理 characters/ 目录')
    parser.add_argument('output', nargs='?', help='输出 PNG；省略则为 <input>_trans.png')
    parser.add_argument('--bg', default='auto', help='背景色 r,g,b 或 auto（默认 auto 自动采样四角背景）')
    parser.add_argument('--threshold', type=int, default=26, help='背景色容差（默认 26）')
    parser.add_argument('--feather', type=int, default=1, help='alpha 羽化半径（默认 1，0 关闭）')
    args = parser.parse_args()

    bg = _parse_bg(args.bg)

    if args.input:
        output = args.output or os.path.splitext(args.input)[0] + '_trans.png'
        remove_background(args.input, output, bg, args.threshold, args.feather)
        return

    # 批量模式：脚本所在目录下的 characters/
    script_dir = os.path.dirname(os.path.abspath(__file__))
    dir_path = os.path.join(script_dir, 'characters')
    if not os.path.isdir(dir_path):
        raise SystemExit(f'未找到角色目录: {dir_path}')
    for name in sorted(os.listdir(dir_path)):
        if name.endswith('.png') and not name.endswith('_trans.png'):
            in_path = os.path.join(dir_path, name)
            out_path = os.path.join(dir_path, name.replace('.png', '_trans.png'))
            print(f'Processing {name}...')
            remove_background(in_path, out_path, bg, args.threshold, args.feather)


if __name__ == '__main__':
    main()
