// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

const DEFAULT_WIDTH = 960;
const DEFAULT_HEIGHT = 640;
const MAX_ELEMENTS = 300;
const MAX_TEXT_LENGTH = 240;
const MIN_SAFE_MARGIN = 36;
const METADATA_ID = 'slonig-visual-spec';

export type VisualPlan = RasterVisualPlan | VectorVisualPlan | VectorPatchPlan;

export interface RasterVisualPlan {
  format: 'raster';
}

export interface VectorVisualPlan {
  format: 'vector';
  scene: MathVisualSpec;
}

export interface VectorPatchPlan {
  format: 'vector-patch';
  operations: VisualPatchOperation[];
}

export interface MathVisualSpec {
  background?: string;
  elements: MathVisualElement[];
  height: number;
  viewBox?: [number, number, number, number];
  width: number;
}

export type MathVisualElement =
  | VisualLine
  | VisualRect
  | VisualCircle
  | VisualEllipse
  | VisualPolygon
  | VisualPolyline
  | VisualArc
  | VisualText;

interface VisualBase {
  id: string;
  opacity?: number;
}

interface VisualStrokeStyle {
  dash?: number[];
  stroke?: string;
  strokeWidth?: number;
}

interface VisualFillStyle {
  fill?: string;
}

export interface VisualLine extends VisualBase, VisualStrokeStyle {
  arrowEnd?: boolean;
  arrowStart?: boolean;
  type: 'line';
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

export interface VisualRect extends VisualBase, VisualStrokeStyle, VisualFillStyle {
  height: number;
  rx?: number;
  type: 'rect';
  width: number;
  x: number;
  y: number;
}

export interface VisualCircle extends VisualBase, VisualStrokeStyle, VisualFillStyle {
  cx: number;
  cy: number;
  r: number;
  type: 'circle';
}

export interface VisualEllipse extends VisualBase, VisualStrokeStyle, VisualFillStyle {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  type: 'ellipse';
}

export interface VisualPolygon extends VisualBase, VisualStrokeStyle, VisualFillStyle {
  points: Array<[number, number]>;
  type: 'polygon';
}

export interface VisualPolyline extends VisualBase, VisualStrokeStyle, VisualFillStyle {
  points: Array<[number, number]>;
  type: 'polyline';
}

export interface VisualArc extends VisualBase, VisualStrokeStyle {
  cx: number;
  cy: number;
  endAngle: number;
  r: number;
  startAngle: number;
  type: 'arc';
}

export interface VisualText extends VisualBase {
  anchor?: 'end' | 'middle' | 'start';
  fill?: string;
  fontSize?: number;
  fontWeight?: 'bold' | 'normal';
  rotate?: number;
  text: string;
  type: 'text';
  x: number;
  y: number;
}

export type VisualPatchOperation =
  | { element: MathVisualElement; op: 'add' }
  | { id: string; op: 'remove' }
  | { element: MathVisualElement; id: string; op: 'update' };

interface Bounds {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

type UnknownRecord = Record<string, unknown>;

function isRecord (value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber (value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number.`);
  }

  return value;
}

function optionalFiniteNumber (value: unknown, name: string): number | undefined {
  return value === undefined ? undefined : finiteNumber(value, name);
}

function positiveNumber (value: unknown, name: string): number {
  const number = finiteNumber(value, name);

  if (number <= 0) {
    throw new Error(`${name} must be greater than zero.`);
  }

  return number;
}

function optionalPositiveNumber (value: unknown, name: string): number | undefined {
  return value === undefined ? undefined : positiveNumber(value, name);
}

function booleanValue (value: unknown, name: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'boolean') {
    throw new Error(`${name} must be boolean.`);
  }

  return value;
}

function safeColor (value: unknown, name: string, fallback?: string): string | undefined {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'string') {
    throw new Error(`${name} must be a color string.`);
  }

  const color = value.trim().toLowerCase();

  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) || /^(?:black|white|gray|grey|red|blue|green|orange|purple|yellow|brown|transparent|none)$/i.test(color)) {
    return color;
  }

  throw new Error(`${name} uses an unsupported color.`);
}

function opacityValue (value: unknown, name: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const opacity = finiteNumber(value, name);

  if (opacity < 0 || opacity > 1) {
    throw new Error(`${name} must be between 0 and 1.`);
  }

  return opacity;
}

function idValue (value: unknown, name: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value)) {
    throw new Error(`${name} must be a short stable identifier beginning with a letter.`);
  }

  return value;
}

function parseDash (value: unknown, name: string): number[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length > 8) {
    throw new Error(`${name} must be a short numeric array.`);
  }

  return value.map((item, index) => positiveNumber(item, `${name}[${index}]`));
}

function parsePoints (value: unknown, name: string): Array<[number, number]> {
  if (!Array.isArray(value) || value.length < 2 || value.length > 200) {
    throw new Error(`${name} must contain between 2 and 200 points.`);
  }

  return value.map((point, index) => {
    if (!Array.isArray(point) || point.length !== 2) {
      throw new Error(`${name}[${index}] must be [x,y].`);
    }

    return [finiteNumber(point[0], `${name}[${index}][0]`), finiteNumber(point[1], `${name}[${index}][1]`)] as [number, number];
  });
}

function commonBase (record: UnknownRecord, index: number): VisualBase {
  return {
    id: idValue(record.id, `elements[${index}].id`),
    opacity: opacityValue(record.opacity, `elements[${index}].opacity`)
  };
}

function strokeStyle (record: UnknownRecord, index: number): VisualStrokeStyle {
  return {
    dash: parseDash(record.dash, `elements[${index}].dash`),
    stroke: safeColor(record.stroke, `elements[${index}].stroke`, 'black'),
    strokeWidth: optionalPositiveNumber(record.strokeWidth, `elements[${index}].strokeWidth`) ?? 2
  };
}

function fillStyle (record: UnknownRecord, index: number, fallback = 'none'): VisualFillStyle {
  return { fill: safeColor(record.fill, `elements[${index}].fill`, fallback) };
}

function parseElement (value: unknown, index: number): MathVisualElement {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new Error(`elements[${index}] must be an object with a type.`);
  }

  const base = commonBase(value, index);
  const stroke = strokeStyle(value, index);

  switch (value.type) {
    case 'line':
      return {
        ...base,
        ...stroke,
        arrowEnd: booleanValue(value.arrowEnd, `elements[${index}].arrowEnd`),
        arrowStart: booleanValue(value.arrowStart, `elements[${index}].arrowStart`),
        type: 'line',
        x1: finiteNumber(value.x1, `elements[${index}].x1`),
        x2: finiteNumber(value.x2, `elements[${index}].x2`),
        y1: finiteNumber(value.y1, `elements[${index}].y1`),
        y2: finiteNumber(value.y2, `elements[${index}].y2`)
      };
    case 'rect':
      return {
        ...base,
        ...stroke,
        ...fillStyle(value, index),
        height: positiveNumber(value.height, `elements[${index}].height`),
        rx: optionalFiniteNumber(value.rx, `elements[${index}].rx`),
        type: 'rect',
        width: positiveNumber(value.width, `elements[${index}].width`),
        x: finiteNumber(value.x, `elements[${index}].x`),
        y: finiteNumber(value.y, `elements[${index}].y`)
      };
    case 'circle':
      return {
        ...base,
        ...stroke,
        ...fillStyle(value, index),
        cx: finiteNumber(value.cx, `elements[${index}].cx`),
        cy: finiteNumber(value.cy, `elements[${index}].cy`),
        r: positiveNumber(value.r, `elements[${index}].r`),
        type: 'circle'
      };
    case 'ellipse':
      return {
        ...base,
        ...stroke,
        ...fillStyle(value, index),
        cx: finiteNumber(value.cx, `elements[${index}].cx`),
        cy: finiteNumber(value.cy, `elements[${index}].cy`),
        rx: positiveNumber(value.rx, `elements[${index}].rx`),
        ry: positiveNumber(value.ry, `elements[${index}].ry`),
        type: 'ellipse'
      };
    case 'polygon':
      return { ...base, ...stroke, ...fillStyle(value, index), points: parsePoints(value.points, `elements[${index}].points`), type: 'polygon' };
    case 'polyline':
      return { ...base, ...stroke, ...fillStyle(value, index), points: parsePoints(value.points, `elements[${index}].points`), type: 'polyline' };
    case 'arc':
      return {
        ...base,
        ...stroke,
        cx: finiteNumber(value.cx, `elements[${index}].cx`),
        cy: finiteNumber(value.cy, `elements[${index}].cy`),
        endAngle: finiteNumber(value.endAngle, `elements[${index}].endAngle`),
        r: positiveNumber(value.r, `elements[${index}].r`),
        startAngle: finiteNumber(value.startAngle, `elements[${index}].startAngle`),
        type: 'arc'
      };
    case 'text': {
      if (typeof value.text !== 'string' || !value.text.trim() || value.text.length > MAX_TEXT_LENGTH) {
        throw new Error(`elements[${index}].text must be non-empty and at most ${MAX_TEXT_LENGTH} characters.`);
      }

      const anchor = value.anchor;
      const fontWeight = value.fontWeight;

      if (anchor !== undefined && anchor !== 'start' && anchor !== 'middle' && anchor !== 'end') {
        throw new Error(`elements[${index}].anchor is invalid.`);
      }

      if (fontWeight !== undefined && fontWeight !== 'normal' && fontWeight !== 'bold') {
        throw new Error(`elements[${index}].fontWeight is invalid.`);
      }

      return {
        ...base,
        anchor: anchor as 'end' | 'middle' | 'start' | undefined,
        fill: safeColor(value.fill, `elements[${index}].fill`, 'black'),
        fontSize: optionalPositiveNumber(value.fontSize, `elements[${index}].fontSize`) ?? 24,
        fontWeight: fontWeight as 'bold' | 'normal' | undefined,
        rotate: optionalFiniteNumber(value.rotate, `elements[${index}].rotate`),
        text: value.text,
        type: 'text',
        x: finiteNumber(value.x, `elements[${index}].x`),
        y: finiteNumber(value.y, `elements[${index}].y`)
      };
    }
    default:
      throw new Error(`elements[${index}].type "${value.type}" is unsupported.`);
  }
}

function parseViewBox (value: unknown): [number, number, number, number] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length !== 4) {
    throw new Error('scene.viewBox must be [x,y,width,height].');
  }

  return [
    finiteNumber(value[0], 'scene.viewBox[0]'),
    finiteNumber(value[1], 'scene.viewBox[1]'),
    positiveNumber(value[2], 'scene.viewBox[2]'),
    positiveNumber(value[3], 'scene.viewBox[3]')
  ];
}

export function parseMathVisualSpec (value: unknown): MathVisualSpec {
  if (!isRecord(value)) {
    throw new Error('scene must be an object.');
  }

  if (!Array.isArray(value.elements) || value.elements.length === 0 || value.elements.length > MAX_ELEMENTS) {
    throw new Error(`scene.elements must contain 1-${MAX_ELEMENTS} elements.`);
  }

  const elements = value.elements.map(parseElement);
  const ids = new Set<string>();

  for (const element of elements) {
    if (ids.has(element.id)) {
      throw new Error(`Duplicate visual element id: ${element.id}.`);
    }

    ids.add(element.id);
  }

  const width = value.width === undefined ? DEFAULT_WIDTH : positiveNumber(value.width, 'scene.width');
  const height = value.height === undefined ? DEFAULT_HEIGHT : positiveNumber(value.height, 'scene.height');

  if (width > 4096 || height > 4096) {
    throw new Error('scene dimensions are unreasonably large.');
  }

  return {
    background: safeColor(value.background, 'scene.background', 'white'),
    elements,
    height,
    viewBox: parseViewBox(value.viewBox),
    width
  };
}

function parsePatchOperation (value: unknown, index: number): VisualPatchOperation {
  if (!isRecord(value) || typeof value.op !== 'string') {
    throw new Error(`operations[${index}] must contain op.`);
  }

  if (value.op === 'add') {
    return { element: parseElement(value.element, index), op: 'add' };
  }

  if (value.op === 'remove') {
    return { id: idValue(value.id, `operations[${index}].id`), op: 'remove' };
  }

  if (value.op === 'update') {
    const id = idValue(value.id, `operations[${index}].id`);
    const element = parseElement(value.element, index);

    if (element.id !== id) {
      throw new Error(`operations[${index}] update element id must equal operation id.`);
    }

    return { element, id, op: 'update' };
  }

  throw new Error(`operations[${index}].op is unsupported.`);
}

export function parseVisualPlan (value: unknown, patchExpected = false): VisualPlan {
  if (!isRecord(value) || typeof value.format !== 'string') {
    throw new Error('Visual plan must contain format.');
  }

  if (value.format === 'raster') {
    if (patchExpected) {
      throw new Error('A visual modification must patch the existing vector scene, not switch to raster.');
    }

    return { format: 'raster' };
  }

  if (value.format === 'vector') {
    if (patchExpected) {
      throw new Error('A visual modification must return vector-patch operations so the base scene stays unchanged.');
    }

    return { format: 'vector', scene: parseMathVisualSpec(value.scene) };
  }

  if (value.format === 'vector-patch') {
    if (!patchExpected) {
      throw new Error('vector-patch is only valid when a reference vector scene exists.');
    }

    if (!Array.isArray(value.operations) || value.operations.length === 0 || value.operations.length > 100) {
      throw new Error('operations must contain 1-100 patch operations.');
    }

    return { format: 'vector-patch', operations: value.operations.map(parsePatchOperation) };
  }

  throw new Error(`Unsupported visual format: ${value.format}.`);
}

export function applyVisualPatch (base: MathVisualSpec, operations: VisualPatchOperation[]): MathVisualSpec {
  const elements = base.elements.map((element) => ({ ...element } as MathVisualElement));
  const byId = new Map(elements.map((element, index) => [element.id, index]));

  for (const operation of operations) {
    if (operation.op === 'add') {
      if (byId.has(operation.element.id)) {
        throw new Error(`Cannot add existing visual element ${operation.element.id}.`);
      }

      byId.set(operation.element.id, elements.length);
      elements.push(operation.element);
    } else if (operation.op === 'remove') {
      const index = byId.get(operation.id);

      if (index === undefined) {
        throw new Error(`Cannot remove missing visual element ${operation.id}.`);
      }

      elements.splice(index, 1);
      byId.clear();
      elements.forEach((element, elementIndex) => byId.set(element.id, elementIndex));
    } else {
      const index = byId.get(operation.id);

      if (index === undefined) {
        throw new Error(`Cannot update missing visual element ${operation.id}.`);
      }

      if (elements[index].type !== operation.element.type) {
        throw new Error(`Cannot change visual element ${operation.id} from ${elements[index].type} to ${operation.element.type}.`);
      }

      elements[index] = operation.element;
    }
  }

  if (!elements.length) {
    throw new Error('A patch cannot remove every visual element.');
  }

  return { ...base, elements };
}

function strokePadding (element: MathVisualElement): number {
  return 'strokeWidth' in element ? (element.strokeWidth ?? 2) / 2 : 0;
}

function pointBounds (points: Array<[number, number]>, padding: number): Bounds {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);

  return {
    bottom: Math.max(...ys) + padding,
    left: Math.min(...xs) - padding,
    right: Math.max(...xs) + padding,
    top: Math.min(...ys) - padding
  };
}

function elementBounds (element: MathVisualElement): Bounds {
  const padding = strokePadding(element);

  switch (element.type) {
    case 'line':
      return pointBounds([[element.x1, element.y1], [element.x2, element.y2]], padding + (element.arrowEnd || element.arrowStart ? (element.strokeWidth ?? 2) * 4 : 0));
    case 'rect':
      return { bottom: element.y + element.height + padding, left: element.x - padding, right: element.x + element.width + padding, top: element.y - padding };
    case 'circle':
      return { bottom: element.cy + element.r + padding, left: element.cx - element.r - padding, right: element.cx + element.r + padding, top: element.cy - element.r - padding };
    case 'ellipse':
      return { bottom: element.cy + element.ry + padding, left: element.cx - element.rx - padding, right: element.cx + element.rx + padding, top: element.cy - element.ry - padding };
    case 'polygon':
    case 'polyline':
      return pointBounds(element.points, padding);
    case 'arc':
      // A full-circle bound is deliberately conservative and prevents clipping
      // even when the requested angular interval crosses 0 degrees.
      return { bottom: element.cy + element.r + padding, left: element.cx - element.r - padding, right: element.cx + element.r + padding, top: element.cy - element.r - padding };
    case 'text': {
      const fontSize = element.fontSize ?? 24;
      const approximateWidth = Math.max(fontSize * 0.55, Array.from(element.text).length * fontSize * 0.62);
      const left = element.anchor === 'middle'
        ? element.x - approximateWidth / 2
        : element.anchor === 'end'
          ? element.x - approximateWidth
          : element.x;

      // Use a deliberately generous text box because exact font metrics differ
      // across browsers. Rotation uses a circumscribed square for safety.
      const height = fontSize * 1.35;
      const raw: Bounds = { bottom: element.y + fontSize * 0.35, left, right: left + approximateWidth, top: element.y - height };

      if (!element.rotate) {
        return raw;
      }

      const radius = Math.hypot(approximateWidth, height) / 2;

      return { bottom: element.y + radius, left: element.x - radius, right: element.x + radius, top: element.y - radius };
    }
  }
}

export function visualSceneBounds (scene: MathVisualSpec): Bounds {
  const bounds = scene.elements.map(elementBounds);

  return {
    bottom: Math.max(...bounds.map(({ bottom }) => bottom)),
    left: Math.min(...bounds.map(({ left }) => left)),
    right: Math.max(...bounds.map(({ right }) => right)),
    top: Math.min(...bounds.map(({ top }) => top))
  };
}

function computedViewBox (scene: MathVisualSpec): [number, number, number, number] {
  const bounds = visualSceneBounds(scene);
  const contentWidth = Math.max(1, bounds.right - bounds.left);
  const contentHeight = Math.max(1, bounds.bottom - bounds.top);
  const margin = Math.max(MIN_SAFE_MARGIN, Math.max(contentWidth, contentHeight) * 0.08);
  let x = bounds.left - margin;
  let y = bounds.top - margin;
  let width = contentWidth + 2 * margin;
  let height = contentHeight + 2 * margin;
  const targetAspect = scene.width / scene.height;
  const currentAspect = width / height;

  // Match the viewBox aspect ratio to the actual output canvas. This keeps the
  // safe padded bounds while avoiding excessive letterboxing that would make a
  // perfectly valid diagram look unexpectedly tiny.
  if (currentAspect > targetAspect) {
    const expandedHeight = width / targetAspect;

    y -= (expandedHeight - height) / 2;
    height = expandedHeight;
  } else if (currentAspect < targetAspect) {
    const expandedWidth = height * targetAspect;

    x -= (expandedWidth - width) / 2;
    width = expandedWidth;
  }

  return [x, y, width, height];
}

function boundsFitViewBox (bounds: Bounds, viewBox: [number, number, number, number]): boolean {
  const [x, y, width, height] = viewBox;
  const margin = Math.min(width, height) * 0.02;

  return bounds.left >= x + margin && bounds.top >= y + margin && bounds.right <= x + width - margin && bounds.bottom <= y + height - margin;
}

export function prepareMathVisualSpec (scene: MathVisualSpec): MathVisualSpec {
  const prepared = { ...scene, viewBox: scene.viewBox ?? computedViewBox(scene) };

  if (!boundsFitViewBox(visualSceneBounds(prepared), prepared.viewBox as [number, number, number, number])) {
    throw new Error('Visual content would be clipped by the preserved viewBox. Keep all labels, marks, and shapes inside the existing canvas.');
  }

  return prepared;
}

function xmlEscape (value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function attr (name: string, value: string | number | boolean | undefined): string {
  return value === undefined ? '' : ` ${name}="${xmlEscape(String(value))}"`;
}

function styleAttributes (element: MathVisualElement): string {
  let result = attr('opacity', element.opacity);

  if ('stroke' in element) {
    result += attr('stroke', element.stroke ?? 'black');
    result += attr('stroke-width', element.strokeWidth ?? 2);
    result += ' stroke-linecap="round" stroke-linejoin="round"';

    if (element.dash?.length) {
      result += attr('stroke-dasharray', element.dash.join(' '));
    }
  }

  if ('fill' in element && element.type !== 'text') {
    result += attr('fill', element.fill ?? 'none');
  }

  return result;
}

function pointsAttribute (points: Array<[number, number]>): string {
  return points.map(([x, y]) => `${x},${y}`).join(' ');
}

function arcPath (element: VisualArc): string {
  const startRadians = element.startAngle * Math.PI / 180;
  const endRadians = element.endAngle * Math.PI / 180;
  const startX = element.cx + element.r * Math.cos(startRadians);
  const startY = element.cy + element.r * Math.sin(startRadians);
  const endX = element.cx + element.r * Math.cos(endRadians);
  const endY = element.cy + element.r * Math.sin(endRadians);
  let delta = (element.endAngle - element.startAngle) % 360;

  if (delta < 0) {
    delta += 360;
  }

  return `M ${startX} ${startY} A ${element.r} ${element.r} 0 ${delta > 180 ? 1 : 0} 1 ${endX} ${endY}`;
}

function renderElement (element: MathVisualElement): string {
  const common = `${attr('id', element.id)}${styleAttributes(element)}`;

  switch (element.type) {
    case 'line':
      return `<line${common}${attr('x1', element.x1)}${attr('y1', element.y1)}${attr('x2', element.x2)}${attr('y2', element.y2)}${element.arrowStart ? ' marker-start="url(#slonig-arrow-start)"' : ''}${element.arrowEnd ? ' marker-end="url(#slonig-arrow-end)"' : ''}/>`;
    case 'rect':
      return `<rect${common}${attr('x', element.x)}${attr('y', element.y)}${attr('width', element.width)}${attr('height', element.height)}${attr('rx', element.rx)}/>`;
    case 'circle':
      return `<circle${common}${attr('cx', element.cx)}${attr('cy', element.cy)}${attr('r', element.r)}/>`;
    case 'ellipse':
      return `<ellipse${common}${attr('cx', element.cx)}${attr('cy', element.cy)}${attr('rx', element.rx)}${attr('ry', element.ry)}/>`;
    case 'polygon':
      return `<polygon${common}${attr('points', pointsAttribute(element.points))}/>`;
    case 'polyline':
      return `<polyline${common}${attr('points', pointsAttribute(element.points))}/>`;
    case 'arc':
      return `<path${common} fill="none"${attr('d', arcPath(element))}/>`;
    case 'text': {
      const transform = element.rotate ? `rotate(${element.rotate} ${element.x} ${element.y})` : undefined;

      return `<text${attr('id', element.id)}${attr('x', element.x)}${attr('y', element.y)}${attr('fill', element.fill ?? 'black')}${attr('font-size', element.fontSize ?? 24)} font-family="Arial, Helvetica, sans-serif"${attr('font-weight', element.fontWeight)}${attr('text-anchor', element.anchor ?? 'start')}${attr('opacity', element.opacity)}${attr('transform', transform)}>${xmlEscape(element.text)}</text>`;
    }
  }
}

function encodeUtf8Base64 (value: string): string {
  const bytes = new TextEncoder().encode(value);
  const chunkSize = 0x8000;
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return globalThis.btoa(binary);
}

function decodeUtf8Base64 (value: string): string {
  const binary = globalThis.atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

export function renderMathVisualSvg (input: MathVisualSpec): { scene: MathVisualSpec; svg: string } {
  const scene = prepareMathVisualSpec(input);
  const viewBox = scene.viewBox as [number, number, number, number];
  const metadata = encodeUtf8Base64(JSON.stringify(scene));
  const background = scene.background && scene.background !== 'transparent' && scene.background !== 'none'
    ? `<rect x="${viewBox[0]}" y="${viewBox[1]}" width="${viewBox[2]}" height="${viewBox[3]}" fill="${xmlEscape(scene.background)}"/>`
    : '';
  const defs = `<defs><marker id="slonig-arrow-end" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L8,4 L0,8 Z" fill="context-stroke"/></marker><marker id="slonig-arrow-start" markerWidth="8" markerHeight="8" refX="1" refY="4" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M8,0 L0,4 L8,8 Z" fill="context-stroke"/></marker></defs>`;
  const body = scene.elements.map(renderElement).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" viewBox="${viewBox.join(' ')}" preserveAspectRatio="xMidYMid meet"><metadata id="${METADATA_ID}">${metadata}</metadata>${defs}${background}${body}</svg>`;

  return { scene, svg };
}

export function extractMathVisualSpecFromSvg (svg: string): MathVisualSpec | undefined {
  const match = svg.match(new RegExp(`<metadata\\s+id=["']${METADATA_ID}["']>([^<]+)<\\/metadata>`, 'i'));

  if (!match) {
    return undefined;
  }

  try {
    return parseMathVisualSpec(JSON.parse(decodeUtf8Base64(match[1])) as unknown);
  } catch {
    return undefined;
  }
}
