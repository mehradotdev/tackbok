#!/usr/bin/env python3
"""Generate metric-patched title fonts into assets/fonts/.

## Why

React Native on Android sizes each text line box from the font's *declared*
vertical metrics (hhea ascent/descent). When an explicit `lineHeight` is
smaller than that declared span, RN's CustomLineHeightSpan applies CSS-style
half-leading: it removes `(declaredSpan - lineHeight) / 2` from BOTH the top
of the first line and the bottom of the last line — and Android hard-clips
glyph ink at those bounds (see src/lib/theme/typography.ts).

Google Fonts ship display faces with heavily padded metrics (Gloria
Hallelujah declares a 1.98em span while its ink only spans 1.69em;
Baskervville declares 1.29em vs 1.09em of ink). That padding is pure air,
but Android's half-leading math turns it into descender clipping at
Tailwind's default heading line heights.

This script rewrites the declared metrics down to the fonts' actual Latin
ink extents (plus a small anti-aliasing pad), which makes the fonts fit
Tailwind's default line heights on Android — except Gloria Hallelujah,
whose real ink span (1.73em patched) still needs androidLineHeightScale
(see HEADING_FONT_METRICS in src/lib/theme/typography.ts).

## Usage (one-time; outputs are committed)

    python3 -m venv .fontenv && .fontenv/bin/pip install fonttools
    .fontenv/bin/python scripts/patch-font-metrics.py

Source TTFs are read from the @expo-google-fonts packages in node_modules —
that is why those packages stay in package.json even though the app now
loads the patched copies from assets/fonts/ (see src/lib/theme/fonts.ts).

## Licensing

All six faces are SIL OFL 1.1, which requires every redistributed copy —
modified or not — to carry its copyright notice and the license text. The
script writes a single combined assets/fonts/LICENSE.txt (per-font
copyright notices + the shared OFL body). Only Lora declares a Reserved
Font Name, so the patched Lora is internally renamed ("Tackbok Serif");
this is invisible to the app because expo-font registers fonts under the
APP_FONT_ASSETS keys, not the internal name table.
"""

from pathlib import Path
import sys

try:
    from fontTools.ttLib import TTFont
except ImportError:
    sys.exit("fonttools is required: python3 -m venv .fontenv && .fontenv/bin/pip install fonttools")

MOBILE_ROOT = Path(__file__).resolve().parents[1]
GOOGLE_FONTS = MOBILE_ROOT / "../../node_modules/@expo-google-fonts"
OUT_DIR = MOBILE_ROOT / "assets/fonts"

# Extra room beyond measured ink, in em, added to both ascent and descent.
# Covers anti-aliasing halos and hinting shifts (~1px at heading sizes).
INK_PAD_EM = 0.02

# Ink is measured over glyphs that plausibly appear in headings. Headings
# are English/Latin in this app (Arabic/Hebrew/CJK locales render title
# fonts via system fallback fonts, which keep their own metrics).
#
# Deliberately excluded:
# - tall symbols (@ | { } [ ] $ # % / \\): some faces draw these far above
#   the letter ink; because RN's half-leading cut is symmetric, covering
#   them with the ascent metric would steal descender room from 'g' and
#   friends on every heading.
# - accented capitals (É, Å…): may exceed the patched ascent and could
#   shave a pixel on an Android first line — acceptable until a
#   Latin-accent locale ships.
INK_SAMPLE = (
    "abcdefghijklmnopqrstuvwxyz"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "0123456789"
    "?!,.:;'\"()&-‘’“”–—…"
)

# (package-relative source, output name, internal rename or None)
# Rename tuple: (family, subfamily) — applied to name IDs 1/3/4/6/16/17.
FONTS = [
    ("baskervville/700Bold/Baskervville_700Bold.ttf", "Baskervville_700Bold.ttf", None),
    ("figtree/700Bold/Figtree_700Bold.ttf", "Figtree_700Bold.ttf", None),
    ("cinzel/700Bold/Cinzel_700Bold.ttf", "Cinzel_700Bold.ttf", None),
    ("gloria-hallelujah/400Regular/GloriaHallelujah_400Regular.ttf", "GloriaHallelujah_400Regular.ttf", None),
    # OFL Reserved Font Name "Lora" — modified versions must not use it.
    ("lora/700Bold/Lora_700Bold.ttf", "Lora_700Bold.ttf", ("Tackbok Serif", "Bold")),
    ("space-mono/700Bold/SpaceMono_700Bold.ttf", "SpaceMono_700Bold.ttf", None),
]

# variant -> (fontSize px, Tailwind default lineHeight px), from
# src/components/ui/text.tsx heading variants (text-4xl … text-xl).
HEADINGS = {"h1": (36, 40), "h2": (30, 36), "h3": (24, 32), "h4": (20, 28)}

USE_TYPO_METRICS = 0x80

OFL_BODY_MARKER = "SIL OPEN FONT LICENSE Version 1.1"
OFL_NOTICE_MARKER = "This Font Software is licensed under the SIL Open Font License"

LICENSE_INTRO = """\
The fonts in this directory are modified copies of Google Fonts releases:
their declared vertical metrics were patched down to real ink extents by
scripts/patch-font-metrics.py (see its docstring for why), and Lora was
internally renamed to "Tackbok Serif" as required by its Reserved Font Name
clause. All faces are licensed under the SIL Open Font License, Version 1.1,
reproduced once at the bottom of this file.
"""


def split_license(license_path: Path) -> tuple[str, str]:
    """Return (copyright notice, OFL license body) from an upstream LICENSE_FONT."""
    text = license_path.read_text(encoding="utf-8")
    notice = text[: text.index(OFL_NOTICE_MARKER)].strip()
    body_index = text.index(OFL_BODY_MARKER)
    separator_index = text.rfind("\n---", 0, body_index)
    body = text[separator_index if separator_index != -1 else body_index :].strip()
    return notice, body


def latin_ink_extents(font: TTFont) -> tuple[int, int]:
    """Return (yMin, yMax) in font units over the printable-ASCII glyphs."""
    glyf = font["glyf"]
    cmap = font.getBestCmap()
    y_min, y_max = 0, 0
    for ch in INK_SAMPLE:
        glyph_name = cmap.get(ord(ch))
        if glyph_name is None:
            continue
        glyph = glyf[glyph_name]
        if glyph.numberOfContours == 0:
            continue
        glyph.recalcBounds(glyf)
        y_min = min(y_min, glyph.yMin)
        y_max = max(y_max, glyph.yMax)
    return y_min, y_max


def rename(font: TTFont, family: str, subfamily: str) -> None:
    postscript = f"{family.replace(' ', '')}-{subfamily.replace(' ', '')}"
    replacements = {
        1: family,
        2: subfamily,
        3: f"tackbok;{postscript}",
        4: f"{family} {subfamily}",
        6: postscript,
        16: family,
        17: subfamily,
    }
    name_table = font["name"]
    for record in name_table.names:
        if record.nameID in replacements:
            name_table.setName(
                replacements[record.nameID],
                record.nameID,
                record.platformID,
                record.platEncID,
                record.langID,
            )


def check_clipping(label: str, upem: int, ascent: int, descent: int, ink_top: int, ink_bottom: int) -> bool:
    """Simulate RN Android half-leading at every heading size; True if ink fits."""
    ok = True
    for variant, (size, line_height) in HEADINGS.items():
        span = (ascent + descent) / upem * size
        half_leading = (line_height - span) / 2
        bottom_room = descent / upem * size + half_leading
        top_room = ascent / upem * size + half_leading
        clip_bottom = ink_bottom / upem * size - bottom_room
        clip_top = ink_top / upem * size - top_room
        if clip_bottom > 0 or clip_top > 0:
            print(f"    !! {label} {variant}: bottom clip {clip_bottom:+.1f}px, top clip {clip_top:+.1f}px")
            ok = False
    return ok


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tailwind_ok = True
    copyright_notices: list[str] = []
    ofl_body = ""

    for source_rel, out_name, new_name in FONTS:
        source = GOOGLE_FONTS / source_rel
        font = TTFont(source)
        upem = font["head"].unitsPerEm
        pad = round(INK_PAD_EM * upem)
        y_min, y_max = latin_ink_extents(font)

        ascent = y_max + pad
        descent = -y_min + pad  # positive magnitude

        hhea = font["hhea"]
        os2 = font["OS/2"]
        old_span = (hhea.ascent - hhea.descent) / upem

        hhea.ascent = ascent
        hhea.descent = -descent
        hhea.lineGap = 0
        os2.sTypoAscender = ascent
        os2.sTypoDescender = -descent
        os2.sTypoLineGap = 0
        os2.usWinAscent = ascent
        os2.usWinDescent = descent
        if os2.version >= 4:
            os2.fsSelection |= USE_TYPO_METRICS

        if new_name is not None:
            rename(font, *new_name)

        out_path = OUT_DIR / out_name
        font.save(out_path)

        notice, ofl_body = split_license(source.parents[1] / "LICENSE_FONT")
        copyright_notices.append(f"{out_name}:\n{notice}")

        new_span = (ascent + descent) / upem
        print(
            f"{out_name}: span {old_span:.3f}em -> {new_span:.3f}em "
            f"(ascent {ascent}/{upem}, descent {descent}/{upem})"
        )
        fits = check_clipping(out_name, upem, ascent, descent, y_max, -y_min)
        if "Gloria" in out_name:
            # Expected: Gloria's ink span exceeds every Tailwind heading line
            # height; androidLineHeightScale in typography.ts must be >= span.
            print(f"    (needs androidLineHeightScale >= {new_span:.2f} — see typography.ts)")
        else:
            tailwind_ok = tailwind_ok and fits

    combined = "\n\n".join([LICENSE_INTRO, *copyright_notices, ofl_body]) + "\n"
    (OUT_DIR / "LICENSE.txt").write_text(combined, encoding="utf-8")

    if not tailwind_ok:
        sys.exit("Some fonts still clip at Tailwind default line heights — adjust HEADING_FONT_METRICS.")


if __name__ == "__main__":
    main()
