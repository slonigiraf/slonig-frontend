// Copyright 2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * The embedded editor sometimes exports ball-shaded paths with a URL fill
 * whose gradient definition is missing or has only black stops. Repair the
 * referenced SVG paint server after compilation (without changing TikZ).
 * Retain the conservative black-fill fallback for older editor exports.
 */

/** A retryable compatibility case when the previous compiler rewrite failed. */
export function hasTikzBallShading(source: string): boolean {
  return /\\(?:shade|shadedraw|path|draw|fill|filldraw)\b\s*\[[^\]]*\b(?:ball\s+color\s*=|shading\s*=\s*ball\b)/i.test(source);
}

interface Shading {
  kind: 'ball' | 'axis';
  color?: string;
  start?: string;
  middle?: string;
  end?: string;
  horizontal?: boolean;
}

const COLORS: Record<string, string> = {
  black: '#000000', blue: '#0000ff', brown: '#a52a2a', cyan: '#00ffff',
  darkgray: '#404040', gray: '#808080', green: '#00ff00', lightgray: '#c0c0c0',
  lime: '#00ff00', magenta: '#ff00ff', olive: '#808000', orange: '#ffa500',
  pink: '#ffc0cb', purple: '#800080', red: '#ff0000', teal: '#008080',
  violet: '#8f00ff', white: '#ffffff', yellow: '#ffff00'
};

function rgb(color: string): [number, number, number] | undefined {
  const normalized = color.trim().toLowerCase();
  const value = COLORS[normalized] ?? (/^#[0-9a-f]{6}$/i.test(normalized) ? normalized : undefined);
  if (!value) return undefined;
  return [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16)) as [number, number, number];
}

function hex(value: [number, number, number]): string {
  return `#${value.map((part) => Math.max(0, Math.min(255, Math.round(part))).toString(16).padStart(2, '0')).join('')}`;
}

function mix(first: string, second: string, percentage: number): string | undefined {
  const a = rgb(first);
  const b = rgb(second);
  if (!a || !b) return undefined;
  const fraction = Math.min(1, Math.max(0, percentage / 100));
  return hex(a.map((component, index) => component * fraction + b[index] * (1 - fraction)) as [number, number, number]);
}

/** Handle standard TikZ named colors and xcolor expressions such as blue!35!white. */
function parseColor(value: string): string | undefined {
  const parts = value.trim().split('!').map((item) => item.trim());
  let result = rgb(parts[0]);
  if (!result) return undefined;
  for (let index = 1; index < parts.length; index += 2) {
    const percentage = Number(parts[index]);
    const other = parts[index + 1] || 'white';
    if (!Number.isFinite(percentage)) return undefined;
    const blended = mix(hex(result), other, percentage);
    if (!blended) return undefined;
    const next = rgb(blended);
    if (!next) return undefined;
    result = next;
  }
  return hex(result);
}

function readOption(options: string, name: string): string | undefined {
  // Color expressions don't contain commas; unlike arbitrary TikZ code, they
  // can be parsed without attempting to implement the editor's TikZ grammar.
  const option = options.split(',').map((entry) => entry.trim()).find((entry) => entry.slice(0, name.length).toLowerCase() === name && /^\s*=/.test(entry.slice(name.length)));
  return option?.slice(name.length).replace(/^\s*=\s*/, '').trim();
}

function shadingCommands(source: string): Shading[] {
  const shadings: Shading[] = [];
  for (const match of source.matchAll(/\\(shade(?:draw)?|path|draw|fill(?:draw)?)(?![a-zA-Z])\s*(?:\[([^\]]*)\])?/g)) {
    const options = match[2] ?? '';
    // A regular path/draw/fill command becomes a shade only with the TikZ
    // shading options; plain black fills must remain untouched.
    if (!match[1].startsWith('shade') && !/(?:^|,)\s*(?:shade\s*(?:,|$)|shading\s*=|ball color\s*=|left color\s*=|right color\s*=|top color\s*=|bottom color\s*=)/i.test(options)) continue;
    const ball = readOption(options, 'ball color');
    const kind = readOption(options, 'shading')?.toLowerCase();
    if (ball !== undefined || kind === 'ball') {
      const color = parseColor(ball ?? 'blue');
      if (!color) return [];
      shadings.push({ kind: 'ball', color });
      continue;
    }
    // Radial shading already works in the editor. Do not mistake it for the
    // default axis shading or alter unrelated black shapes.
    if (kind && kind !== 'axis' && !/(?:^|,)\s*(?:left|right|top|bottom|middle)\s+color\s*=/i.test(options)) continue;
    const left = readOption(options, 'left color');
    const right = readOption(options, 'right color');
    const top = readOption(options, 'top color');
    const bottom = readOption(options, 'bottom color');
    const horizontal = left !== undefined || right !== undefined;
    const start = parseColor((horizontal ? left : top) ?? 'gray');
    const end = parseColor((horizontal ? right : bottom) ?? 'white');
    const middleOption = readOption(options, 'middle color');
    const middle = middleOption ? parseColor(middleOption) : undefined;
    if (!start || !end || (middleOption && !middle)) return [];
    shadings.push({ kind: 'axis', start, end, middle, horizontal });
  }
  return shadings;
}

function gradientMarkup(shading: Shading, id: string): string {
  if (shading.kind === 'ball') {
    const base = shading.color ?? '#0000ff';
    // Approximate PGF's ball shading stops rather than flattening the ball
    // into a white-to-color circle. This only affects an SVG after the editor
    // has already compiled the unmodified, editable source.
    const bright = mix(base, '#ffffff', 15) ?? '#ffffff';
    const middle = mix(base, '#ffffff', 75) ?? base;
    const dark = mix(base, '#000000', 70) ?? base;
    const edge = mix(base, '#000000', 50) ?? base;
    return `<radialGradient id="${id}" cx="32%" cy="27%" r="75%" fx="32%" fy="27%"><stop offset="0%" stop-color="${bright}"/><stop offset="18%" stop-color="${middle}"/><stop offset="36%" stop-color="${dark}"/><stop offset="50%" stop-color="${edge}"/><stop offset="100%" stop-color="#000000"/></radialGradient>`;
  }
  const stops = `<stop offset="0%" stop-color="${shading.start}"/>${shading.middle ? `<stop offset="50%" stop-color="${shading.middle}"/>` : ''}<stop offset="100%" stop-color="${shading.end}"/>`;
  return `<linearGradient id="${id}" x1="0%" y1="0%" x2="${shading.horizontal ? '100%' : '0%'}" y2="${shading.horizontal ? '0%' : '100%'}">${stops}</linearGradient>`;
}

function blackFill(tag: string): boolean {
  const fill = /\sfill\s*=\s*(['"])(.*?)\1/i.exec(tag)?.[2];
  const styleFill = /\bfill\s*:\s*([^;'"]+)/i.exec(/\sstyle\s*=\s*(['"])(.*?)\1/i.exec(tag)?.[2] ?? '')?.[1];
  const effective = (styleFill ?? fill)?.trim().toLowerCase().replace(/\s+/g, '');
  return effective === 'black' || effective === '#000' || effective === '#000000' || effective === 'rgb(0,0,0)' || effective === 'rgb(0%,0%,0%)';
}

/**
 * The editor can export a path as fill="url(#tikz-shading-ball-1)" while the
 * matching paint server is absent or has been reduced to black stops. This is
 * NOT a black-filled path: preserve the URL and restore the referenced SVG
 * gradient definition. Never rewrite gradients that already contain colors.
 */
function restoreReferencedBallGradients(svg: string, shadings: Shading[]): { svg: string; foundReferences: boolean } {
  const balls = shadings.filter((shading) => shading.kind === 'ball');
  if (!balls.length) return { svg, foundReferences: false };

  const referencedIds: string[] = [];
  for (const match of svg.matchAll(/<(?:path|circle|ellipse|rect|polygon)\b[^>]*>/gi)) {
    const fill = /\sfill\s*=\s*(['"])(.*?)\1/i.exec(match[0])?.[2];
    const inlineStyle = /\sstyle\s*=\s*(['"])(.*?)\1/i.exec(match[0])?.[2];
    const effectiveFill = /(?:^|;)\s*fill\s*:\s*([^;]+)/i.exec(inlineStyle ?? '')?.[1] ?? fill;
    const id = /^url\(\s*['"]?#(tikz-shading-ball-[\w.-]+)['"]?\s*\)$/i.exec(effectiveFill?.trim() ?? '')?.[1];
    if (id && !referencedIds.includes(id)) referencedIds.push(id);
  }
  if (!referencedIds.length) return { svg, foundReferences: false };

  // Don't guess which source color matches which gradient if counts disagree.
  if (referencedIds.length !== balls.length) return { svg, foundReferences: true };

  let result = svg;
  for (let index = 0; index < referencedIds.length; index++) {
    const id = referencedIds[index];
    const definitions = [...result.matchAll(/<(radialGradient|linearGradient)\b[^>]*>/gi)];
    const existing = definitions.find((entry) => new RegExp(`\\bid\\s*=\\s*['"]${id}['"]`, 'i').test(entry[0]));

    if (existing) {
      const openingTag = existing[0];
      const start = existing.index ?? -1;
      if (start < 0) continue;
      const closePattern = new RegExp(`</${existing[1]}\\s*>`, 'i');
      const endMatch = closePattern.exec(result.slice(start + openingTag.length));
      const end = endMatch ? start + openingTag.length + endMatch.index + endMatch[0].length : -1;
      // Inherited gradients should be resolved by the SVG engine; do not
      // override them based on the absence of local stops.
      if (/\b(?:href|xlink:href)\s*=/.test(openingTag)) continue;
      const markup = end < 0 ? openingTag : result.slice(start, end);
      const stops = [...markup.matchAll(/<stop\b[^>]*>/gi)];
      const isExplicitBlack = (stop: string): boolean => {
        const color = /\bstop-color\s*=\s*(['"])(.*?)\1/i.exec(stop)?.[2]
          ?? /\bstop-color\s*:\s*([^;"']+)/i.exec(stop)?.[1];
        // A stop may get its color from a CSS class or stylesheet; don't
        // mistake a missing inline color for an explicitly black gradient.
        return color !== undefined && ['black', '#000', '#000000', 'rgb(0,0,0)', 'rgb(0%,0%,0%)'].includes(color.trim().toLowerCase().replace(/\s+/g, ''));
      };
      if (stops.length > 0 && !stops.every((stop) => isExplicitBlack(stop[0]))) continue;
      // Broken / all-black gradient definition. Preserve its existing ID.
      const replacement = gradientMarkup(balls[index], id);
      if (end >= 0) {
        result = result.slice(0, start) + replacement + result.slice(end);
      } else if (/\/>$/.test(openingTag)) {
        result = result.slice(0, start) + replacement + result.slice(start + openingTag.length);
      }
      continue;
    }
    // Avoid duplicate IDs if the URL points to a non-gradient paint server.
    if (new RegExp(`\\bid\\s*=\\s*['"]${id}['"]`, 'i').test(result)) continue;
    const definition = gradientMarkup(balls[index], id);
    result = /<defs\b[^>]*>/i.test(result)
      ? result.replace(/(<defs\b[^>]*>)/i, `$1${definition}`)
      : result.replace(/(<svg\b[^>]*>)/i, `$1<defs>${definition}</defs>`);
  }

  return { svg: result, foundReferences: true };
}

/** Restore black-flattened shaded SVG paths where a one-to-one match is safe. */
export function restoreTikzSvgShading(svg: string, source: string): string {
  const shadings = shadingCommands(source);
  if (!shadings.length || !/^\s*<svg\b/i.test(svg)) return svg;

  const referenced = restoreReferencedBallGradients(svg, shadings);
  // Never recolor unrelated black shapes when the actual shaded paths use a
  // URL fill. They already point to a paint server, repaired if needed.
  if (referenced.foundReferences) return referenced.svg;

  const candidates = [...svg.matchAll(/<(?:path|circle|ellipse|rect|polygon)\b[^>]*>/gi)].filter((match) => blackFill(match[0]));
  // A rendered diagram may contain ordinary black fills (text, labels,
  // axes). Never guess which of them originated in a shading command.
  if (candidates.length !== shadings.length) return svg;

  const ids = shadings.map((_, i) => `slonig-shade-${i}`);
  const definitions = shadings.map((shading, i) => gradientMarkup(shading, ids[i])).join('');
  let index = 0;
  const painted = svg.replace(/<(?:path|circle|ellipse|rect|polygon)\b[^>]*>/gi, (tag) => {
    if (!blackFill(tag)) return tag;
    const id = ids[index++];
    const styleMatch = /\sstyle\s*=\s*(['"])(.*?)\1/i.exec(tag);
    if (styleMatch && /\bfill\s*:/i.test(styleMatch[2])) {
      return tag.replace(styleMatch[0], ` style=${styleMatch[1]}${styleMatch[2].replace(/\bfill\s*:\s*[^;]+/i, `fill:url(#${id})`)}${styleMatch[1]}`);
    }
    return tag.replace(/\sfill\s*=\s*(['"])(.*?)\1/i, ` fill="url(#${id})"`);
  });
  // Use a fresh <defs> block without changing source SVG ids or paint order.
  return painted.replace(/(<svg\b[^>]*>)/i, `$1<defs>${definitions}</defs>`);
}
