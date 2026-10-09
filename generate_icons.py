#!/usr/bin/env python3
"""
generate_icons.py - Generador de iconos para SineRing Sleep
Diseño: Anillo inteligente futurista con aura nocturna y letras Z flotantes (sueño).
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math

RES_DIR = Path("android/app/src/main/res")

DENSITIES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192
}

def draw_sleep_ring_icon(size: int, is_round: bool = False, is_foreground: bool = False) -> Image.Image:
    scale = 4
    canvas_size = size * scale
    img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    center_x = canvas_size * 0.44
    center_y = canvas_size * 0.54
    r_outer = canvas_size * 0.30
    r_inner = canvas_size * 0.22

    if not is_foreground:
        # Fondo oscuro noche profunda con estrellas tenues
        if is_round:
            draw.ellipse([0, 0, canvas_size - 1, canvas_size - 1], fill=(7, 10, 24, 255))
        else:
            radius = canvas_size * 0.23
            draw.rounded_rectangle([0, 0, canvas_size - 1, canvas_size - 1], radius=radius, fill=(7, 10, 24, 255))

        # Aura lunar de fondo
        for i in range(20):
            alpha = max(0, int(35 - i * 1.7))
            glow_r = canvas_size * 0.40 + i * scale * 2
            draw.ellipse([center_x - glow_r, center_y - glow_r, center_x + glow_r, center_y + glow_r],
                         outline=(56, 189, 248, alpha), width=int(2 * scale))

        # Luna creciente sutil en esquina superior izquierda
        moon_x = canvas_size * 0.24
        moon_y = canvas_size * 0.24
        moon_r = canvas_size * 0.08
        draw.ellipse([moon_x - moon_r, moon_y - moon_r, moon_x + moon_r, moon_y + moon_r], fill=(224, 231, 255, 230))
        # Recorte de la luna
        draw.ellipse([moon_x - moon_r * 0.5, moon_y - moon_r * 1.2, moon_x + moon_r * 1.5, moon_y + moon_r * 0.8], fill=(7, 10, 24, 255))

    # Resplandor exterior del anillo
    for i in range(14):
        alpha = max(0, int(45 - i * 3.2))
        draw.ellipse([center_x - r_outer - i*scale, center_y - r_outer - i*scale,
                      center_x + r_outer + i*scale, center_y + r_outer + i*scale],
                     outline=(129, 140, 248, alpha), width=int(2.5 * scale))

    # Anillo principal (Cuerpo del Smart Ring)
    ring_width = int(r_outer - r_inner)
    draw.ellipse([center_x - r_outer, center_y - r_outer, center_x + r_outer, center_y + r_outer],
                 outline=(56, 189, 248, 255), width=ring_width)

    # Brillo metálico / bisel
    draw.ellipse([center_x - r_outer + 2*scale, center_y - r_outer + 2*scale,
                  center_x + r_outer - 2*scale, center_y + r_outer - 2*scale],
                 outline=(255, 255, 255, 140), width=int(2.2 * scale))

    # Sensores internos del anillo (fotodiodos verdes/rojos que brillan sutilmente)
    for angle_deg in [135, 180, 225]:
        rad = math.radians(angle_deg)
        sensor_r = r_inner + (r_outer - r_inner) * 0.5
        sx = center_x + sensor_r * math.cos(rad)
        sy = center_y + sensor_r * math.sin(rad)
        s_dot = int(3.5 * scale)
        draw.ellipse([sx - s_dot, sy - s_dot, sx + s_dot, sy + s_dot], fill=(52, 211, 153, 255))
        draw.ellipse([sx - s_dot*1.5, sy - s_dot*1.5, sx + s_dot*1.5, sy + s_dot*1.5], outline=(52, 211, 153, 100), width=scale)

    # Dibujo manual de las letras "Z" flotantes
    # Función auxiliar para trazar una Z con grosor y resplandor
    def draw_z(x, y, w, h, thickness, color, glow_color):
        points = [
            (x, y), (x + w, y),             # Barra superior
            (x + thickness*0.5, y + h),     # Diagonal
            (x + w, y + h)                  # Barra inferior
        ]
        # Resplandor
        for g in range(3, 0, -1):
            draw.line([(x, y), (x + w, y)], fill=glow_color, width=thickness + g*scale, joint="round")
            draw.line([(x + w, y), (x, y + h)], fill=glow_color, width=thickness + g*scale, joint="round")
            draw.line([(x, y + h), (x + w, y + h)], fill=glow_color, width=thickness + g*scale, joint="round")
        # Trazo nítido
        draw.line([(x, y), (x + w, y)], fill=color, width=thickness, joint="round")
        draw.line([(x + w, y), (x, y + h)], fill=color, width=thickness, joint="round")
        draw.line([(x, y + h), (x + w, y + h)], fill=color, width=thickness, joint="round")

    # Z grande (principal, saliendo del anillo)
    z1_x = canvas_size * 0.56
    z1_y = canvas_size * 0.38
    draw_z(z1_x, z1_y, canvas_size * 0.17, canvas_size * 0.16, int(5.5 * scale),
           color=(245, 243, 255, 255), glow_color=(192, 132, 252, 90))

    # Z mediana (flotando más arriba a la derecha)
    z2_x = canvas_size * 0.72
    z2_y = canvas_size * 0.22
    draw_z(z2_x, z2_y, canvas_size * 0.12, canvas_size * 0.11, int(4.0 * scale),
           color=(224, 231, 255, 240), glow_color=(167, 139, 250, 80))

    # z pequeña (más tenue)
    z3_x = canvas_size * 0.82
    z3_y = canvas_size * 0.11
    draw_z(z3_x, z3_y, canvas_size * 0.08, canvas_size * 0.07, int(2.8 * scale),
           color=(199, 210, 254, 200), glow_color=(139, 92, 246, 60))

    # Estrellitas brillantes sutiles
    for sx_rel, sy_rel in [(0.42, 0.20), (0.76, 0.52), (0.88, 0.32)]:
        px = canvas_size * sx_rel
        py = canvas_size * sy_rel
        s_len = int(4 * scale)
        draw.line([(px - s_len, py), (px + s_len, py)], fill=(255, 255, 255, 200), width=scale)
        draw.line([(px, py - s_len), (px, py + s_len)], fill=(255, 255, 255, 200), width=scale)

    return img.resize((size, size), Image.Resampling.LANCZOS)

def generate_svg():
    svg_content = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <radialGradient id="bgGlow" cx="44%" cy="54%" r="60%">
      <stop offset="0%" stop-color="#1e1b4b"/>
      <stop offset="60%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#070a16"/>
    </radialGradient>
    <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="50%" stop-color="#818cf8"/>
      <stop offset="100%" stop-color="#c084fc"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
  <rect width="512" height="512" rx="115" fill="url(#bgGlow)"/>
  <!-- Luna creciente -->
  <path d="M 120 100 A 40 40 0 1 0 160 140 A 30 30 0 1 1 120 100 Z" fill="#e0e7ff" opacity="0.85"/>
  <!-- Anillo inteligente -->
  <circle cx="225" cy="275" r="130" fill="none" stroke="url(#ringGrad)" stroke-width="36" filter="url(#glow)"/>
  <circle cx="225" cy="275" r="130" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.5"/>
  <!-- Sensores del anillo -->
  <circle cx="135" cy="275" r="6" fill="#34d399" filter="url(#glow)"/>
  <circle cx="160" cy="210" r="6" fill="#34d399" filter="url(#glow)"/>
  <!-- Z grande -->
  <path d="M 285 195 L 370 195 L 290 275 L 375 275" fill="none" stroke="#f5f3ff" stroke-width="22" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>
  <!-- Z mediana -->
  <path d="M 365 115 L 425 115 L 370 170 L 430 170" fill="none" stroke="#e0e7ff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>
  <!-- z pequeña -->
  <path d="M 420 55 L 460 55 L 425 90 L 465 90" fill="none" stroke="#c7d2fe" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>
</svg>'''
    with open("www/icon.svg", "w") as f:
        f.write(svg_content)
    print("  ✓ www/icon.svg generado.")

def main():
    print("[*] Generando iconos para SineRing Sleep...")
    Path("www").mkdir(exist_ok=True)
    
    # Iconos web
    icon_512 = draw_sleep_ring_icon(512, is_round=False)
    icon_512.save("www/icon.png")
    print("  ✓ www/icon.png (512x512) generado.")
    
    generate_svg()

    # Si existe el directorio android, generar para android
    if RES_DIR.exists():
        for folder, size in DENSITIES.items():
            dir_path = RES_DIR / folder
            dir_path.mkdir(parents=True, exist_ok=True)
            draw_sleep_ring_icon(size, is_round=False).save(dir_path / "ic_launcher.png")
            draw_sleep_ring_icon(size, is_round=True).save(dir_path / "ic_launcher_round.png")
            draw_sleep_ring_icon(size, is_round=False, is_foreground=True).save(dir_path / "ic_launcher_foreground.png")
            print(f"  ✓ {folder}: {size}x{size} px generado.")

if __name__ == "__main__":
    main()
