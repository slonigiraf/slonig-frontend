import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { getSetting, SettingKey } from '@slonigiraf/db';

type SettingType = typeof SettingKey;
type SettingId = SettingType[keyof SettingType];

/**
 * React hook that provides a live value of a specific setting stored in Dexie.
 * 
 * @param key - A key from `SettingKey` (e.g. `SettingKey.LESSON`).
 * @returns
 * - `null` — the setting value has **not yet been loaded** from the database (initial state).
 * - `string` — the current value of the setting, once loaded from the database.
 * - `undefined` — the setting has no stored value.
 * This hook subscribes to Dexie’s `liveQuery`, automatically updating
 * the returned value whenever the underlying setting changes in IndexedDB.
 *
 * Example:
 * ```ts
 * const lessonId = useSettingValue(SettingKey.LESSON);
 * if (lessonId === null) return <Spinner />; // still loading
 * if (lessonId === undefined) return <EmptyState />; // no value stored
 * return <LessonView id={lessonId} />;
 * ```
 */
export function useSettingValue(key: SettingId): string | null | undefined {
  const [value, setValue] = useState<string | null | undefined>(null);

  useEffect(() => {
    const subscription = liveQuery(async () => {
      return await getSetting(key);
    }).subscribe({
      next: (val) => setValue(val),
      error: (err) => console.error('Dexie liveQuery error:', err),
    });

    return () => subscription.unsubscribe();
  }, [key]);

  return value;
}

/**
 * Wrapper around useSettingValue that interprets the setting as a boolean.
 * 
 * @returns
 * - `null` — setting is **not yet loaded** from the database
 * - `undefined` — setting has **no stored value**
 * - `boolean` — interpreted value once loaded (`true` if "true", else `false`)
 */
export function useBooleanSettingValue(key: SettingId): boolean | null | undefined {
  const value = useSettingValue(key);
  if (value === null) return null; // not yet loaded
  return value === 'true';
}

export function stringToNumber(value: null | undefined | string) {
  if (value === null) return null; // not yet loaded
  if (value === undefined) return undefined; // no stored value

  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;

  const num = Number(trimmed);
  return Number.isFinite(num) ? num : undefined;
}

/**
 * Wrapper around useSettingValue that interprets the setting as a number.
 *
 * @param key - A key from `SettingKey`.
 * @returns
 * - `null` — setting is **not yet loaded** from the database
 * - `undefined` — setting has **no stored value** (or is not a valid number)
 * - `number` — parsed numeric value once loaded
 *
 * Note:
 * - If you store empty string or non-numeric text, this returns `undefined`.
 */
export function useNumberSettingValue(key: SettingId): number | null | undefined {
  const value = useSettingValue(key);
  return stringToNumber(value);
}