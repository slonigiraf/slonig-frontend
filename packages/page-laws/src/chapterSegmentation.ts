// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookPage, MathpixHeading } from '@slonigiraf/db';


export function extractMathpixHeadingsFromLines (value: unknown): MathpixHeading[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  const pages = (value as { pages?: unknown }).pages;

  if (!Array.isArray(pages)) {
    return [];
  }

  return pages.flatMap((page) => {
    if (!page || typeof page !== 'object' || !Array.isArray((page as { lines?: unknown }).lines)) {
      return [];
    }

    return ((page as { lines: unknown[] }).lines).flatMap((line) => {
      if (!line || typeof line !== 'object') {
        return [];
      }

      const candidate = line as { confidence?: unknown; conversion_output?: unknown; line?: unknown; text?: unknown; text_display?: unknown; type?: unknown };

      if (candidate.conversion_output === false || (candidate.type !== 'title' && candidate.type !== 'section_header')) {
        return [];
      }

      const text = (typeof candidate.text === 'string' ? candidate.text : typeof candidate.text_display === 'string' ? candidate.text_display : '').replace(/\s+/g, ' ').trim();

      if (!text) {
        return [];
      }

      return [{
        ...(typeof candidate.confidence === 'number' ? { confidence: candidate.confidence } : {}),
        ...(typeof candidate.line === 'number' ? { line: candidate.line } : {}),
        text,
        type: candidate.type
      } satisfies MathpixHeading];
    });
  });
}

export interface ChapterBoundaryProposal {
  confidence: number;
  startPage: number;
  title: string;
}

export interface ChapterPageEvidence {
  excerpt: string;
  headings: Array<{ confidence?: number; line?: number; signal?: 'section-sign' | 'uppercase-caption'; source: 'mathpix' | 'mmd'; text: string; type: 'section_header' | 'title' }>;
  pageNumber: number;
}

const cleanHeading = (value: string): string => value
  .replace(/\s+/g, ' ')
  .replace(/^#+\s*/, '')
  .replace(/^\*\*(.+)\*\*$/, '$1')
  .replace(/^__(.+)__$/, '$1')
  .replace(/^\\textbf\{(.+)\}$/, '$1')
  .trim();

function isUppercaseCaption (value: string): boolean {
  const cleaned = cleanHeading(value);

  if (!cleaned || cleaned.length > 140 || cleaned.split(/\s+/).length > 16 || /^(?:!\[|[-*_`>|]|\\)/.test(cleaned)) {
    return false;
  }

  const letters = [...cleaned].filter((character) => character.toLocaleLowerCase() !== character.toLocaleUpperCase());
  const uppercaseCount = letters.filter((character) => character === character.toLocaleUpperCase()).length;
  const lowercaseCount = letters.length - uppercaseCount;

  // Printed all-caps textbook headings often retain lowercase abbreviations
  // such as "в.", "г." and "гг.". Allow only a tiny lowercase residue so
  // ordinary sentence-case body text is still rejected.
  return letters.length >= 3 && lowercaseCount <= 3 && uppercaseCount / letters.length >= 0.9;
}

export function extractMmdHeadings (mmd: string): ChapterPageEvidence['headings'] {
  const result: ChapterPageEvidence['headings'] = [];
  const seen = new Set<string>();
  const add = (text: string, type: 'section_header' | 'title', signal?: 'section-sign' | 'uppercase-caption'): void => {
    const cleaned = cleanHeading(text);
    const key = `${type}:${cleaned.toLocaleLowerCase()}`;

    if (cleaned && !seen.has(key)) {
      seen.add(key);
      result.push({ ...(signal === undefined ? {} : { signal }), source: 'mmd', text: cleaned, type });
    }
  };

  let sectionSignPending: string | undefined;
  let uppercasePending: string[] = [];
  const flushUppercase = (): void => {
    if (uppercasePending.length) {
      add(uppercasePending.join(' '), 'section_header', 'uppercase-caption');
      uppercasePending = [];
    }
  };

  for (const line of mmd.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (/^§+\s*$/.test(trimmed)) {
      flushUppercase();
      sectionSignPending = '';
      continue;
    }

    const sectionSign = /^§+\s*(.+?)\s*$/.exec(trimmed);

    if (sectionSign) {
      flushUppercase();
      const rest = cleanHeading(sectionSign[1]);

      // OCR/MMD sometimes puts only "§ 3" on one line and the caption on
      // the next. Preserve the number and join it to that caption.
      if (/^\d{1,3}[.):\-–—]?$/.test(rest)) {
        sectionSignPending = rest.replace(/[.):\-–—]+$/, '');
      } else {
        add(rest, 'section_header', 'section-sign');
        sectionSignPending = undefined;
      }
      continue;
    }

    const markdown = /^(#{1,3})\s+(.+?)\s*$/.exec(line);

    if (markdown) {
      flushUppercase();
      add(markdown[2], markdown[1].length === 1 ? 'title' : 'section_header');
      sectionSignPending = undefined;
      continue;
    }

    const latex = /^\\(chapter|section|subsection)\*?\{(.+?)\}\s*$/.exec(trimmed);

    if (latex) {
      flushUppercase();
      add(latex[2], latex[1] === 'chapter' ? 'title' : 'section_header');
      sectionSignPending = undefined;
      continue;
    }

    if (sectionSignPending !== undefined && trimmed) {
      flushUppercase();
      add(`${sectionSignPending}${sectionSignPending ? ' ' : ''}${cleanHeading(trimmed)}`, 'section_header', 'section-sign');
      sectionSignPending = undefined;
      continue;
    }

    if (isUppercaseCaption(trimmed)) {
      const cleaned = cleanHeading(trimmed);
      const combined = [...uppercasePending, cleaned].join(' ');

      // Consecutive uppercase lines are commonly one wrapped textbook title.
      if (combined.length <= 180 && combined.split(/\s+/).length <= 22) {
        uppercasePending.push(cleaned);
      } else {
        flushUppercase();
        uppercasePending.push(cleaned);
      }
      continue;
    }

    flushUppercase();
  }

  flushUppercase();

  return result;
}

export function pageChapterEvidence (page: BookPage): ChapterPageEvidence {
  const headings: ChapterPageEvidence['headings'] = [];
  const seen = new Set<string>();
  const add = (heading: ChapterPageEvidence['headings'][number]): void => {
    const text = cleanHeading(heading.text);
    const key = `${heading.type}:${text.toLocaleLowerCase()}`;

    if (text && !seen.has(key)) {
      seen.add(key);
      headings.push({ ...heading, text });
    }
  };

  (page.mathpixHeadings ?? []).forEach(({ confidence, line, text, type }) => add({ ...(confidence === undefined ? {} : { confidence }), ...(line === undefined ? {} : { line }), source: 'mathpix', text, type }));
  extractMmdHeadings(page.pageMMD ?? '').forEach(add);

  const excerpt = (page.pageMMD ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 650);

  return { excerpt, headings, pageNumber: page.pageNumber };
}

interface NumberedChapterCandidate extends ChapterBoundaryProposal {
  chapterNumber: number;
  scheme: 'chapter' | 'paragraph' | 'section';
}

const FRONT_MATTER_HEADING = /^(?:acknowledg(?:e)?ments?|appendix|bibliography|contents?|copyright|dedication|foreword|glossary|index|preface|references?)$/i;
const ROMAN_VALUE: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

function romanToNumber (value: string): number | undefined {
  const roman = value.toUpperCase();

  if (!/^[IVXLCDM]+$/.test(roman)) {
    return undefined;
  }

  let total = 0;

  for (let index = 0; index < roman.length; index++) {
    const current = ROMAN_VALUE[roman[index]] ?? 0;
    const next = ROMAN_VALUE[roman[index + 1]] ?? 0;

    total += current < next ? -current : current;
  }

  return total > 0 ? total : undefined;
}

function parsePositiveIntegerOrRoman (value: string): number | undefined {
  const normalized = value.trim();

  if (/^\d{1,3}$/.test(normalized)) {
    const result = Number(normalized);

    return result > 0 ? result : undefined;
  }

  return romanToNumber(normalized);
}

function chapterNumberFromHeading (text: string): number | undefined {
  const match = /^(?:chapter|chap\.?)(?:\s+|\s*[:.-]\s*)(\d{1,3}|[IVXLCDM]+)\b/i.exec(cleanHeading(text));

  return match ? parsePositiveIntegerOrRoman(match[1]) : undefined;
}

function sectionChapterNumber (text: string): number | undefined {
  const match = /^(\d{1,3})\s*\.\s*\d+\b/.exec(cleanHeading(text));

  if (!match) {
    return undefined;
  }

  const result = Number(match[1]);

  return result > 0 ? result : undefined;
}

function localItemNumber (text: string): number | undefined {
  const match = /^(\d{1,3})\s*\.\s+\S/.exec(cleanHeading(text));

  if (!match) {
    return undefined;
  }

  const result = Number(match[1]);

  return result > 0 ? result : undefined;
}

function paragraphNumberFromHeading (heading: ChapterPageEvidence['headings'][number]): number | undefined {
  if (heading.signal !== 'section-sign') {
    return undefined;
  }

  const match = /^(\d{1,3})(?:\s*[.):\-–—]?\s+|\s*[.):\-–—](?=\S)|(?=\p{L}))/u.exec(cleanHeading(heading.text));

  return match ? Number(match[1]) : undefined;
}

function inferredParagraphNumberFromHeading (heading: ChapterPageEvidence['headings'][number]): number | undefined {
  if (heading.signal === 'section-sign' || !isUppercaseCaption(heading.text)) {
    return undefined;
  }

  // OCR can lose a structural marker while retaining a chapter number glued
  // to the caption. Treat that as a paragraph number only after the book has
  // already demonstrated a §-numbered scheme; never infer it in isolation.
  const match = /^(\d{1,3})(?=\p{L})/u.exec(cleanHeading(heading.text));

  return match ? Number(match[1]) : undefined;
}

function paragraphTitleFromHeading (heading: ChapterPageEvidence['headings'][number], allowInferred = false): string | undefined {
  const explicitNumber = paragraphNumberFromHeading(heading);
  const inferredNumber = allowInferred ? inferredParagraphNumberFromHeading(heading) : undefined;

  if (explicitNumber === undefined && inferredNumber === undefined) {
    return undefined;
  }

  const cleaned = cleanHeading(heading.text);
  const title = explicitNumber !== undefined
    ? cleaned.replace(/^\d{1,3}\s*[.):\-–—]?\s*/, '').trim()
    : cleaned.replace(/^\d{1,3}(?=\p{L})/u, '').trim();

  return title || undefined;
}

function isBareChapterMarker (text: string): boolean {
  return /^(?:chapter|chap\.?)$/i.test(cleanHeading(text));
}

function isBareNumber (text: string): boolean {
  return parsePositiveIntegerOrRoman(cleanHeading(text)) !== undefined;
}

function isPlausibleChapterTitle (text: string): boolean {
  const cleaned = cleanHeading(text);

  return Boolean(cleaned) && !FRONT_MATTER_HEADING.test(cleaned) && !cleaned.endsWith('?') && !isBareChapterMarker(cleaned) && !isBareNumber(cleaned) && chapterNumberFromHeading(cleaned) === undefined && sectionChapterNumber(cleaned) === undefined && localItemNumber(cleaned) === undefined;
}

function isStrongStandaloneChapterTitle (heading: ChapterPageEvidence['headings'][number]): boolean {
  return isPlausibleChapterTitle(heading.text) && (heading.type === 'title' || heading.signal === 'section-sign' || heading.signal === 'uppercase-caption' || isUppercaseCaption(heading.text));
}

function orderedHeadings (page: ChapterPageEvidence): ChapterPageEvidence['headings'] {
  return [...page.headings].sort((a, b) => {
    if (a.source !== b.source) {
      return a.source === 'mathpix' ? -1 : 1;
    }

    return (a.line ?? Number.MAX_SAFE_INTEGER) - (b.line ?? Number.MAX_SAFE_INTEGER);
  });
}

function titleOnPage (page: ChapterPageEvidence, beforeText?: string): string | undefined {
  const headings = orderedHeadings(page);
  const beforeIndex = beforeText === undefined ? headings.length : headings.findIndex(({ text }) => cleanHeading(text) === cleanHeading(beforeText));
  const candidates = headings.slice(0, beforeIndex < 0 ? headings.length : beforeIndex).filter(({ text }) => isPlausibleChapterTitle(text));

  return candidates.at(-1)?.text;
}

function titleNearSectionStart (pages: ChapterPageEvidence[], pageIndex: number, sectionText: string): { pageNumber: number; title?: string } {
  const samePageTitle = titleOnPage(pages[pageIndex], sectionText);

  if (samePageTitle) {
    return { pageNumber: pages[pageIndex].pageNumber, title: samePageTitle };
  }

  // Mathpix often labels the chapter title on the page immediately before
  // the first numbered subsection (for example title page -> "2.1 ...").
  for (let index = pageIndex - 1; index >= Math.max(0, pageIndex - 2); index--) {
    const page = pages[index];

    if (page.headings.some(({ text }) => sectionChapterNumber(text) !== undefined || chapterNumberFromHeading(text) !== undefined)) {
      break;
    }

    const title = titleOnPage(page);

    if (title) {
      return { pageNumber: page.pageNumber, title };
    }
  }

  return { pageNumber: pages[pageIndex].pageNumber };
}

function explicitChapterCandidate (page: ChapterPageEvidence): NumberedChapterCandidate | undefined {
  const headings = orderedHeadings(page);

  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index];
    const directNumber = chapterNumberFromHeading(heading.text);

    if (directNumber !== undefined) {
      const embeddedTitle = cleanHeading(heading.text).replace(/^(?:chapter|chap\.?)\s*(?:\d{1,3}|[IVXLCDM]+)\s*[:.\-–—]?\s*/i, '').trim();
      const followingTitle = headings.slice(index + 1).find(({ text }) => isPlausibleChapterTitle(text))?.text;
      const title = embeddedTitle || followingTitle;

      return {
        chapterNumber: directNumber,
        confidence: 0.995,
        scheme: 'chapter',
        startPage: page.pageNumber,
        title: title ? `Chapter ${directNumber}: ${title}` : `Chapter ${directNumber}`
      };
    }

    if (isBareChapterMarker(heading.text)) {
      const numberHeading = headings.slice(index + 1, index + 3).find(({ text }) => isBareNumber(text));
      const number = numberHeading ? parsePositiveIntegerOrRoman(numberHeading.text) : undefined;

      if (number !== undefined) {
        const numberIndex = headings.indexOf(numberHeading!);
        const followingTitle = headings.slice(numberIndex + 1).find(({ text }) => isPlausibleChapterTitle(text))?.text;

        return {
          chapterNumber: number,
          confidence: 0.995,
          scheme: 'chapter',
          startPage: page.pageNumber,
          title: followingTitle ? `Chapter ${number}: ${followingTitle}` : `Chapter ${number}`
        };
      }
    }
  }

  return undefined;
}

function standaloneNumberChapterCandidate (page: ChapterPageEvidence): NumberedChapterCandidate | undefined {
  const headings = orderedHeadings(page);

  for (let index = 0; index < headings.length; index++) {
    const numberHeading = headings[index];
    const chapterNumber = isBareNumber(numberHeading.text) ? parsePositiveIntegerOrRoman(numberHeading.text) : undefined;

    if (chapterNumber === undefined || (numberHeading.confidence !== undefined && numberHeading.confidence < 0.8)) {
      continue;
    }

    const titleCandidates = headings.slice(index + 1).filter((heading) =>
      isPlausibleChapterTitle(heading.text) && (heading.confidence === undefined || heading.confidence >= 0.5)
    );
    const title = titleCandidates.at(-1)?.text;

    if (title) {
      return {
        chapterNumber,
        confidence: 0.985,
        scheme: 'chapter',
        startPage: page.pageNumber,
        title: `${chapterNumber} ${title}`
      };
    }
  }

  return undefined;
}

function explicitParagraphCandidate (page: ChapterPageEvidence, allowInferred = false): NumberedChapterCandidate | undefined {
  for (const heading of orderedHeadings(page)) {
    const explicitNumber = paragraphNumberFromHeading(heading);
    const inferredNumber = allowInferred ? inferredParagraphNumberFromHeading(heading) : undefined;
    const chapterNumber = explicitNumber ?? inferredNumber;
    const title = paragraphTitleFromHeading(heading, allowInferred);

    if (chapterNumber !== undefined && title && isPlausibleChapterTitle(title)) {
      return {
        chapterNumber,
        confidence: explicitNumber !== undefined ? 0.995 : 0.985,
        scheme: 'paragraph',
        startPage: page.pageNumber,
        title
      };
    }
  }

  return undefined;
}

function normalizedHeadingIdentity (text: string): string {
  return cleanHeading(text)
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function strongStandaloneHeadings (page: ChapterPageEvidence, beforeText?: string): ChapterPageEvidence['headings'] {
  const headings = orderedHeadings(page);
  const beforeIndex = beforeText === undefined ? headings.length : headings.findIndex(({ text }) => cleanHeading(text) === cleanHeading(beforeText));

  return headings.slice(0, beforeIndex < 0 ? headings.length : beforeIndex).filter(isStrongStandaloneChapterTitle);
}

function headingPageFrequency (pages: ChapterPageEvidence[]): Map<string, number> {
  const pagesByHeading = new Map<string, Set<number>>();

  pages.forEach((page) => {
    page.headings.forEach(({ text }) => {
      const key = normalizedHeadingIdentity(text);

      if (!key) {
        return;
      }

      const pageNumbers = pagesByHeading.get(key) ?? new Set<number>();

      pageNumbers.add(page.pageNumber);
      pagesByHeading.set(key, pageNumbers);
    });
  });

  return new Map([...pagesByHeading].map(([key, pageNumbers]) => [key, pageNumbers.size]));
}

function unambiguousStandaloneTitle (page: ChapterPageEvidence, frequency: Map<string, number>, beforeText?: string): ChapterPageEvidence['headings'][number] | undefined {
  const candidates = strongStandaloneHeadings(page, beforeText);

  if (candidates.length !== 1) {
    return undefined;
  }

  const candidate = candidates[0];
  const repeatedAcrossPages = (frequency.get(normalizedHeadingIdentity(candidate.text)) ?? 0) > 1;

  // Explicit structural labels may legitimately repeat in running material; an
  // inferred all-caps caption may not. This prevents recurring headers from
  // becoming deterministic chapter anchors without relying on their wording.
  if (repeatedAcrossPages && candidate.type !== 'title' && candidate.signal !== 'section-sign') {
    return undefined;
  }

  return candidate;
}

function localItemNumbersOnPage (page: ChapterPageEvidence | undefined): number[] {
  return page === undefined
    ? []
    : orderedHeadings(page).flatMap(({ text }) => {
      const number = localItemNumber(text);

      return number === undefined ? [] : [number];
    });
}

function transitionChapterTitle (pages: ChapterPageEvidence[], pageIndex: number, frequency: Map<string, number>, allowInferredParagraphs: boolean): string | undefined {
  const page = pages[pageIndex];
  const titleHeading = unambiguousStandaloneTitle(page, frequency);

  if (!titleHeading || explicitChapterCandidate(page) || explicitParagraphCandidate(page, allowInferredParagraphs)) {
    return undefined;
  }

  const previousNumbers = localItemNumbersOnPage(pages[pageIndex - 1]);
  const nextPage = pages[pageIndex + 1];
  const nextNumbers = localItemNumbersOnPage(nextPage);
  const previousLooksLikeSectionTail = previousNumbers.some((number) => number >= 2);
  const nextLooksLikeSectionBody = nextNumbers.some((number) => number <= 3);
  const nextHasExplicitBoundary = nextPage !== undefined && Boolean(explicitChapterCandidate(nextPage) || explicitParagraphCandidate(nextPage, allowInferredParagraphs));

  // Infer a boundary from topology, not vocabulary: a unique major caption is
  // credible when it sits between the tail/body numbering of adjacent sections.
  // If the next page already has an explicit boundary, do not promote a broad
  // banner immediately before it unless the preceding page independently shows
  // that the old section was ending.
  if ((!previousLooksLikeSectionTail && !nextLooksLikeSectionBody) || (nextHasExplicitBoundary && !previousLooksLikeSectionTail)) {
    return undefined;
  }

  return titleHeading.text;
}

/**
 * Derives deterministic chapter candidates from numbering and nearby headings.
 * These candidates are intentionally conservative: they anchor explicit chapter
 * markers and first N.x sections, then fill a skipped chapter number only when
 * there is a strong standalone heading between two numbered anchors.
 */
export function deriveStructuralChapterCandidates (evidence: ChapterPageEvidence[]): ChapterBoundaryProposal[] {
  const pages = [...evidence].sort((a, b) => a.pageNumber - b.pageNumber);
  const numbered = new Map<number, NumberedChapterCandidate>();
  const transitions: ChapterBoundaryProposal[] = [];

  pages.forEach((page) => {
    const paragraph = explicitParagraphCandidate(page);
    const explicit = paragraph ?? explicitChapterCandidate(page) ?? standaloneNumberChapterCandidate(page);

    if (explicit) {
      const previous = numbered.get(explicit.chapterNumber);

      if (!previous || explicit.confidence > previous.confidence || explicit.scheme === 'paragraph') {
        numbered.set(explicit.chapterNumber, explicit);
      }
    }
  });

  // OCR-lost § markers are inferred only after at least one explicit § anchor
  // establishes that this book actually uses that numbering scheme.
  const hasParagraphScheme = [...numbered.values()].some(({ scheme }) => scheme === 'paragraph');

  if (hasParagraphScheme) {
    pages.forEach((page) => {
      const inferred = explicitParagraphCandidate(page, true);

      if (!inferred) {
        return;
      }

      const previous = numbered.get(inferred.chapterNumber);

      if (!previous || inferred.scheme === 'paragraph' && inferred.confidence > previous.confidence) {
        numbered.set(inferred.chapterNumber, inferred);
      }
    });
  }

  pages.forEach((page, pageIndex) => {
    for (const heading of orderedHeadings(page)) {
      const chapterNumber = sectionChapterNumber(heading.text);

      if (chapterNumber === undefined || numbered.has(chapterNumber)) {
        continue;
      }

      const start = titleNearSectionStart(pages, pageIndex, heading.text);

      numbered.set(chapterNumber, {
        chapterNumber,
        confidence: start.title ? 0.97 : 0.91,
        scheme: 'section',
        startPage: start.pageNumber,
        title: start.title ?? `Chapter ${chapterNumber}`
      });
      break;
    }
  });

  const frequency = headingPageFrequency(pages);
  const anchors = [...numbered.values()].sort((a, b) => a.chapterNumber - b.chapterNumber || a.startPage - b.startPage);

  for (let anchorIndex = 0; anchorIndex < anchors.length - 1; anchorIndex++) {
    const left = anchors[anchorIndex];
    const right = anchors[anchorIndex + 1];
    const missingCount = right.chapterNumber - left.chapterNumber - 1;
    const canFillRun = missingCount === 1 || (missingCount > 1 && left.scheme === 'paragraph' && right.scheme === 'paragraph');

    if (!canFillRun || right.startPage <= left.startPage + missingCount) {
      continue;
    }

    const candidates = pages.flatMap((page) => {
      if (page.pageNumber <= left.startPage || page.pageNumber >= right.startPage) {
        return [];
      }

      const structuralNumbers = page.headings.flatMap((heading) => {
        const section = sectionChapterNumber(heading.text);
        const chapter = chapterNumberFromHeading(heading.text);
        const paragraph = paragraphNumberFromHeading(heading);

        return [...(section === undefined ? [] : [section]), ...(chapter === undefined ? [] : [chapter]), ...(paragraph === undefined ? [] : [paragraph])];
      });

      if (structuralNumbers.some((number) => number <= left.chapterNumber || number >= right.chapterNumber)) {
        return [];
      }

      if (left.scheme === 'paragraph' && right.scheme === 'paragraph') {
        const titleHeading = unambiguousStandaloneTitle(page, frequency);

        return titleHeading ? [{ pageNumber: page.pageNumber, title: titleHeading.text }] : [];
      }

      const title = titleOnPage(page);

      return title ? [{ pageNumber: page.pageNumber, title }] : [];
    });

    // In §-style textbooks several paragraph numbers can be missed by OCR at
    // once. Fill the run only when the exact number of strong standalone
    // captions appears between two numbered § anchors.
    if (candidates.length === missingCount) {
      candidates.forEach((candidate, index) => {
        const missingNumber = left.chapterNumber + index + 1;

        if (!numbered.has(missingNumber)) {
          numbered.set(missingNumber, {
            chapterNumber: missingNumber,
            confidence: left.scheme === 'paragraph' && right.scheme === 'paragraph' ? 0.965 : 0.94,
            scheme: left.scheme === 'paragraph' && right.scheme === 'paragraph' ? 'paragraph' : 'section',
            startPage: candidate.pageNumber,
            title: candidate.title
          });
        }
      });
    }
  }

  pages.forEach((page, pageIndex) => {
    const title = hasParagraphScheme ? transitionChapterTitle(pages, pageIndex, frequency, true) : undefined;

    if (title) {
      transitions.push({ confidence: 0.965, startPage: page.pageNumber, title });
    }
  });

  const byPage = new Map<number, ChapterBoundaryProposal>();
  const structural = [
    ...[...numbered.values()].map(({ chapterNumber: _chapterNumber, scheme: _scheme, ...candidate }) => candidate),
    ...transitions
  ];

  structural.forEach((candidate) => {
    const previous = byPage.get(candidate.startPage);

    if (!previous || candidate.confidence > previous.confidence) {
      byPage.set(candidate.startPage, candidate);
    }
  });

  return [...byPage.values()].sort((a, b) => a.startPage - b.startPage);
}

/**
 * Keeps strong deterministic anchors even if an LLM reconciliation drops one.
 * At the same page the higher-confidence/better-titled proposal wins.
 */
function normalizedBoundaryTitle (title: string): string {
  return cleanHeading(title)
    .toLocaleLowerCase()
    .replace(/^(?:chapter|chap\.?)\s*(?:\d{1,3}|[ivxlcdm]+)\s*[:.\-–—]?\s*/i, '')
    .replace(/^\d{1,3}\s*[.):\-–—]?\s*/, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function isGenericBoundaryTitle (title: string): boolean {
  const cleaned = cleanHeading(title);

  return /^(?:chapter|chap\.?)\s*(?:\d{1,3}|[ivxlcdm]+)$/i.test(cleaned) || /^chapter\s+(?:one|two|three|four|five|six|seven|eight|nine|ten)$/i.test(cleaned);
}

function establishedChapterStarts (evidence: ChapterPageEvidence[]): Map<number, number> {
  const pages = [...evidence].sort((a, b) => a.pageNumber - b.pageNumber);
  const starts = new Map<number, number>();

  pages.forEach((page) => {
    const explicit = explicitChapterCandidate(page) ?? standaloneNumberChapterCandidate(page);

    if (explicit && !starts.has(explicit.chapterNumber)) {
      starts.set(explicit.chapterNumber, explicit.startPage);
    }
  });

  pages.forEach((page, pageIndex) => {
    for (const heading of orderedHeadings(page)) {
      const chapterNumber = sectionChapterNumber(heading.text);

      if (chapterNumber === undefined || starts.has(chapterNumber)) {
        continue;
      }

      starts.set(chapterNumber, titleNearSectionStart(pages, pageIndex, heading.text).pageNumber);
      break;
    }
  });

  return starts;
}

function isRedundantSubchapterBoundary (candidate: ChapterBoundaryProposal, evidence: ChapterPageEvidence[], starts: Map<number, number>): boolean {
  const page = evidence.find(({ pageNumber }) => pageNumber === candidate.startPage);

  if (!page || explicitChapterCandidate(page) || standaloneNumberChapterCandidate(page)) {
    return false;
  }

  return orderedHeadings(page).some(({ text }) => {
    const chapterNumber = sectionChapterNumber(text);
    const establishedStart = chapterNumber === undefined ? undefined : starts.get(chapterNumber);

    return establishedStart !== undefined && establishedStart < candidate.startPage;
  });
}

export function stabilizeChapterBoundaries (model: ChapterBoundaryProposal[], structural: ChapterBoundaryProposal[], totalPages: number, evidence: ChapterPageEvidence[] = []): ChapterBoundaryProposal[] {
  const starts = establishedChapterStarts(evidence);
  const combined = model.filter((candidate) => !isRedundantSubchapterBoundary(candidate, evidence, starts));

  structural.filter(({ confidence }) => confidence >= 0.94).forEach((candidate) => {
    const exactIndex = combined.findIndex(({ startPage }) => startPage === candidate.startPage);

    if (exactIndex !== -1) {
      if (candidate.confidence > combined[exactIndex].confidence || (isGenericBoundaryTitle(combined[exactIndex].title) && !isGenericBoundaryTitle(candidate.title))) {
        combined[exactIndex] = candidate;
      }
      return;
    }

    // An LLM can place the same boundary one page early/late. Only collapse
    // adjacent proposals when their normalized titles agree; two different
    // textbook § paragraphs can legitimately start on consecutive pages.
    const normalizedTitle = normalizedBoundaryTitle(candidate.title);
    const nearbySameTitle = combined.findIndex(({ startPage, title }) => Math.abs(startPage - candidate.startPage) === 1 && normalizedTitle && normalizedBoundaryTitle(title) === normalizedTitle);

    if (nearbySameTitle !== -1) {
      if (candidate.confidence >= combined[nearbySameTitle].confidence) {
        combined[nearbySameTitle] = candidate;
      }
      return;
    }

    combined.push(candidate);
  });

  return parseChapterBoundaries(JSON.stringify({ chapters: combined }), totalPages);
}

export function chapterEvidenceWindows (pages: BookPage[], windowSize = 36, overlap = 3): ChapterPageEvidence[][] {
  if (!Number.isSafeInteger(windowSize) || windowSize < 2 || !Number.isSafeInteger(overlap) || overlap < 0 || overlap >= windowSize) {
    throw new Error('Invalid chapter evidence window configuration.');
  }

  const evidence = [...pages].sort((a, b) => a.pageNumber - b.pageNumber).map(pageChapterEvidence);
  const windows: ChapterPageEvidence[][] = [];
  const step = windowSize - overlap;

  for (let start = 0; start < evidence.length; start += step) {
    windows.push(evidence.slice(start, start + windowSize));

    if (start + windowSize >= evidence.length) {
      break;
    }
  }

  return windows;
}

export function chapterWindowPrompt (evidence: ChapterPageEvidence[]): string {
  return `Identify only TOP-LEVEL chapter boundaries in this consecutive run of book pages. Use structural evidence rather than vocabulary-specific rules. Mathpix title is strong evidence for a major heading; section_header may be a chapter or a subsection and must not create a boundary unless numbering, placement, and neighboring pages support a top-level transition. MMD signal=section-sign comes from a "§" marker and is strong structural evidence. signal=uppercase-caption comes from a standalone all-uppercase caption and is strong chapter-name evidence when the surrounding structure supports it, but uppercase alone is not enough. In a §-numbered book, preserve the demonstrated § sequence. OCR can lose the § marker and leave the number glued to an uppercase caption; accept that only when an explicit § elsewhere establishes the same numbering scheme. Local headings of the form "1. ...", "2. ...", "3. ..." are usually items inside the current §. A standalone integer heading such as "1" followed by a substantial title is strong evidence for chapter 1. First sections such as "3.1 ..." anchor chapter 3 only if chapter 3 has not already been established; once chapter N is anchored, a later "N.1 ..." is a subchapter and must not create another top-level boundary. Infer the role of unnumbered uppercase captions from topology: a unique caption between the tail of one local-number sequence and the body of the next is stronger than a page containing several independent uppercase captions; repeated captions across pages are more likely running material. If a broad banner is immediately followed by a stronger explicit boundary, prefer the explicit boundary. Track major-number continuity and inspect intervening unique major captions when numbered anchors skip a value. Split headings such as "CHAPTER" + number + title on one page are one heading. Ignore table-of-contents listings, running headers, footers, side material, exercises, subsections, and repeated body headings. Do not decide from specific words or phrases; decide from hierarchy, numbering, repetition, and neighboring-page structure. A chapter continues until there is strong evidence for another top-level chapter. Return only boundaries that START inside the supplied page range. Keep titles in the book's original language. confidence must be 0..1. Return JSON only: {"chapters":[{"startPage":12,"title":"Chapter 2: Fractions","confidence":0.94}]}.

Pages:
${evidence.map(({ excerpt, headings, pageNumber }) => `--- page ${pageNumber} ---\nMathpix/MMD headings: ${headings.length ? headings.map(({ confidence, signal, source, text, type }) => `[${source}:${type}${signal === undefined ? '' : ` signal=${signal}`}${confidence === undefined ? '' : ` confidence=${confidence.toFixed(2)}`}] ${text}`).join(' | ') : '(none)'}\nOpening text: ${excerpt || '(no text)'}`).join('\n\n')}`;
}

export function chapterReconciliationPrompt (proposals: ChapterBoundaryProposal[], evidence: ChapterPageEvidence[], totalPages: number, structural: ChapterBoundaryProposal[] = []): string {
  const relevantPages = new Set<number>();

  [...proposals, ...structural].forEach(({ startPage }) => {
    for (let page = Math.max(1, startPage - 1); page <= Math.min(totalPages, startPage + 1); page++) {
      relevantPages.add(page);
    }
  });
  evidence.filter(({ headings }) => headings.some(({ type }) => type === 'title')).forEach(({ pageNumber }) => relevantPages.add(pageNumber));
  const context = evidence.filter(({ pageNumber }) => relevantPages.has(pageNumber));

  return `Reconcile candidate chapter boundaries for one ${totalPages}-page book into a single stable TOP-LEVEL segmentation. Use hierarchy and cross-page structure rather than phrase-specific allow/deny rules. Remove duplicate/overlapping candidates from window overlap. Mathpix title labels are strong evidence; section_header labels require chapter-level context. signal=section-sign is an explicit § cue. signal=uppercase-caption is only a caption cue: promote it when it is unique and structurally positioned like a boundary, not merely because it is uppercase. If the book demonstrates § numbering, preserve that sequence and permit OCR-lost glued number+caption forms only when they fit the established sequence. Internal "1. ...", "2. ...", "3. ..." items normally remain inside the current §. Use neighboring local-number sequences, repeated-heading frequency, unique-vs-multiple captions on a page, and explicit anchors on adjacent pages to distinguish real boundaries from side material. A page with several unrelated uppercase captions is weak top-level evidence; a unique caption followed by local numbered body items is stronger. A broad banner immediately before a stronger explicit boundary should not create an extra chapter. A standalone integer heading followed by a substantial title is strong chapter evidence. First sections such as 1.1, 2.1, 3.1 anchor their corresponding chapters only when that major chapter number has not already been established; if chapter N is already anchored earlier, N.1 is a subchapter and must not create another top-level boundary. Split chapter marker + number + title headings are one heading. Do not drop a structurally anchored chapter merely because one model window missed it. If chapter numbers jump, inspect intervening unique major captions for missing boundaries. Deterministic structural candidates below are conservative and should be preserved unless page evidence directly contradicts them. Preserve the best original-language title. The result must be sorted by startPage and each startPage must be unique and between 1 and ${totalPages}. It is valid for the first real chapter to start after page 1; do not invent an Introduction chapter. Return JSON only: {"chapters":[{"startPage":12,"title":"Chapter 2: Fractions","confidence":0.96}]}.

Candidate boundaries:
${JSON.stringify(proposals)}

Deterministic structural candidates:
${JSON.stringify(structural)}

Structural context near candidates:
${context.map(({ excerpt, headings, pageNumber }) => `--- page ${pageNumber} ---\nHeadings: ${headings.map(({ confidence, signal, source, text, type }) => `[${source}:${type}${signal === undefined ? '' : ` signal=${signal}`}${confidence === undefined ? '' : ` confidence=${confidence.toFixed(2)}`}] ${text}`).join(' | ') || '(none)'}\nOpening: ${excerpt || '(no text)'}`).join('\n\n')}`;
}

export function parseChapterBoundaries (content: string, totalPages: number): ChapterBoundaryProposal[] {
  const json = content.replace(/^```json\s*|\s*```$/g, '').trim();
  const parsed = JSON.parse(json) as { chapters?: unknown };

  if (!Array.isArray(parsed.chapters)) {
    throw new Error('OpenRouter returned invalid chapter data.');
  }

  const byPage = new Map<number, ChapterBoundaryProposal>();

  for (const value of parsed.chapters) {
    if (!value || typeof value !== 'object') {
      continue;
    }

    const candidate = value as Partial<ChapterBoundaryProposal>;
    const startPage = Number(candidate.startPage);
    const title = typeof candidate.title === 'string' ? candidate.title.replace(/\s+/g, ' ').trim() : '';
    const confidence = Number(candidate.confidence);

    if (!Number.isSafeInteger(startPage) || startPage < 1 || startPage > totalPages || !title) {
      continue;
    }

    const normalized = { confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5, startPage, title };
    const previous = byPage.get(startPage);

    if (!previous || normalized.confidence > previous.confidence) {
      byPage.set(startPage, normalized);
    }
  }

  return [...byPage.values()].sort((a, b) => a.startPage - b.startPage);
}

export function chapterAssignmentsFromBoundaries (boundaries: ChapterBoundaryProposal[], totalPages: number): ChapterBoundaryProposal[] {
  const sorted = boundaries.filter(({ startPage, title }) => startPage >= 1 && startPage <= totalPages && title.trim()).sort((a, b) => a.startPage - b.startPage);

  if (!sorted.length) {
    return [{ confidence: 0, startPage: 1, title: 'Book' }];
  }

  if (sorted[0].startPage > 1) {
    return [{ confidence: 1, startPage: 1, title: 'Front matter' }, ...sorted];
  }

  return sorted;
}
