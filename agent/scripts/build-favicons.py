"""Rasterize public/favicon.svg → multi-size PNG + ICO + OG card.

Run from project root:
    uv run --project /home/prmichaelsen/.acp/projects/reflection \
        python agent/scripts/build-favicons.py

Outputs (all under public/):
  - favicon-16.png, favicon-32.png, favicon-48.png
  - favicon.ico (multi-resolution 16/32/48)
  - apple-touch-icon.png (180x180)
  - icon-192.png, icon-512.png (PWA)
  - og-image.png (1200x630) — favicon centered on cool dark grey
    background with site name + tagline rendered via PIL.
"""

from io import BytesIO
from pathlib import Path

import cairosvg
from PIL import Image, ImageDraw, ImageFont

PUBLIC = Path(__file__).resolve().parents[2] / "public"
SVG_PATH = PUBLIC / "favicon.svg"
SVG_BYTES = SVG_PATH.read_bytes()


def render_svg(size: int) -> Image.Image:
    png = cairosvg.svg2png(bytestring=SVG_BYTES,
                           output_width=size, output_height=size)
    return Image.open(BytesIO(png)).convert("RGBA")


def write_png(img: Image.Image, name: str) -> None:
    out = PUBLIC / name
    img.save(out, "PNG", optimize=True)
    print(f"  wrote {out.name} ({img.size[0]}x{img.size[1]})")


def build_icons() -> None:
    sizes = [16, 32, 48, 64, 128, 180, 192, 512]
    rendered = {s: render_svg(s) for s in sizes}
    for s in (16, 32, 48):
        write_png(rendered[s], f"favicon-{s}.png")
    # ICO with 16/32/48 embedded
    ico_path = PUBLIC / "favicon.ico"
    rendered[48].save(ico_path, format="ICO",
                      sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"  wrote {ico_path.name} (multi-res)")
    rendered[180].save(PUBLIC / "apple-touch-icon.png", "PNG", optimize=True)
    print("  wrote apple-touch-icon.png (180x180)")
    rendered[192].save(PUBLIC / "icon-192.png", "PNG", optimize=True)
    rendered[512].save(PUBLIC / "icon-512.png", "PNG", optimize=True)
    print("  wrote icon-192.png, icon-512.png")
    return rendered


def find_font(candidates: list[str], size: int) -> ImageFont.FreeTypeFont:
    for name in candidates:
        for root in ("/usr/share/fonts", "/usr/local/share/fonts",
                     "/System/Library/Fonts"):
            for p in Path(root).rglob(name):
                try:
                    return ImageFont.truetype(str(p), size)
                except Exception:
                    pass
    return ImageFont.load_default()


def build_og(icon_at_512: Image.Image) -> None:
    w, h = 1200, 630
    bg = Image.new("RGB", (w, h), (21, 23, 28))  # #15171c
    # Vignette: paint a dark-card radial swatch behind the title block
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for i in range(120, 0, -1):
        alpha = int(60 * (i / 120))
        od.ellipse(
            (w // 2 - i * 4, h // 2 - i * 2,
             w // 2 + i * 4, h // 2 + i * 2),
            fill=(28, 31, 37, alpha),
        )
    bg = Image.alpha_composite(bg.convert("RGBA"), overlay).convert("RGB")

    icon = icon_at_512.resize((220, 220), Image.LANCZOS)
    bg.paste(icon, (90, (h - 220) // 2), icon)

    title_font = find_font(
        ["CormorantGaramond-SemiBold.ttf", "CormorantGaramond-Bold.ttf",
         "LiberationSerif-Bold.ttf", "FreeSerifBold.ttf",
         "DejaVuSerif-Bold.ttf", "DejaVuSerif.ttf"], 110,
    )
    tag_font = find_font(
        ["LiberationSerif-Italic.ttf", "FreeSerifItalic.ttf",
         "DejaVuSerif-Italic.ttf", "DejaVuSans.ttf"], 42,
    )
    sub_font = find_font(
        ["LiberationSerif-Italic.ttf", "FreeSerifItalic.ttf",
         "DejaVuSans-Oblique.ttf", "DejaVuSans.ttf"], 28,
    )
    url_font = find_font(
        ["LiberationSerif-Regular.ttf", "FreeSerif.ttf",
         "DejaVuSans.ttf"], 26,
    )

    draw = ImageDraw.Draw(bg)
    draw.text((350, 180), "Sauron's Arena",
              font=title_font, fill=(167, 139, 250))  # purple
    draw.text((355, 320), "Find the misaligned seat.",
              font=tag_font, fill=(233, 234, 240))   # off-white
    draw.text((355, 380), "A deliberation game at the Council of Elrond.",
              font=sub_font, fill=(168, 170, 179))   # light grey

    # Bottom hairline
    draw.line([(90, h - 80), (w - 90, h - 80)],
              fill=(66, 69, 79), width=2)
    draw.text((90, h - 55), "sauronsarena.com",
              font=url_font, fill=(139, 92, 246))    # deeper purple

    out = PUBLIC / "og-image.png"
    bg.save(out, "PNG", optimize=True)
    print(f"  wrote {out.name} (1200x630)")


def main() -> None:
    print(f"public/ = {PUBLIC}")
    rendered = build_icons()
    build_og(rendered[512])
    print("done.")


if __name__ == "__main__":
    main()
