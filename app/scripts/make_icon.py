"""生成 1024x1024 App 图标：深色底 + 蓝色闹钟 + 红色告警点。"""

from PIL import Image, ImageDraw
import math

S = 4  # 超采样倍数
W = 1024 * S

img = Image.new("RGB", (W, W), (11, 15, 20))
d = ImageDraw.Draw(img)

# 背景：径向渐变（中心偏亮）
cx, cy = W // 2, int(W * 0.52)
maxr = W * 0.75
steps = 220
for i in range(steps, 0, -1):
    t = i / steps
    r = int(maxr * t)
    col = (
        int(11 + 18 * (1 - t)),
        int(15 + 26 * (1 - t)),
        int(20 + 36 * (1 - t)),
    )
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)

# 时钟圆环
ring_r = int(W * 0.285)
ring_w = int(W * 0.055)
blue = (79, 140, 255)
d.ellipse(
    [cx - ring_r, cy - ring_r, cx + ring_r, cy + ring_r],
    outline=blue,
    width=ring_w,
)

# 刻度点（12/3/6/9 位置）
tick_r = int(W * 0.018)
for ang in (0, 90, 180, 270):
    a = math.radians(ang - 90)
    tx = cx + int((ring_r - ring_w * 1.9) * math.cos(a))
    ty = cy + int((ring_r - ring_w * 1.9) * math.sin(a))
    d.ellipse([tx - tick_r, ty - tick_r, tx + tick_r, ty + tick_r], fill=(140, 170, 220))

# 指针（12 点方向 + 4 点方向，像“到点了”）
def hand(angle_deg, length, width, color):
    a = math.radians(angle_deg - 90)
    ex = cx + int(length * math.cos(a))
    ey = cy + int(length * math.sin(a))
    d.line([cx, cy, ex, ey], fill=color, width=width)
    d.ellipse([ex - width // 2, ey - width // 2, ex + width // 2, ey + width // 2], fill=color)
    d.ellipse([cx - width // 2, cy - width // 2, cx + width // 2, cy + width // 2], fill=color)

hand(0, int(W * 0.155), int(W * 0.030), (232, 238, 246))
hand(120, int(W * 0.205), int(W * 0.024), (232, 238, 246))

# 中心轴
d.ellipse(
    [cx - int(W * 0.028), cy - int(W * 0.028), cx + int(W * 0.028), cy + int(W * 0.028)],
    fill=(79, 140, 255),
)

# 右上角红色告警点
badge_r = int(W * 0.115)
bx, by = int(W * 0.735), int(W * 0.265)
d.ellipse(
    [bx - badge_r, by - badge_r, bx + badge_r, by + badge_r],
    fill=(255, 92, 92),
)
# 叹号：竖条 + 点
bar_w = int(W * 0.030)
bar_top = by - int(W * 0.055)
bar_bot = by + int(W * 0.012)
d.rounded_rectangle(
    [bx - bar_w // 2, bar_top, bx + bar_w // 2, bar_bot],
    radius=bar_w // 2,
    fill=(255, 255, 255),
)
dot_r = int(W * 0.016)
dot_y = by + int(W * 0.045)
d.ellipse([bx - dot_r, dot_y - dot_r, bx + dot_r, dot_y + dot_r], fill=(255, 255, 255))

icon = img.resize((1024, 1024), Image.LANCZOS)
icon.save(r"C:\Users\LEGION\Documents\deepseek-harness\default-workspace\strong-reminder\app\assets\icon.png", "PNG")
print("saved", icon.size)
