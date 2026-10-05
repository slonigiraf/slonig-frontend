// Copyright 2017-2023 @polkadot/react-hooks authors & contributors
// SPDX-License-Identifier: Apache-2.0

const RECOVERABLE_WS_CLOSE = /^disconnected from wss?:\/\/.*:\s*1006::/i;

function getErrorMessage (error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;

    return typeof message === 'string'
      ? message
      : '';
  }

  return '';
}

/**
 * Browser sleep/wake and temporary network loss commonly close WebSockets with
 * code 1006. WsProvider reconnects automatically, so this transport error is
 * recoverable and should not be promoted to a fatal application error.
 */
export function isRecoverableWsError (error: unknown): boolean {
  return RECOVERABLE_WS_CLOSE.test(getErrorMessage(error));
}
