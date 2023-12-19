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

export const sendEditTransaction = async (textHexId: string, lawHexData: string, digestHex: string, amountList: BN,
    currentPair: KeyringPair, api: ApiPromise,
    t: (key: string, options?: { replace: Record<string, unknown>; } | undefined) => string,
    showInfo: (message: string, type?: "error" | "info" | undefined, timeoutSec?: number | undefined) => void,
    onSuccess: () => void, onFailed: () => void) => {

    showInfo(t('Processing'), 'info', 12);
    // Create the transaction
    const transaction = api.tx.laws.edit(textHexId, lawHexData, digestHex, amountList);

    // Sign and send the transaction
    // Sign and send the transaction
    try {
        await transaction.signAndSend(currentPair, ({ status, events }) => {
            // Handle transaction status and events
            if (status.isInBlock) {
                let isError = false;
                let errorInfo = '';
                events.forEach(({ event }) => {
                    if (api.events.system.ExtrinsicFailed.is(event)) {
                        isError = true;
                        const [error] = event.data;
                        if (error.isModule) {
                            // for module errors, we have the section indexed, lookup
                            const decoded = api.registry.findMetaError(error.asModule);
                            const { docs, method, section } = decoded;
                            errorInfo = `${method}`;
                        } else {
                            // Other, CannotLookup, BadOrigin, no extra info
                            errorInfo = error.toString();
                        }
                    }
                });
                if (isError) {
                    _onFailed(errorInfo, t, showInfo); // Call on failure
                    onFailed();
                } else {
                    _onSuccess(t, showInfo); // Call on success
                    onSuccess();
                }
            }
        });
    } catch (error) {
        _onFailed(t('Error signing and sending transaction'), t, showInfo);
    }
};

export const sendCreateAndEditTransaction = async (
    itemIdHex: string, itemDigestHex: string, amountItem: BN,
    textHexId: string, lawHexData: string, digestHex: string, amountList: BN,
    currentPair: KeyringPair, api: ApiPromise,
    t: (key: string, options?: { replace: Record<string, unknown>; } | undefined) => string,
    showInfo: (message: string, type?: "error" | "info" | undefined, timeoutSec?: number | undefined) => void,
    onSuccess: () => void, onFailed: () => void) => {

    showInfo(t('Processing'), 'info', 12);
    // Create the transaction
    const transaction = api.tx.laws.createAndEdit(itemIdHex, itemDigestHex, amountItem,
        textHexId, lawHexData, digestHex, amountList);

    // Sign and send the transaction
    // Sign and send the transaction
    try {
        await transaction.signAndSend(currentPair, ({ status, events }) => {
            // Handle transaction status and events
            if (status.isInBlock) {
                let isError = false;
                let errorInfo = '';
                events.forEach(({ event }) => {
                    if (api.events.system.ExtrinsicFailed.is(event)) {
                        isError = true;
                        const [error] = event.data;
                        if (error.isModule) {
                            // for module errors, we have the section indexed, lookup
                            const decoded = api.registry.findMetaError(error.asModule);
                            const { docs, method, section } = decoded;
                            errorInfo = `${method}`;
                        } else {
                            // Other, CannotLookup, BadOrigin, no extra info
                            errorInfo = error.toString();
                        }
                    }
                });
                if (isError) {
                    _onFailed(errorInfo, t, showInfo); // Call on failure
                    onFailed();
                } else {
                    _onSuccess(t, showInfo); // Call on success
                    onSuccess();
                }
            }
        });
    } catch (error) {
        _onFailed(t('Error signing and sending transaction'), t, showInfo);
    }
};