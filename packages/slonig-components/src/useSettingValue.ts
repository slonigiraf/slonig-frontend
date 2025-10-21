import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { getSetting } from '@slonigiraf/db';

export function useSettingValue(key: string): string | undefined {
    const [value, setValue] = useState<string | undefined>();

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