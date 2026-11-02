"""
Genera los iconos PWA y el favicon a partir de public/logo-mark.svg.

    python3 scripts/generate-icons.py

Solo necesita Pillow. Lee las formas del SVG (círculo y trazados con M/L/H/V/Q/Z
absolutos), las dibuja a 8x y reduce con LANCZOS para suavizar los bordes.

- icons/icon-*.png: cuadrado opaco #0B0D12 a sangre (iOS no admite transparencia
  y Android aplica su propia máscara), figura blanca y flecha #3D8CFF (el azul del logo aclarado para fondo oscuro). El símbolo
  ocupa el 62 % del ancho, dentro de la zona segura de los iconos maskable.
- icons/badge-72x72.png: silueta blanca sobre transparente (las insignias de
  notificación de Android solo usan el canal alfa).
- favicon.ico (16/32/48): igual que public/icon.svg, cuadrado redondeado.
"""
import math
import re
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / 'public'
SS = 8  # supermuestreo

INK = '#0B0D12'
WHITE = '#FFFFFF'
ARROW_ON_DARK = '#3D8CFF'
STROKE = 3  # grosor del trazo en unidades del viewBox, como public/icon.svg


def load_mark(path):
    """Devuelve el viewBox y la lista de formas: (tipo, datos, es_flecha)."""
    root = ET.parse(path).getroot()
    base_fill = root.get('fill')
    view_box = [float(v) for v in root.get('viewBox').split()]
    shapes = []
    for el in root:
        tag = el.tag.split('}')[-1]
        is_arrow = el.get('fill', base_fill) != base_fill
        if tag == 'circle':
            shapes.append(('circle', (float(el.get('cx')), float(el.get('cy')), float(el.get('r'))), is_arrow))
        elif tag == 'path':
            shapes.append(('poly', parse_path(el.get('d')), is_arrow))
    return view_box, shapes


def parse_path(d):
    tokens = re.findall(r'[MLHVQZ]|-?\d*\.?\d+', d)
    points, x, y, i, cmd = [], 0.0, 0.0, 0, None
    while i < len(tokens):
        if tokens[i].isalpha():
            cmd = tokens[i]
            i += 1
            if cmd == 'Z':
                continue
        nums = lambda n: [float(t) for t in tokens[i:i + n]]
        if cmd in ('M', 'L'):
            x, y = nums(2)
            i += 2
            points.append((x, y))
        elif cmd == 'H':
            x = nums(1)[0]
            i += 1
            points.append((x, y))
        elif cmd == 'V':
            y = nums(1)[0]
            i += 1
            points.append((x, y))
        elif cmd == 'Q':
            cx, cy, ex, ey = nums(4)
            i += 4
            for step in range(1, 17):
                t = step / 16
                points.append(((1 - t) ** 2 * x + 2 * (1 - t) * t * cx + t ** 2 * ex,
                               (1 - t) ** 2 * y + 2 * (1 - t) * t * cy + t ** 2 * ey))
            x, y = ex, ey
        else:
            raise ValueError(f'Comando de trazado no soportado: {cmd}')
    return points


def draw_mark(draw, view_box, shapes, left, top, width, figure, arrow):
    """Dibuja el símbolo con su caja del viewBox en (left, top) y ancho `width` px."""
    vx, vy, vw, _ = view_box
    k = width / vw
    tx = lambda px, py: (left + (px - vx) * k, top + (py - vy) * k)
    stroke_px = max(1, round(STROKE * k))
    for kind, data, is_arrow in shapes:
        color = arrow if is_arrow else figure
        if kind == 'circle':
            cx, cy = tx(data[0], data[1])
            r = data[2] * k
            draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color)
        else:
            pts = [tx(*p) for p in data]
            draw.polygon(pts, fill=color)
            draw.line(pts + [pts[0]], fill=color, width=stroke_px, joint='curve')
            for px, py in pts:  # remate redondo de las esquinas, como stroke-linejoin="round"
                h = stroke_px / 2
                draw.ellipse((px - h, py - h, px + h, py + h), fill=color)


def render(size, view_box, shapes, *, background, mark_ratio, radius_ratio=0.0,
           figure=WHITE, arrow=ARROW_ON_DARK, mode='RGB'):
    big = size * SS
    img = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    if background:
        if radius_ratio:
            draw.rounded_rectangle((0, 0, big - 1, big - 1), radius=big * radius_ratio, fill=background)
        else:
            draw.rectangle((0, 0, big, big), fill=background)
    _, _, vw, vh = view_box
    width = big * mark_ratio
    height = width * vh / vw
    draw_mark(draw, view_box, shapes, (big - width) / 2, (big - height) / 2, width, figure, arrow)
    img = img.resize((size, size), Image.LANCZOS)
    return img.convert('RGB') if mode == 'RGB' else img


def main():
    view_box, shapes = load_mark(PUBLIC / 'logo-mark.svg')
    icons = PUBLIC / 'icons'
    icons.mkdir(exist_ok=True)

    for size in (72, 96, 128, 144, 152, 180, 192, 384, 512):
        name = f'icon-{size}x{size}.png'
        render(size, view_box, shapes, background=INK, mark_ratio=0.62).save(icons / name, optimize=True)
        print(f'✓ {name}')

    render(72, view_box, shapes, background=None, mark_ratio=0.8, arrow=WHITE, mode='RGBA') \
        .save(icons / 'badge-72x72.png', optimize=True)
    print('✓ badge-72x72.png')

    # Mismas proporciones que public/icon.svg: rx 14/64 y símbolo de 46,6/64 de ancho.
    favicon = render(256, view_box, shapes, background=INK, mark_ratio=0.73, radius_ratio=14 / 64, mode='RGBA')
    favicon.save(PUBLIC / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
    print('✓ favicon.ico')


if __name__ == '__main__':
    main()
