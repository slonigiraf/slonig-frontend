// Copyright 2017-2023 @polkadot/react-hooks authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { ApiPromise } from '@polkadot/api';
import type { PromiseResult, QueryableStorageEntry } from '@polkadot/api/types';
import type { StorageEntryTypeLatest } from '@polkadot/types/interfaces';
import type { AnyFunction, Codec } from '@polkadot/types/types';
import type { CallOptions, CallParam, CallParams } from './types.js';
import type { MountedRef } from './useIsMountedRef.js';

import { useEffect, useRef, useState } from 'react';

import { isFunction, isNull, isUndefined, nextTick } from '@polkadot/util';

import { isRecoverableWsError } from './isRecoverableWsError.js';
import { useApi } from './useApi.js';
import { useIsMountedRef } from './useIsMountedRef.js';

type VoidFn = () => void;

// This should be VoidFn, however the API actually does allow us to use any general single-shot queries with
// a result callback, so `api.query.system.account.at(<blockHash>, <account>, (info) => {... })` does work
// (The same applies to e.g. keys or entries). So where we actually use the unsub, we cast `unknown` to `VoidFn`
// to cater for our usecase.
type TrackFnResult = Promise<unknown>;

interface QueryTrackFn {
  (...params: CallParam[]): TrackFnResult;
  meta?: {
    type?: StorageEntryTypeLatest;
  };
}

interface QueryMapFn extends QueryTrackFn {
  meta: {
    type: StorageEntryTypeLatest;
  };
}

type QueryFn =
  QueryableStorageEntry<'promise', []> |
  QueryableStorageEntry<'promise', []>['entries'] |
  QueryableStorageEntry<'promise', []>['keys'] |
  QueryableStorageEntry<'promise', []>['multi'];

type CallFn = (...params: unknown[]) => Promise<VoidFn>;

export type TrackFn = PromiseResult<AnyFunction> | QueryFn;

export interface Tracker {
  api: ApiPromise | null;
  error: Error | null;
  generation: number;
  fn: TrackFn | undefined | null | false;
  isActive: boolean;
  retryTimer: ReturnType<typeof setTimeout> | null;
  serialized: string | null;
  subscriber: TrackFnResult | null;
  type: 'useCall' | 'useCallMulti';
}

interface TrackerRef {
  current: Tracker;
}

// the default transform, just returns what we have
export function transformIdentity <T> (value: unknown): T {
  return value as T;
}

function isMapFn (fn: unknown): fn is QueryMapFn {
  return !!(fn as QueryTrackFn).meta?.type?.isMap;
}

function isQuery (fn: unknown): fn is QueryableStorageEntry<'promise', []> {
  return !!fn && !isUndefined((fn as QueryableStorageEntry<'promise', []>).creator);
}

// extract the serialized and mapped params, all ready for use in our call
function extractParams <T> (fn: unknown, params: unknown[], { paramMap = transformIdentity }: CallOptions<T> = {}): [string, CallParams | null] {
  return [
    JSON.stringify({ f: (fn as { name: string })?.name, p: params }),
    params.length === 0 || !params.some((param) => isNull(param) || isUndefined(param))
      ? paramMap(params)
      : null
  ];
}

export function handleError (error: Error, tracker: TrackerRef, fn?: unknown): void {
  if (isRecoverableWsError(error)) {
    tracker.current.error = null;

    return;
  }

  console.error(
    tracker.current.error = new Error(`${tracker.current.type}(${
      isQuery(fn)
        ? `${fn.creator.section}.${fn.creator.method}`
        : '...'
    }):: ${error.message}:: ${error.stack || '<unknown>'}`)
  );
}

// Invalidate outstanding subscription creation, callbacks and scheduled retries.
// A pending unsubscribe may only resolve after the provider reconnects.
export function unsubscribe (tracker: TrackerRef): void {
  tracker.current.generation++;
  tracker.current.isActive = false;

  if (tracker.current.retryTimer) {
    clearTimeout(tracker.current.retryTimer);
    tracker.current.retryTimer = null;
  }

  const subscriber = tracker.current.subscriber;

  tracker.current.subscriber = null;

  if (subscriber) {
    subscriber
      .then((u) => isFunction(u) && (u as VoidFn)())
      .catch((e) => handleError(e as Error, tracker));
  }
}

// A subscribe promise can reject *after* the connected event has fired.
// Retry recoverable creation failures even if there is no further connection
// transition; unsubscribe() cancels the timer on disconnect or unmount.
export function scheduleSubscriptionRetry (tracker: TrackerRef, mountedRef: MountedRef, generation: number, retry: () => void): void {
  if (tracker.current.generation === generation && mountedRef.current && !tracker.current.retryTimer) {
    tracker.current.retryTimer = setTimeout((): void => {
      tracker.current.retryTimer = null;

      if (mountedRef.current && tracker.current.generation === generation) {
        retry();
      }
    }, 1500);
  }
}

// subscribe, trying to play nice with the browser threads
function subscribe <T> (api: ApiPromise, mountedRef: MountedRef, tracker: TrackerRef, fn: TrackFn | undefined, params: CallParams, setValue: (value: any) => void, retry: () => void, { transform = transformIdentity, withParams, withParamsTransform }: CallOptions<T> = {}): void {
  const validParams = params.filter((p) => !isUndefined(p));

  unsubscribe(tracker);
  const generation = tracker.current.generation;

  nextTick((): void => {
    if (!mountedRef.current || tracker.current.generation !== generation) {
      return;
    }

    const canQuery = !!fn && (
      isMapFn(fn)
        ? fn.meta.type.asMap.hashers.length === validParams.length
        : true
    );

    if (!canQuery) {
      return;
    }

    // A callback from an old subscription must never update the new one.
    tracker.current.isActive = true;

    try {
      const subscriber = (fn as CallFn)(...params, (value: Codec): void => {
        if (mountedRef.current && tracker.current.isActive && tracker.current.generation === generation) {
          try {
            setValue(
              withParams
                ? [params, transform(value, api)]
                : withParamsTransform
                  ? transform([params, value], api)
                  : transform(value, api)
            );
          } catch (error) {
            handleError(error as Error, tracker, fn);
          }
        }
      }).catch((error: Error) => {
        if (tracker.current.generation !== generation) {
          return;
        }

        tracker.current.isActive = false;
        tracker.current.subscriber = null;
        handleError(error, tracker, fn);

        if (isRecoverableWsError(error)) {
          scheduleSubscriptionRetry(tracker, mountedRef, generation, retry);
        }
      });

      tracker.current.subscriber = subscriber;
    } catch (error) {
      tracker.current.isActive = false;
      handleError(error as Error, tracker, fn);

      if (isRecoverableWsError(error)) {
        scheduleSubscriptionRetry(tracker, mountedRef, generation, retry);
      }
    }
  });
}

export function throwOnError (tracker: Tracker): void {
  if (tracker.error) {
    const error = tracker.error;

    tracker.error = null;

    throw error;
  }
}

// tracks a stream, typically an api.* call (derive, rpc, query) that
//  - returns a promise with an unsubscribe function
//  - has a callback to set the value
// FIXME The typings here need some serious TLC
// FIXME This is generic, we cannot really use createNamedHook
export function useCall <T> (fn: TrackFn | undefined | null | false, params?: CallParams | null, options?: CallOptions<T>): T | undefined {
  const { api, isApiConnected } = useApi();
  const mountedRef = useIsMountedRef();
  const tracker = useRef<Tracker>({ api: null, error: null, fn: null, generation: 0, isActive: false, retryTimer: null, serialized: null, subscriber: null, type: 'useCall' });
  const [value, setValue] = useState<T | undefined>((options || {}).defaultValue);
  const [retryCount, setRetry] = useState(0);

  // initial effect, we need an un-subscription
  useEffect((): () => void => {
    return () => unsubscribe(tracker);
  }, []);

  // Stop subscriptions on disconnect without unmounting the component.
  // On reconnect, start a fresh subscription to obtain an up-to-date snapshot.
  useEffect((): void => {
    if (!mountedRef.current || !fn || !isApiConnected) {
      unsubscribe(tracker);

      return;
    }

    const [serialized, mappedParams] = extractParams(fn, params || [], options);

    if (!mappedParams) {
      unsubscribe(tracker);

      return;
    }

    if (api !== tracker.current.api || fn !== tracker.current.fn || serialized !== tracker.current.serialized || !tracker.current.isActive) {
      tracker.current.api = api;
      tracker.current.fn = fn;
      tracker.current.serialized = serialized;

      subscribe(api, mountedRef, tracker, fn, mappedParams, setValue, () => setRetry((count) => count + 1), options);
    }
  }, [api, fn, isApiConnected, options, mountedRef, params, retryCount]);

  // throwOnError(tracker.current);

  return value;
}
