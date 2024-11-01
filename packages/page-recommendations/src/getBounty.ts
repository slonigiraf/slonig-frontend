// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0
import { u8aToHex } from '@polkadot/util';
import BN from 'bn.js';
import type { KeyringPair } from '@polkadot/keyring/types';
import type { ApiPromise } from '@polkadot/api';
import { Insurance, updateInsurance } from '@slonigiraf/db';

type ErrorKey = 'InvalidRefereeSign' | 'InvalidWorkerSign' | 'InvalidLetterAmount' |
    'RefereeBalanceIsNotEnough' | 'LetterWasMarkedAsFraudBefore' |
    'Expired' | 'NotAllowedBlock' | 'WrongParaId';

const errorMessages: Record<ErrorKey, string> = {
    InvalidRefereeSign: 'Invalid signature of previous tutor',
    InvalidWorkerSign: 'Invalid signature of student',
    InvalidLetterAmount: 'Invalid stake amount',
    RefereeBalanceIsNotEnough: 'Previous tutor balance is insufficient',
    LetterWasMarkedAsFraudBefore: 'Diploma was marked as fraud previously',
    Expired: 'Diploma has expired',
    NotAllowedBlock: 'Reexamining time has ended',
    WrongParaId: 'Incorrect parachain used',
};

const _onBountySuccess = async (insurance: Insurance, t: (key: string, options?: { replace: Record<string, unknown>; } | undefined) => string, onResult: () => void,
    showInfo: (message: string, type?: "error" | "info" | undefined, timeoutSec?: number | undefined) => void) => {
    const updatedInsurance: Insurance = {...insurance, wasUsed: true, valid: false};
    await updateInsurance(updatedInsurance);
    showInfo(t('Got bounty'));
    onResult();
}

const _onBountyFailed = async (insurance: Insurance, error: string, t: (key: string, options?: { replace: Record<string, unknown>; } | undefined) => string, onResult: () => void,
    showInfo: (message: string, type?: "error" | "info" | undefined, timeoutSec?: number | undefined) => void) => {
    const errorMessage = errorMessages[error as ErrorKey] || `${error}`;
    const updatedInsurance: Insurance = {...insurance, valid: false};
    await updateInsurance(updatedInsurance);
    showInfo(t(`Didn't get bounty: ${errorMessage}`), 'error', 3);
    onResult();
};

export const getBounty = async (insurance: Insurance, currentPair: KeyringPair, api: ApiPromise,
    t: (key: string, options?: { replace: Record<string, unknown>; } | undefined) => string, onResult: () => void,
    showInfo: (message: string, type?: "error" | "info" | undefined, timeoutSec?: number | undefined) => void) => {
    // Ensure insurance and currentPair are available
    if (!insurance || !currentPair) {
        console.error('Required parameters are missing');
        return;
    }

    showInfo(t('Processing'), 'info', 12);
    // Create the transaction
    const transfer = api.tx.letters.reimburse(
        insurance.letterNumber,
        new BN(insurance.block),
        new BN(insurance.blockAllowed),
        insurance.referee,
        insurance.worker,
        u8aToHex(currentPair.publicKey),
        new BN(insurance.amount),
        insurance.signOverReceipt,
        insurance.workerSign
    );

    // Sign and send the transaction
    // Sign and send the transaction
    try {
        await transfer.signAndSend(currentPair, ({ status, events }) => {
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
                    _onBountyFailed(insurance, errorInfo, t, onResult, showInfo); // Call on failure
                } else {
                    _onBountySuccess(insurance, t, onResult, showInfo); // Call on success
                }
            }
        });
    } catch (error) {
        _onBountyFailed(insurance, t(error.toString()), t, onResult, showInfo);
    }

};

// END: Functions to get bounty