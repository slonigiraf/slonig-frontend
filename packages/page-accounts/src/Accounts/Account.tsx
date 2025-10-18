// Copyright 2017-2023 @polkadot/app-accounts authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { DeriveStakingAccount } from '@polkadot/api-derive/types';
import type { ActionStatus } from '@polkadot/react-components/Status/types';
import type { ProxyDefinition } from '@polkadot/types/interfaces';
import type { KeyringAddress } from '@polkadot/ui-keyring/types';
import type { AccountBalance, Delegation } from '../types.js';
import React, { useCallback, useEffect, useMemo } from 'react';
import { AddressInfo, AddressSmall, Button, Forget, Menu, Popup, styled } from '@polkadot/react-components';
import { useAccountInfo, useApi, useBalancesAll, useIncrement, useQueue, useStakingInfo, useToggle } from '@polkadot/react-hooks';
import { keyring } from '@polkadot/ui-keyring';
import { BN, BN_ZERO, isFunction } from '@polkadot/util';
import { useTranslation } from '../translate.js';
import { createMenuGroup } from '../util.js';
import { useTokenTransfer } from '@slonigiraf/app-slonig-components';
import EditAccount from '../modals/EditAccount.js';
interface Props {
  account: KeyringAddress;
  className?: string;
  delegation?: Delegation;
  filter: string;
  isFavorite: boolean;
  proxy?: [ProxyDefinition[], BN];
  setBalance: (address: string, value: AccountBalance) => void;
  toggleFavorite: (address: string) => void;
  onNameChange: () => void;
}

const BAL_OPTS_DEFAULT = {
  available: false,
  bonded: false,
  locked: false,
  redeemable: false,
  reserved: false,
  total: true,
  unlocking: false,
  vested: false
};

function calcVisible(filter: string, name: string, tags: string[]): boolean {
  if (filter.length === 0) {
    return true;
  }

  const _filter = filter.toLowerCase();

  return tags.reduce((result: boolean, tag: string): boolean => {
    return result || tag.toLowerCase().includes(_filter);
  }, name.toLowerCase().includes(_filter));
}

function calcUnbonding(stakingInfo?: DeriveStakingAccount) {
  if (!stakingInfo?.unlocking) {
    return BN_ZERO;
  }

  const filtered = stakingInfo.unlocking
    .filter(({ remainingEras, value }) => value.gt(BN_ZERO) && remainingEras.gt(BN_ZERO))
    .map((unlock) => unlock.value);
  const total = filtered.reduce((total, value) => total.iadd(value), new BN(0));

  return total;
}

function Account({ account: { address, meta }, className = '', filter, setBalance, onNameChange }: Props): React.ReactElement<Props> | null {
  const { t } = useTranslation();
  const api = useApi();
  const balancesAll = useBalancesAll(address);
  const stakingInfo = useStakingInfo(address);
  const { flags: { isDevelopment, isInjected }, name: accName, tags } = useAccountInfo(address);
  const [isEditOpen, toggleEdit] = useToggle();
  const [isForgetOpen, toggleForget] = useToggle();
  const { setIsTransferOpen, setTransferReceipt } = useTokenTransfer();
  const [trigger, incTrigger] = useIncrement(1);

  useEffect((): void => {
    if (balancesAll) {
      setBalance(address, {
        // some chains don't have "active" in the Ledger
        bonded: stakingInfo?.stakingLedger.active?.unwrap() || BN_ZERO,
        locked: balancesAll.lockedBalance,
        redeemable: stakingInfo?.redeemable || BN_ZERO,
        total: balancesAll.freeBalance.add(balancesAll.reservedBalance),
        transferable: balancesAll.availableBalance,
        unbonding: calcUnbonding(stakingInfo)
      });
    }
  }, [address, api, balancesAll, setBalance, stakingInfo]);

  const isVisible = useMemo(
    () => calcVisible(filter, accName, tags),
    [accName, filter, tags]
  );

  const _onForget = useCallback(
    (): void => {
      if (!address) {
        return;
      }

      const status: Partial<ActionStatus> = {
        account: address,
        action: 'forget'
      };

      try {
        keyring.forgetAccount(address);
        status.status = 'success';
        status.message = t('account forgotten');
      } catch (error) {
        status.status = 'error';
        status.message = (error as Error).message;
      }
    },
    [address, t]
  );

  const _onUpdate = useCallback(() => {
    incTrigger();
    onNameChange();
  }, [incTrigger, onNameChange]);

  const copyToClipboard = () => {
    const tempElem = document.createElement('textarea');
    tempElem.value = address;
    document.body.appendChild(tempElem);
    tempElem.select();
    document.execCommand('copy');
    document.body.removeChild(tempElem);
    _onUpdate();
  }

  const menuItems = useMemo(() => [
    createMenuGroup('backupGroup', [
      (
        <Menu.Item
          icon='copy'
          key='copyAddress'
          label={t('Copy address')}
          onClick={copyToClipboard}
        />
      ),
      !(isInjected || isDevelopment) && (
        <Menu.Item
          icon='edit'
          key='editAccount'
          label={t('Edit')}
          onClick={toggleEdit}
        />
      ),
      !(isInjected || isDevelopment) && (
        <Menu.Item
          icon='trash-alt'
          key='forgetAccount'
          label={t('Delete this account')}
          onClick={toggleForget}
        />
      )
    ], ''),
  ].filter((i) => i),
    [t, toggleEdit, toggleForget]);

  if (!isVisible) {
    return null;
  }

  return (
    <>
      <tr className={`${className} isExpanded isFirst packedBottom`} key={'account-tr-' + trigger}>
        <td>
          <AddressSmall
            parentAddress={meta.parentAddress as string}
            value={address}
            withShortAddress
          />
          {isEditOpen && (
            <EditAccount
              address={address}
              key='modal-edit-account'
              onUpdate={_onUpdate}
              onClose={toggleEdit}
            />
          )}
          {isForgetOpen && (
            <Forget
              address={address}
              key='modal-forget-account'
              onClose={toggleForget}
              onForget={_onForget}
            />
          )}
        </td>
        <td>
          <ButtonsDiv>
            {isFunction(api.api.tx.balances?.transfer) && (
              <Button
                className='send-button'
                icon='paper-plane'
                label={t('send')}
                onClick={
                  () => {
                    setIsTransferOpen(true);
                    setTransferReceipt(undefined);
                  }
                }
              />
            )}
            <Popup
              isDisabled={!menuItems.length}
              value={
                <Menu>
                  {menuItems}
                </Menu>
              }
            />
          </ButtonsDiv>
        </td>
      </tr>
      <tr className={`${className} isExpanded isLast packedTop`}>
        <td />
        <td>
          <AddressInfo
            address={address}
            balancesAll={balancesAll}
            withBalance={BAL_OPTS_DEFAULT}
          />
        </td>
      </tr>
    </>
  );
}
const ButtonsDiv = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0;
`;
export default React.memo(Account);
