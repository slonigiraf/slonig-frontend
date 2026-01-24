import { u8aToHex } from '@polkadot/util';
import { randomAsU8a } from '@polkadot/util-crypto';
import { LEARN_FIRST_TIME_SEC, LEARN_SECOND_TIME_SEC } from '@slonigiraf/utils';
import { ItemWithCID } from './types.js';

const estimateItemSec = (item: ItemWithCID): number =>
  item.shouldBeRepeated ? LEARN_SECOND_TIME_SEC : LEARN_FIRST_TIME_SEC;

export function takeWithinTime(items: ItemWithCID[], lessonSec: number): ItemWithCID[] {
  const picked: ItemWithCID[] = [];
  let used = 0;

  for (const item of items) {
    if (item.isBlockedForLearning) continue;

    const cost = estimateItemSec(item);

    if (used + cost > lessonSec) break;

    picked.push(item);
    used += cost;
  }

  return picked;
}

export function sleptBetween(timeA: number, timeB: number): boolean {
  const startMs = Math.min(timeA, timeB);
  const endMs = Math.max(timeA, timeB);
  const timeDiff = endMs - startMs;

  const FOUR_HOURS_MS = 4 * 60 * 60_000;
  const TWENTY_FOUR_HOURS = 24 * 60 * 60_000;
  if (timeDiff < FOUR_HOURS_MS) return false;
  if (timeDiff >= TWENTY_FOUR_HOURS) return true;

  const end = new Date(endMs);

  // 03:00 on the start's calendar day (local time)
  const endDay3amMs = new Date(
    end.getFullYear(),
    end.getMonth(),
    end.getDate(),
    3, 0, 0, 0
  ).getTime();

  if(startMs < endDay3amMs && endMs > endDay3amMs) return true;
  return false;
}

export function randomIdHex(): string {
  return u8aToHex(randomAsU8a(32));
}

function fixInvalidJSONBackslashes(jsonString: string): string {
  // This regex finds text inside double quotes, excluding the quotes themselves
  return jsonString.replace(
    /"((?:\\.|[^"\\])*)"/g,
    (match, inner) => {
      // Replace every single backslash with double backslashes
      const fixedInner = inner.replace(/\\/g, '\\\\');
      return `"${fixedInner}"`;
    }
  );
}


/**
 * Safely parses JSON with LaTeX-like backslashes.
 */
export function safeJSONParse<T = any>(input: string): T {
  const fixed = fixInvalidJSONBackslashes(input);
  return JSON.parse(fixed);
}