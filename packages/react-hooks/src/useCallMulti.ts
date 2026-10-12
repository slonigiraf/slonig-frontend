// Copyright 2017-2023 @polkadot/react-hooks authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { ApiPromise } from '@polkadot/api';
import type { QueryableStorageMultiArg } from '@polkadot/api/types';
import type { Tracker } from './useCall.js';
import type { MountedRef } from './useIsMountedRef.js';

import { useEffect, useRef, useState } from 'react';

import { isUndefined, nextTick } from '@polkadot/util';

import { isRecoverableWsError } from './isRecoverableWsError.js';
import { useApi } from './useApi.js';
import { handleError, scheduleSubscriptionRetry, transformIdentity, unsubscribe } from './useCall.js';
import { useIsMountedRef } from './useIsMountedRef.js';

interface TrackerRef {
  current: Tracker;
}

interface CallOptions <T> {
  defaultValue?: T;
  transform?: (value: any, api: ApiPromise) => T;
}

// subscribe, trying to play nice with the browser threads
function subscribe <T> (api: ApiPromise, mountedRef: MountedRef, tracker: TrackerRef, calls: QueryableStorageMultiArg<'promise'>[], setValue: (value: T) => void, retry: () => void, { transform = transformIdentity }: CallOptions<T> = {}): void {
  unsubscribe(tracker);
  const generation = tracker.current.generation;

  nextTick((): void => {
    if (mountedRef.current && tracker.current.generation === generation) {
      const included = calls.map((c) => !!c && (!Array.isArray(c) || !!c[0]));
      const filtered = calls.filter((_, index) => included[index]);

      if (filtered.length) {
        // swap to active mode
        tracker.current.isActive = true;

        try {
          const subscriber = api.queryMulti(filtered, (value): void => {
            // .subscriber might not yet be set for an immediate callback.
            if (mountedRef.current && tracker.current.isActive && tracker.current.generation === generation) {
              let valueIndex = -1;

              try {
                setValue(
                  transform(
                    calls.map((_, index) =>
                      included[index]
                        ? value[++valueIndex]
                        : undefined
                    ),
                    api
                  )
                );
              } catch (error) {
                handleError(error as Error, tracker);
              }
            }
          }).catch((error: Error) => {
            if (tracker.current.generation !== generation) {
              return;
            }

            tracker.current.isActive = false;
            tracker.current.subscriber = null;
            handleError(error, tracker);

            if (isRecoverableWsError(error)) {
              scheduleSubscriptionRetry(tracker, mountedRef, generation, retry);
            }
          });

          tracker.current.subscriber = subscriber;
        } catch (error) {
          tracker.current.isActive = false;
          handleError(error as Error, tracker);

          if (isRecoverableWsError(error)) {
            scheduleSubscriptionRetry(tracker, mountedRef, generation, retry);
          }
        }
      } else {
        tracker.current.subscriber = null;
      }
    }
  });
}

// very much copied from useCall
// FIXME This is generic, we cannot really use createNamedHook
export function useCallMulti <T> (calls?: QueryableStorageMultiArg<'promise'>[] | null | false, options?: CallOptions<T>): T {
  const { api, isApiConnected } = useApi();
  const mountedRef = useIsMountedRef();
  const tracker = useRef<Tracker>({ api: null, error: null, fn: null, generation: 0, isActive: false, retryTimer: null, serialized: null, subscriber: null, type: 'useCallMulti' });
  const [value, setValue] = useState<T>(() => (isUndefined((options || {}).defaultValue) ? [] : (options || {}).defaultValue) as unknown as T);
  const [retryCount, setRetry] = useState(0);

  // initial effect, we need an un-subscription
  useEffect((): () => void => {
    return () => unsubscribe(tracker);
  }, []);

  // Preserve the last value during a disconnect; refresh it on reconnect.
  useEffect((): void => {
    if (!mountedRef.current || !calls || !isApiConnected) {
      unsubscribe(tracker);

      return;
    }

    const serialized = JSON.stringify(calls);

    if (api !== tracker.current.api || serialized !== tracker.current.serialized || !tracker.current.isActive) {
      tracker.current.api = api;
      tracker.current.serialized = serialized;

      subscribe(api, mountedRef, tracker, calls, setValue, () => setRetry((count) => count + 1), options);
    }
  }, [api, calls, isApiConnected, options, mountedRef, retryCount]);

  // throwOnError(tracker.current);

  return value;
}
