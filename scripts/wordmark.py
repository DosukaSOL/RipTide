# Converts the "riptide" wordmark to SVG paths so it renders anywhere without the font.
# Usage: python3 scripts/wordmark.py > brand/wordmark-paths.json
import json, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

font = TTFont("apps/studio/public/fonts/Adventor-Bold.otf")
gs = font.getGlyphSet()
cmap = font.getBestCmap()
upm = font["head"].unitsPerEm
text = "riptide"
tracking = -0.02 * upm
x = 0
glyphs = []
for ch in text:
    name = cmap[ord(ch)]
    pen = SVGPathPen(gs)
    gs[name].draw(pen)
    glyphs.append({"ch": ch, "x": x, "d": pen.getCommands()})
    x += gs[name].width + tracking
os2 = font["OS/2"]
json.dump({"upm": upm, "width": x - tracking, "ascender": os2.sTypoAscender, "descender": os2.sTypoDescender, "xHeight": getattr(os2, "sxHeight", 0), "glyphs": glyphs}, sys.stdout)
