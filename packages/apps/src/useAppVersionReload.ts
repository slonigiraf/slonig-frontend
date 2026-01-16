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

/**
 * Polls /version.json and when it changes, exposes `updateAvailable`.
 * `reloadNow()` forces a full reload.
 */
export function useAppVersionReload(options?: {
  url?: string;
  intervalMs?: number;
  initialDelayMs?: number;
}): {
  updateAvailable: boolean;
  reloadNow: () => void;
  currentVersion: string | null;
  latestVersion: string | null;
} {
  const url = options?.url ?? '/version.json';
  const intervalMs = options?.intervalMs ?? 60_000; // 1 min
  const initialDelayMs = options?.initialDelayMs ?? 5_000;

  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);

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

      setLatestVersion(v);

      // First successful fetch establishes baseline
      if (currentVersion === null) {
        setCurrentVersion(v);
        return;
      }

      if (v !== currentVersion) {
        setUpdateAvailable(true);
      }
    };

    timer = setTimeout(() => {
      void check();
      interval = setInterval(() => void check(), intervalMs);
    }, initialDelayMs);

    return () => {
      stoppedRef.current = true;
      if (timer) clearTimeout(timer);
      if (interval) clearInterval(interval);
    };
    // Intentionally include currentVersion so we compare against latest baseline
  }, [url, intervalMs, initialDelayMs, currentVersion]);

  const reloadNow = () => {
    // Force reload (bypass some caches)
    window.location.reload();
  };

  return { updateAvailable, reloadNow, currentVersion, latestVersion };
}