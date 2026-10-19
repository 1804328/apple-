"""重画 App 图标：深色渐变 + 闹钟 + 红色提醒角标。"""

from PIL import Image, ImageDraw
import math

S = 3
W = 1024 * S
CX, CY = W // 2, int(W * 0.53)

img = Image.new("RGB", (W, W), (8, 11, 16))
d = ImageDraw.Draw(img)

# 垂直渐变背景
top = (23, 37, 62)
bottom = (8, 11, 16)
for y in range(W):
    t = y / (W - 1)
    d.line(
        [(0, y), (W, y)],
        fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)),
    )

# 中心柔光：与背景同色，仅极轻微提亮，避免出现可见的圆形边界
bg_at_center = (17, 27, 47)
for i in range(90, 0, -1):
    t = i / 90
    r = int(W * 0.58 * t)
    k = (1 - t) ** 2
    col = (
        int(bg_at_center[0] + 5 * k),
        int(bg_at_center[1] + 7 * k),
        int(bg_at_center[2] + 12 * k),
    )
    d.ellipse([CX - r, CY - r, CX + r, CY + r], fill=col)

BLUE = (91, 155, 255)
BLUE_LIGHT = (140, 190, 255)
WHITE = (240, 246, 255)
RED = (255, 86, 86)

ring_r = int(W * 0.285)
ring_w = int(W * 0.072)


def capsule(p1, p2, width, color):
    d.line([p1, p2], fill=color, width=width)
    r = width // 2
    for (x, y) in (p1, p2):
        d.ellipse([x - r, y - r, x + r, y + r], fill=color)


# 铃铛：顶部左右两侧的短胶囊，沿径向朝外
bell_angle = math.radians(38)
bell_w = int(W * 0.082)
for side in (-1, 1):
    dx = side * math.sin(bell_angle)
    dy = -math.cos(bell_angle)
    start_d = ring_r - ring_w * 0.2
    end_d = ring_r + ring_w * 0.95
    p1 = (CX + int(dx * start_d), CY + int(dy * start_d))
    p2 = (CX + int(dx * end_d), CY + int(dy * end_d))
    capsule(p1, p2, bell_w, BLUE)

# 支脚
capsule(
    (CX - int(W * 0.175), CY + int(W * 0.245)),
    (CX - int(W * 0.255), CY + int(W * 0.345)),
    int(W * 0.062),
    BLUE,
)
capsule(
    (CX + int(W * 0.175), CY + int(W * 0.245)),
    (CX + int(W * 0.255), CY + int(W * 0.345)),
    int(W * 0.062),
    BLUE,
)

# 表盘圆环
d.ellipse(
    [CX - ring_r, CY - ring_r, CX + ring_r, CY + ring_r],
    outline=BLUE,
    width=ring_w,
)

# 刻度点
tick_r = int(W * 0.016)
for ang in (0, 90, 180, 270):
    a = math.radians(ang - 90)
    tx = CX + int((ring_r - ring_w * 2.1) * math.cos(a))
    ty = CY + int((ring_r - ring_w * 2.1) * math.sin(a))
    d.ellipse([tx - tick_r, ty - tick_r, tx + tick_r, ty + tick_r], fill=BLUE_LIGHT)

# 指针
def hand(angle_deg, length, width):
    a = math.radians(angle_deg - 90)
    ex = CX + int(length * math.cos(a))
    ey = CY + int(length * math.sin(a))
    capsule((CX, CY), (ex, ey), width, WHITE)

hand(0, int(W * 0.15), int(W * 0.034))
hand(120, int(W * 0.2), int(W * 0.027))

# 中心轴
cr = int(W * 0.032)
d.ellipse([CX - cr, CY - cr, CX + cr, CY + cr], fill=BLUE_LIGHT)

# 红色角标 + 感叹号
badge_r = int(W * 0.1)
bx, by = int(W * 0.78), int(W * 0.145)
d.ellipse([bx - badge_r, by - badge_r, bx + badge_r, by + badge_r], fill=RED)

bar_w = int(W * 0.032)
bar_top = by - int(W * 0.058)
bar_bot = by + int(W * 0.012)
d.rounded_rectangle(
    [bx - bar_w // 2, bar_top, bx + bar_w // 2, bar_bot],
    radius=bar_w // 2,
    fill=WHITE,
)
dot_r = int(W * 0.017)
dot_y = by + int(W * 0.046)
d.ellipse([bx - dot_r, dot_y - dot_r, bx + dot_r, dot_y + dot_r], fill=WHITE)

icon = img.resize((1024, 1024), Image.LANCZOS)
icon.save(
    r"C:\Users\LEGION\Documents\deepseek-harness\default-workspace\strong-reminder\app\assets\icon.png",
    "PNG",
)
print("saved", icon.size)
