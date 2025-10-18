// Copyright 2017-2023 @polkadot/react-components authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { DeriveBalancesAll } from '@polkadot/api-derive/types';
import type { AccountInfoWithProviders, AccountInfoWithRefCount } from '@polkadot/types/interfaces';
import { BN } from '@polkadot/util';

import React, { useCallback, useEffect, useState } from 'react';

import { checkAddress } from '@polkadot/phishing';
import { useApi, useCall, useToggle } from '@polkadot/react-hooks';
import { Available } from '@polkadot/react-query';
import { BN_HUNDRED, BN_ZERO, nextTick } from '@polkadot/util';

import InputAddress from '../InputAddress/index.js';
import InputBalance from '../InputBalance.js';
import MarkError from '../MarkError.js';
import Modal from '../Modal/index.js';
import { styled } from '../styled.js';
import { useTranslation } from '../translate.js';
import { Button, Spinner } from '@polkadot/react-components';
import { balanceToSlonString, useInfo, useLoginContext } from '@slonigiraf/app-slonig-components';
import { useNavigate } from 'react-router-dom';

interface Props {
  className?: string;
  onClose: () => void;
  onConfirmedClose: () => void;
  onSuccess: () => void;
  recipientId?: string;
  senderId?: string;
  amount?: BN;
  isAmountEditable: boolean;
  isRewardType?: boolean;
}

function isRefcount(accountInfo: AccountInfoWithProviders | AccountInfoWithRefCount): accountInfo is AccountInfoWithRefCount {
  return !!(accountInfo as AccountInfoWithRefCount).refcount;
}

async function checkPhishing(_senderId: string | null, recipientId: string | null): Promise<[string | null, string | null]> {
  return [
    // not being checked atm
    // senderId
    //   ? await checkAddress(senderId)
    //   : null,
    null,
    recipientId
      ? await checkAddress(recipientId)
      : null
  ];
}

function Transfer({ className = '', onClose, onConfirmedClose, onSuccess, recipientId: propRecipientId, senderId: propSenderId, amount: propAmount, isAmountEditable = true, isRewardType=false }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { api } = useApi();
  const [amount, setAmount] = useState<BN | undefined>(propAmount ? propAmount : BN_ZERO);
  const [hasAvailable] = useState(true);
  const [isProtected, setIsProtected] = useState(true);
  const [isAll, setIsAll] = useState(false);
  const [[maxTransfer, noFees], setMaxTransfer] = useState<[BN | null, boolean]>([null, false]);
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [senderId, setSenderId] = useState<string | null>(null);
  const [[, recipientPhish], setPhishing] = useState<[string | null, string | null]>([null, null]);
  const balances = useCall<DeriveBalancesAll>(api.derive.balances?.all, [propSenderId || senderId]);
  const accountInfo = useCall<AccountInfoWithProviders | AccountInfoWithRefCount>(api.query.system.account, [propSenderId || senderId]);
  const { showInfo } = useInfo();
  const { currentPair, _onChangeAccount } = useLoginContext();
  const [isProcessing, toggleProcessing] = useToggle();
  const [amountIsLessThanMax, setAmountIsLessThanMax] = useState(false);
  const navigate = useNavigate();

  const changeSender = useCallback((id: string | null) => {
    setSenderId(id);
    _onChangeAccount(id);
  }, [currentPair]);

  useEffect((): void => {
    const fromId = propSenderId || senderId as string;
    const toId = propRecipientId || recipientId as string;

    if (balances && balances.accountId?.eq(fromId) && fromId && toId && api.call.transactionPaymentApi && api.tx.balances) {
      nextTick(async (): Promise<void> => {
        try {
          const extrinsic = api.tx.balances.transfer(toId, balances.availableBalance);
          const { partialFee } = await extrinsic.paymentInfo(fromId);
          const adjFee = partialFee.muln(110).div(BN_HUNDRED);
          const maxTransfer = balances.availableBalance.sub(adjFee);

          setMaxTransfer(
            api.consts.balances && maxTransfer.gt(api.consts.balances.existentialDeposit)
              ? [maxTransfer, false]
              : [null, true]
          );
          setSenderId(fromId);
          setRecipientId(toId);
        } catch (error) {
          console.error(error);
        }
      });
    } else {
      setMaxTransfer([null, false]);
    }
  }, [api, balances, propRecipientId, propSenderId, recipientId, senderId]);

  useEffect((): void => {
    if (maxTransfer !== null && amount) {
      setAmountIsLessThanMax(amount.lt(maxTransfer))
    } else {
      setAmountIsLessThanMax(false)
    }
  }, [maxTransfer, amount]);

  useEffect((): void => {
    checkPhishing(propSenderId || senderId, propRecipientId || recipientId)
      .then(setPhishing)
      .catch(console.error);
  }, [propRecipientId, propSenderId, recipientId, senderId]);

  const goTopUp = useCallback(
    () => {
      navigate('accounts')
      onConfirmedClose();
    },
    [navigate]
  );

  const noReference = accountInfo
    ? isRefcount(accountInfo)
      ? accountInfo.refcount.isZero()
      : accountInfo.consumers.isZero()
    : true;
  const canToggleAll = !isProtected && balances && balances.accountId?.eq(propSenderId || senderId) && maxTransfer && noReference;

  const submitTransfer = async () => {
    toggleProcessing();
    if (!senderId || !recipientId || !amount || currentPair === null) {
      showInfo(t('Missing required information for transfer'), 'error');
      toggleProcessing();
      return;
    }

    const transferExtrinsic = isProtected
      ? api.tx.balances.transferKeepAlive(recipientId, amount)
      : api.tx.balances.transfer(recipientId, amount);

    try {
      await transferExtrinsic.signAndSend(currentPair, ({ status, events }) => {
        if (status.isInBlock) {
          let isError = false;
          events.forEach(({ event }) => {
            if (api.events.system.ExtrinsicFailed.is(event)) {
              isError = true;
              // TODO create human readable error info
              /*
              type ErrorKey = 'InvalidRefereeSign' | 'InvalidWorkerSign' .....;

              const errorMessages: Record<ErrorKey, string> = {
                  InvalidRefereeSign: 'Invalid signature of previous tutor',
                  InvalidWorkerSign: 'Invalid signature of student',
                  ...
              };

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
               */
            }
          });

          if (isError) {
            showInfo(t('Transfer failed'), 'error');
          } else {
            onSuccess();
            onConfirmedClose();
          }
          toggleProcessing();
        }
      });
    } catch (error) {
      showInfo(`${t('Transfer failed:')} ${String(error)}`, 'error');
      toggleProcessing();
    }
  };

  const amountToSendText = balanceToSlonString(amount || BN_ZERO);
  const maxTransferText = balanceToSlonString(maxTransfer || BN_ZERO);
  const rewardInfo = t('To get the lesson results, reward your tutor with ___ Slon.').replaceAll('___', amountToSendText);
  const topUpAmountText = balanceToSlonString(amount?.sub(maxTransfer || BN_ZERO).add(new BN('1000000000000')) || BN_ZERO);
  const topUpInfo = t('You do not have enough Slon to reward your tutor and get the lesson results. Top up your balance with at least ___ Slon.').replaceAll('___', topUpAmountText);
  const balanceInfo = t('You currently have ___ Slon.').replaceAll('___', maxTransferText);
  const isTopUpView = isRewardType && amount !== undefined && maxTransfer !== null && amount?.gte(maxTransfer);

  return (

    <StyledModal
      className='app--accounts-Modal'
      header={isRewardType ? t('Reward your tutor') : t('Send Slon')}
      onClose={onClose}
      size='small'
    >
      {!isRewardType || (isRewardType && maxTransfer != null && amount !== undefined) ?
        <>
          <Modal.Content>
            <div className={className}>
              {isRewardType && <div className="row">
                <h2>{isTopUpView ? topUpInfo : rewardInfo}</h2>
                {!isTopUpView && <p>{t('Slons will be deducted from your account.')}<br />{balanceInfo}</p>}
              </div>}

              {!isRewardType && <>
                <InputAddress
                  defaultValue={propSenderId}
                  isDisabled={!!propSenderId}
                  label={t('sender')}
                  labelExtra={
                    <Available
                      params={propSenderId || senderId}
                    />
                  }
                  onChange={changeSender}
                  type='account'
                />
                <InputAddress
                  defaultValue={propRecipientId}
                  isDisabled={!!propRecipientId}
                  label={t('recipient')}
                  labelExtra={!propRecipientId ?
                    <Available
                      params={propRecipientId || recipientId}
                    /> : ''
                  }
                  onChange={setRecipientId}
                  type='allPlus'
                />
                {recipientPhish && (
                  <MarkError content={t('The recipient is associated with a known phishing site on {{url}}', { replace: { url: recipientPhish } })} />
                )}
                {canToggleAll && isAll
                  ? (
                    <InputBalance
                      autoFocus
                      defaultValue={maxTransfer}
                      isDisabled
                      key={maxTransfer?.toString()}
                      label={t('transferable minus fees')}
                    />
                  )
                  : (
                    <>
                      <InputBalance
                        autoFocus
                        isError={!hasAvailable}
                        isZeroable
                        label={t('amount')}
                        defaultValue={amount}
                        maxValue={maxTransfer}
                        onChange={setAmount}
                        isDisabled={!isAmountEditable}
                      />
                    </>
                  )
                }
              </>}
            </div>
          </Modal.Content>
          <Modal.Actions>
            {isTopUpView ?
              <Button
                icon='hand-holding-dollar'
                label={t('Top up my balance')}
                onClick={goTopUp}
              />
              :
              <Button isDisabled={
                isProcessing ||
                (!isAll && (!hasAvailable || !amount)) ||
                !(propRecipientId || recipientId) ||
                !!recipientPhish ||
                !amountIsLessThanMax
              }
                isBusy={isProcessing}
                icon='paper-plane'
                label={isRewardType ? t('Reward your tutor') : t('Send Slon')}
                onClick={submitTransfer}
              />
            }

          </Modal.Actions>
        </> : <div className='connecting'>
          <Spinner label={t('Loading')} />
        </div>
      }
    </StyledModal>
  );
}

const StyledModal = styled(Modal)`
  .balance {
    margin-bottom: 0.5rem;
    text-align: right;
    padding-right: 1rem;

    .label {
      opacity: 0.7;
    }
  }

  label.with-help {
    flex-basis: 10rem;
  }

  .typeToggle {
    text-align: right;
  }

  .typeToggle+.typeToggle {
    margin-top: 0.375rem;
  }
`;

export default React.memo(Transfer);
