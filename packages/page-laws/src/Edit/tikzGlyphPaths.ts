// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

const SVG_NS = 'http://www.w3.org/2000/svg';
const GLYPH_DEFS_ATTRIBUTE = 'data-slonig-tikz-glyphs';

interface FontkitGlyph {
  id: number;
  path?: {
    toSVG: () => string;
  };
}

interface FontkitGlyphPosition {
  xAdvance: number;
  xOffset: number;
  yAdvance: number;
  yOffset: number;
}

interface FontkitGlyphRun {
  glyphs: FontkitGlyph[];
  positions: FontkitGlyphPosition[];
}

interface FontkitFont {
  unitsPerEm: number;
  layout: (value: string) => FontkitGlyphRun;
}

type FontkitModule = {
  create: (buffer: Uint8Array) => FontkitFont;
};

const fontPromises = new Map<string, Promise<FontkitFont>>();
let fontkitPromise: Promise<FontkitModule> | undefined;

function loadFontkit (): Promise<FontkitModule> {
  if (!fontkitPromise) {
    fontkitPromise = import('fontkit') as Promise<FontkitModule>;
  }

  return fontkitPromise;
}

function fontFamilyName (value: string): string {
  return value
    .split(',')[0]
    .trim()
    .replace(/^['"]|['"]$/g, '');
}

function cssProperty (element: Element, property: string): string {
  let current: Element | null = element;

  while (current) {
    const attribute = current.getAttribute(property);

    if (attribute?.trim()) {
      return attribute.trim();
    }

    if (current instanceof SVGElement) {
      const inlineValue = current.style.getPropertyValue(property).trim();

      if (inlineValue) {
        return inlineValue;
      }
    }

    current = current.parentElement;
  }

  return '';
}

function svgLength (value: string, fallback = 0): number {
  const match = /^\s*(-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(px|pt)?\s*$/i.exec(value);

  if (!match) {
    return fallback;
  }

  const numeric = Number(match[1]);

  return match[2]?.toLowerCase() === 'pt' ? numeric * (96 / 72) : numeric;
}

function firstCoordinate (value: string | null, fallback = 0): number {
  if (!value) {
    return fallback;
  }

  const first = value.trim().split(/[\s,]+/)[0];

  return svgLength(first, fallback);
}

function escapedFamilyPath (family: string): string {
  // TikZJax generates dist/fonts/<font-family>.woff2 from the BaKoMa font set.
  // Limit the URL component to ordinary font family filename characters.
  if (!/^[A-Za-z0-9._-]+$/.test(family)) {
    throw new Error(`Unsupported TikZ font family name: ${family}`);
  }

  return `${family}.woff2`;
}

async function loadFont (fontBaseUrl: string, family: string): Promise<FontkitFont> {
  const url = `${fontBaseUrl.replace(/\/$/, '')}/${escapedFamilyPath(family)}`;
  const cached = fontPromises.get(url);

  if (cached) {
    return cached;
  }

  const promise = (async (): Promise<FontkitFont> => {
    const [fontkit, response] = await Promise.all([
      loadFontkit(),
      fetch(url)
    ]);

    if (!response.ok) {
      throw new Error(`Unable to load TikZ font ${family} (${response.status}).`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());

    return fontkit.create(bytes);
  })();

  fontPromises.set(url, promise);

  try {
    return await promise;
  } catch (error) {
    fontPromises.delete(url);
    throw error;
  }
}

function copyTextPresentation (text: SVGTextElement, group: SVGGElement): void {
  const omitted = new Set([
    'alignment-baseline',
    'dominant-baseline',
    'dx',
    'dy',
    'font-family',
    'font-size',
    'font-stretch',
    'font-style',
    'font-variant',
    'font-weight',
    'lengthAdjust',
    'text-anchor',
    'textLength',
    'x',
    'y'
  ]);

  for (const attribute of Array.from(text.attributes)) {
    if (!omitted.has(attribute.name)) {
      group.setAttribute(attribute.name, attribute.value);
    }
  }

  // Font declarations embedded in style are irrelevant after outlining. Leaving
  // them is harmless, but removing them makes persisted SVGs clearly font-free.
  for (const property of [
    'font',
    'font-family',
    'font-size',
    'font-stretch',
    'font-style',
    'font-variant',
    'font-weight',
    'text-anchor'
  ]) {
    group.style.removeProperty(property);
  }
}

function ensureGlyphDefs (root: SVGSVGElement): SVGDefsElement {
  const existing = root.querySelector(`defs[${GLYPH_DEFS_ATTRIBUTE}="true"]`);

  if (existing?.tagName.toLowerCase() === 'defs') {
    return existing as SVGDefsElement;
  }

  const defs = root.ownerDocument.createElementNS(SVG_NS, 'defs');

  defs.setAttribute(GLYPH_DEFS_ATTRIBUTE, 'true');
  root.insertBefore(defs, root.firstChild);

  return defs;
}

function glyphDefinitionId (fontIndex: number, glyphId: number): string {
  return `slonig-tikz-glyph-${fontIndex}-${glyphId}`;
}

function createGlyphDefinition (
  defs: SVGDefsElement,
  id: string,
  pathData: string
): void {
  if (defs.ownerDocument.getElementById(id)) {
    return;
  }

  const path = defs.ownerDocument.createElementNS(SVG_NS, 'path');

  path.setAttribute('d', pathData);
  path.setAttribute('id', id);
  defs.appendChild(path);
}

function textAnchorOffset (text: SVGTextElement, width: number): number {
  const anchor = cssProperty(text, 'text-anchor').toLowerCase();

  if (anchor === 'middle') {
    return -width / 2;
  }

  if (anchor === 'end') {
    return -width;
  }

  return 0;
}

/**
 * Replace TikZJax SVG <text> nodes with vector glyph outlines. The resulting
 * SVG no longer depends on TeX fonts when loaded through <img>, IPFS, or as a
 * standalone file. Repeated glyphs are defined once under <defs> and reused.
 */
export async function convertTikzTextToPaths (svg: string, fontBaseUrl: string): Promise<string> {
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(svg, 'image/svg+xml');
  const parserError = documentNode.querySelector('parsererror');
  const root = documentNode.documentElement;

  if (parserError || !(root instanceof SVGSVGElement)) {
    throw new Error('Cannot outline TikZ text in invalid SVG markup.');
  }

  const textNodes = Array.from(root.querySelectorAll('text'));

  if (!textNodes.length) {
    return svg;
  }

  const families = Array.from(new Set(textNodes.map((text) => fontFamilyName(cssProperty(text, 'font-family')))));

  if (families.some((family) => !family)) {
    throw new Error('TikZ renderer returned text without an explicit font family.');
  }

  const fonts = new Map<string, FontkitFont>();

  await Promise.all(families.map(async (family) => {
    fonts.set(family, await loadFont(fontBaseUrl, family));
  }));

  const familyIndexes = new Map(families.map((family, index) => [family, index]));
  const defs = ensureGlyphDefs(root);

  for (const text of textNodes) {
    if (text.children.length) {
      throw new Error('TikZ renderer returned nested SVG text that cannot be safely outlined.');
    }

    const value = text.textContent ?? '';
    const family = fontFamilyName(cssProperty(text, 'font-family'));
    const font = fonts.get(family);
    const fontIndex = familyIndexes.get(family);
    const fontSize = svgLength(cssProperty(text, 'font-size'));

    if (!font || fontIndex === undefined || !fontSize || !font.unitsPerEm) {
      throw new Error(`Unable to outline TikZ text using font ${family || '(unknown)'}.`);
    }

    const run = font.layout(value);
    const scale = fontSize / font.unitsPerEm;
    const runWidth = run.positions.reduce((sum, position) => sum + position.xAdvance, 0) * scale;
    let cursorX = firstCoordinate(text.getAttribute('x')) + firstCoordinate(text.getAttribute('dx')) + textAnchorOffset(text, runWidth);
    let cursorY = firstCoordinate(text.getAttribute('y')) + firstCoordinate(text.getAttribute('dy'));
    const group = documentNode.createElementNS(SVG_NS, 'g');

    copyTextPresentation(text, group);

    for (let index = 0; index < run.glyphs.length; index++) {
      const glyph = run.glyphs[index];
      const position = run.positions[index];

      if (glyph.path) {
        const pathData = glyph.path.toSVG();

        if (pathData) {
          const definitionId = glyphDefinitionId(fontIndex, glyph.id);
          const use = documentNode.createElementNS(SVG_NS, 'use');
          const glyphX = cursorX + (position.xOffset * scale);
          const glyphY = cursorY - (position.yOffset * scale);

          createGlyphDefinition(defs, definitionId, pathData);
          use.setAttribute('href', `#${definitionId}`);
          use.setAttribute('transform', `translate(${glyphX} ${glyphY}) scale(${scale} ${-scale})`);
          group.appendChild(use);
        }
      }

      cursorX += position.xAdvance * scale;
      cursorY -= position.yAdvance * scale;
    }

    text.replaceWith(group);
  }

  if (root.querySelector('text')) {
    throw new Error('TikZ SVG still contains font-dependent text after outlining.');
  }

  return new XMLSerializer().serializeToString(root);
}
