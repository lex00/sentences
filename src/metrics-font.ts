// Node-side TextMetrics backed by the actual pinned font (Tinos .woff via opentype.js), so
// layout in tests uses the SAME glyph advances the browser renders with. This is what makes the
// geometric collision sweep predictive of the real diagram. Test-only (uses node:fs).

import opentype from "opentype.js";
import { readFileSync } from "node:fs";
import type { TextMetrics } from "./layout.js";

export function loadFontMetrics(path: string): TextMetrics {
  const buf = readFileSync(path);
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const upm = font.unitsPerEm;
  return {
    measure(text: string, sizePx: number) {
      const scale = sizePx / upm;
      return { width: font.getAdvanceWidth(text, sizePx), ascent: font.ascender * scale, descent: -font.descender * scale };
    },
  };
}
