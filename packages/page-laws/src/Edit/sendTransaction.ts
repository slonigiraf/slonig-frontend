// Copyright 2021-2022 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0
import BN from 'bn.js';
import type { KeyringPair } from '@polkadot/keyring/types';
import type { ApiPromise } from '@polkadot/api';

type ErrorKey = 'UsedId' | 'BalanceIsNotEnough' | 'MissingId' |
    'NewPriceIsLow' | 'PriceOverflow' |
    'OutdatedText';

const errorMessages: Record<ErrorKey, string> = {
    UsedId: 'A knowledge item with the same ID already exists',
    BalanceIsNotEnough: 'Your balance is insufficient',
    MissingId: 'There is no knowledge item with such an ID',
    NewPriceIsLow: 'You should specify a higher price',
    PriceOverflow: 'Price overflow error',
    OutdatedText: 'Someone updated the text before you. Please refresh the page',
};

const _onSuccess = (t: (key: string, options?: { replace: Record<string, unknown>; } | undefined) => string,
    showInfo: (message: string, type?: "error" | "info" | undefined, timeoutSec?: number | undefined) => void) => {
    showInfo(t('Saved'));
}

const _onFailed = (error: string, t: (key: string, options?: { replace: Record<string, unknown>; } | undefined) => string,
    showInfo: (message: string, type?: "error" | "info" | undefined, timeoutSec?: number | undefined) => void) => {
    const errorMessage = errorMessages[error as ErrorKey] || `${error}`;
    showInfo(t(`Didn't save: ${errorMessage}`), 'error', 3);
};

async function handleTransaction(
    transaction: any,
    pair: KeyringPair,
    api: ApiPromise,
    showInfo: (message: string, type?: "error" | "info", timeoutSec?: number) => void,
    t: (key: string, options?: { replace: Record<string, unknown>; }) => string,
    onSuccess: () => void,
    onFailed: () => void
) {
    showInfo(t('Processing'), 'info', 12);
    try {
        await transaction.signAndSend(pair, ({ status, events }) => {
            if (status.isInBlock) {
                let errorInfo = events
                    .filter(({ event }) => api.events.system.ExtrinsicFailed.is(event))
                    .map(({ event }) => {
                        const [error] = event.data;
                        return error.isModule
                            ? api.registry.findMetaError(error.asModule).method
                            : error.toString();
                    })
                    .join(', ');
                errorInfo ? _onFailed(errorInfo, t, showInfo) : _onSuccess(t, showInfo);
                errorInfo ? onFailed() : onSuccess();
            }
        });
    } catch (error) {
        _onFailed(t(error.toString()), t, showInfo);
    }
}

export const sendCreateTransaction = async (idHex: string, digestHex: string, amount: BN,
    currentPair: KeyringPair, api: ApiPromise,
    t: (key: string, options?: { replace: Record<string, unknown>; } | undefined) => string,
    showInfo: (message: string, type?: "error" | "info" | undefined, timeoutSec?: number | undefined) => void,
    onSuccess: () => void, onFailed: () => void) => {
    const transaction = api.tx.laws.create(idHex, digestHex, amount);
    await handleTransaction(transaction, currentPair, api, showInfo, t, onSuccess, onFailed);
};

export const sendEditTransaction = async (textHexId: string, lawHexData: string, digestHex: string, amountList: BN,
    currentPair: KeyringPair, api: ApiPromise,
    t: (key: string, options?: { replace: Record<string, unknown>; } | undefined) => string,
    showInfo: (message: string, type?: "error" | "info" | undefined, timeoutSec?: number | undefined) => void,
    onSuccess: () => void, onFailed: () => void) => {
    const transaction = api.tx.laws.edit(textHexId, lawHexData, digestHex, amountList);
    await handleTransaction(transaction, currentPair, api, showInfo, t, onSuccess, onFailed);
};

export const sendCreateAndEditTransaction = async (
    itemIdHex: string, itemDigestHex: string, amountItem: BN,
    textHexId: string, lawHexData: string, digestHex: string, amountList: BN,
    currentPair: KeyringPair, api: ApiPromise,
    t: (key: string, options?: { replace: Record<string, unknown>; } | undefined) => string,
    showInfo: (message: string, type?: "error" | "info" | undefined, timeoutSec?: number | undefined) => void,
    onSuccess: () => void, onFailed: () => void) => {

    const transaction = api.tx.laws.createAndEdit(
        itemIdHex, itemDigestHex, amountItem,
        textHexId, lawHexData, digestHex, amountList
    );
    await handleTransaction(transaction, currentPair, api, showInfo, t, onSuccess, onFailed);
};