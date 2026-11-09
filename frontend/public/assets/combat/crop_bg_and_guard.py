import subprocess
import os

ref_img = "/Users/wjb/WebstormProjects/game/frontend/public/assets/combat/bg/battle_stage_ref.jpg"
guard_out = "/Users/wjb/WebstormProjects/game/frontend/public/assets/combat/characters/enemy_guard.png"
bg_out = "/Users/wjb/WebstormProjects/game/frontend/public/assets/combat/bg/battle_bg.jpg"

# 1. 裁剪背景图 (从 top 80 到 700 区域，涵盖迷雾森林与石阵地面)
# sips -c <pixelsH> <pixelsW>
# 使用 Python 标准库切图或 sips
# 我们可以直接用 Python 或 sips
