// Copyright 2017-2023 @polkadot/react-hooks authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import type { ApiPromise } from '@polkadot/api';
import type { QueryableStorageMultiArg } from '@polkadot/api/types';
import type { ApiProps } from '@polkadot/react-api/types';
import type { TrackFn } from './useCall.js';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { useState } from 'react';

import { ApiCtx } from './ctx/Api.js';
import { useCall } from './useCall.js';
import { useCallMulti } from './useCallMulti.js';

function context (api: ApiPromise, isApiConnected: boolean): ApiProps {
  return { api, isApiConnected } as ApiProps;
}

describe('WebSocket subscription recovery', (): void => {
  it('keeps local React state, ignores stale callbacks and re-subscribes useCall', async (): Promise<void> => {
    const callbacks: ((value: number) => void)[] = [];
    const unsub = jest.fn();
    const query = jest.fn((onValue: (value: number) => void) => {
      callbacks.push(onValue);

      return Promise.resolve(unsub);
    });
    const fn = query as unknown as TrackFn;
    const api = {} as ApiPromise;

    function Probe (): React.ReactElement {
      const value = useCall<number>(fn);
      const [local, setLocal] = useState(0);

      return <div>
        <span data-testid='value'>{String(value)}</span>
        <span data-testid='local'>{local}</span>
        <button onClick={() => setLocal((n) => n + 1)}>increment</button>
      </div>;
    }

    const { rerender } = render(<ApiCtx.Provider value={context(api, true)}><Probe /></ApiCtx.Provider>);

    await waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    act(() => callbacks[0](10));
    fireEvent.click(screen.getByText('increment'));
    expect(screen.getByTestId('value').textContent).toBe('10');
    expect(screen.getByTestId('local').textContent).toBe('1');

    rerender(<ApiCtx.Provider value={context(api, false)}><Probe /></ApiCtx.Provider>);
    await waitFor(() => expect(unsub).toHaveBeenCalledTimes(1));
    act(() => callbacks[0](99));
    expect(screen.getByTestId('value').textContent).toBe('10');
    expect(screen.getByTestId('local').textContent).toBe('1');

    rerender(<ApiCtx.Provider value={context(api, true)}><Probe /></ApiCtx.Provider>);
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
    act(() => callbacks[0](99)); // old subscription must stay invalid
    act(() => callbacks[1](20));
    expect(screen.getByTestId('value').textContent).toBe('20');
    expect(screen.getByTestId('local').textContent).toBe('1');
  });

  it('restarts queryMulti after reconnect and preserves its last value', async (): Promise<void> => {
    const callbacks: ((value: number[]) => void)[] = [];
    const unsubscribe = jest.fn();
    const queryMulti = jest.fn((_: unknown, onValue: (value: number[]) => void) => {
      callbacks.push(onValue);

      return Promise.resolve(unsubscribe);
    });
    const api = { queryMulti } as unknown as ApiPromise;
    const calls = ['account'] as unknown as QueryableStorageMultiArg<'promise'>[];

    function Probe (): React.ReactElement {
      const value = useCallMulti<number[]>(calls);

      return <span data-testid='multi'>{JSON.stringify(value)}</span>;
    }

    const { rerender } = render(<ApiCtx.Provider value={context(api, true)}><Probe /></ApiCtx.Provider>);

    await waitFor(() => expect(queryMulti).toHaveBeenCalledTimes(1));
    act(() => callbacks[0]([5]));
    expect(screen.getByTestId('multi').textContent).toBe('[5]');

    rerender(<ApiCtx.Provider value={context(api, false)}><Probe /></ApiCtx.Provider>);
    await waitFor(() => expect(unsubscribe).toHaveBeenCalledTimes(1));
    act(() => callbacks[0]([99]));
    expect(screen.getByTestId('multi').textContent).toBe('[5]');

    rerender(<ApiCtx.Provider value={context(api, true)}><Probe /></ApiCtx.Provider>);
    await waitFor(() => expect(queryMulti).toHaveBeenCalledTimes(2));
    act(() => callbacks[1]([8]));
    expect(screen.getByTestId('multi').textContent).toBe('[8]');
  });

  it('retries a subscription rejected after connection is already restored', async (): Promise<void> => {
    const disconnectError = new Error('disconnected from wss://example.org: 1006:: Abnormal Closure');
    const query = jest.fn()
      .mockRejectedValueOnce(disconnectError)
      .mockResolvedValue(jest.fn());
    const api = {} as ApiPromise;

    function Probe (): React.ReactElement {
      useCall(query as unknown as TrackFn);

      return <div>connected</div>;
    }

    render(<ApiCtx.Provider value={context(api, true)}><Probe /></ApiCtx.Provider>);
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2), { timeout: 4000 });
  });
});
