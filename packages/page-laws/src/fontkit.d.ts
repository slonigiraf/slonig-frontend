declare module 'fontkit' {
  interface GlyphPath {
    toSVG: () => string;
  }

  interface Glyph {
    id: number;
    path?: GlyphPath;
  }

  interface GlyphPosition {
    xAdvance: number;
    xOffset: number;
    yAdvance: number;
    yOffset: number;
  }

  interface GlyphRun {
    glyphs: Glyph[];
    positions: GlyphPosition[];
  }

  interface Font {
    unitsPerEm: number;
    layout: (value: string) => GlyphRun;
  }

  export function create (buffer: Uint8Array): Font;
}
