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