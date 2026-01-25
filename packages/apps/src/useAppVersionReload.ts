import { SettingKey, storeSetting } from '@slonigiraf/db';
import { useSettingValue } from '@slonigiraf/slonig-components';
import { useEffect, useRef, useState } from 'react';

type VersionResponse = {
  version?: string;
};

async function fetchVersion(url = '/version.json'): Promise<string | null> {
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' }
    });

    if (!res.ok) {
      return null;
    }

    const data: VersionResponse = await res.json();
    return typeof data.version === 'string' && data.version.length
      ? data.version
      : null;
  } catch {
    return null;
  }
}

function isHardReload(): boolean {
  const nav = performance.getEntriesByType?.('navigation')?.[0] as PerformanceNavigationTiming | undefined;
  if (nav) return nav.type === 'reload';

  // legacy fallback (deprecated but still exists in some browsers)
  return performance?.navigation?.type === 1;
}

/**
 * Polls /version.json and when it changes, exposes `updateAvailable`.
 * `reloadNow()` forces a full reload.
 */
export function useAppVersionReload(options?: {
  url?: string;
  intervalMs?: number;
}): {
  updateAvailable: boolean;
  reloadNow: () => void;
  currentVersion: string | null | undefined;
  latestVersion: string | null;
} {
  const url = options?.url ?? '/version.json';
  const intervalMs = options?.intervalMs ?? 60_000;

  const [updateAvailable, setUpdateAvailable] = useState(false);
  const currentVersion = useSettingValue(SettingKey.APP_VERSION);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const wasVersionSavedRef = useRef(false);

  const stoppedRef = useRef(false);

  useEffect(() => {
    stoppedRef.current = false;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;

    const check = async () => {
      const v = await fetchVersion(url);
      if (stoppedRef.current || !v) {
        return;
      }

      if (!wasVersionSavedRef.current && isHardReload()) {
        wasVersionSavedRef.current = true;
        await storeSetting(SettingKey.APP_VERSION, v);
        setUpdateAvailable(false);
      }

      setLatestVersion(v);

      if (currentVersion !== null && v !== currentVersion) {
        wasVersionSavedRef.current = false;
        setUpdateAvailable(true);
      }
    };

    void check();
    interval = setInterval(() => void check(), intervalMs);

    return () => {
      stoppedRef.current = true;
      if (timer) clearTimeout(timer);
      if (interval) clearInterval(interval);
    };
    // Intentionally include currentVersion so we compare against latest baseline
  }, [url, intervalMs, currentVersion]);

  const reloadNow = () => {
    // Force reload (bypass some caches)
    window.location.reload();
  };

  return { updateAvailable, reloadNow, currentVersion, latestVersion };
}