// Copyright 2017-2023 @polkadot/app-accounts authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { ApiPromise } from '@polkadot/api';
import type { SubmittableExtrinsic } from '@polkadot/api/types';
import type { DeriveDemocracyLock, DeriveStakingAccount } from '@polkadot/api-derive/types';
import type { Ledger } from '@polkadot/hw-ledger';
import type { ActionStatus } from '@polkadot/react-components/Status/types';
import type { Option } from '@polkadot/types';
import type { ProxyDefinition, RecoveryConfig } from '@polkadot/types/interfaces';
import type { KeyringAddress, KeyringJson$Meta } from '@polkadot/ui-keyring/types';
import type { AccountBalance, Delegation } from '../types.js';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useAccountLocks from '@polkadot/app-referenda/useAccountLocks';
import { AddressInfo, AddressSmall, Badge, Button, ChainLock, Forget, Menu, Popup, styled, Table } from '@polkadot/react-components';
import { useAccountInfo, useApi, useBalancesAll, useBestNumber, useCall, useIncrement, useLedger, useQueue, useStakingInfo, useToggle } from '@polkadot/react-hooks';
import { keyring } from '@polkadot/ui-keyring';
import { BN, BN_ZERO, formatBalance, formatNumber, isFunction } from '@polkadot/util';
import Backup from '../modals/Backup.js';
import ChangePass from '../modals/ChangePass.js';
import DelegateModal from '../modals/Delegate.js';
import IdentityMain from '../modals/IdentityMain.js';
import IdentitySub from '../modals/IdentitySub.js';
import MultisigApprove from '../modals/MultisigApprove.js';
import ProxyOverview from '../modals/ProxyOverview.js';
import RecoverAccount from '../modals/RecoverAccount.js';
import RecoverSetup from '../modals/RecoverSetup.js';
import UndelegateModal from '../modals/Undelegate.js';
import { useTranslation } from '../translate.js';
import { createMenuGroup } from '../util.js';
import useMultisigApprovals from './useMultisigApprovals.js';
import useProxies from './useProxies.js';
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

interface DemocracyUnlockable {
  democracyUnlockTx: SubmittableExtrinsic<'promise'> | null;
  ids: BN[];
}

interface ReferendaUnlockable {
  referendaUnlockTx: SubmittableExtrinsic<'promise'> | null;
  ids: [classId: BN, refId: BN][];
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

const BAL_OPTS_EXPANDED = {
  available: true,
  bonded: true,
  locked: true,
  nonce: true,
  redeemable: true,
  reserved: true,
  total: false,
  unlocking: true,
  vested: true
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

function createClearDemocracyTx(api: ApiPromise, address: string, ids: BN[]): SubmittableExtrinsic<'promise'> | null {
  return api.tx.utility && ids.length
    ? api.tx.utility.batch(
      ids
        .map((id) => api.tx.democracy.removeVote(id))
        .concat(api.tx.democracy.unlock(address))
    )
    : null;
}

function createClearReferendaTx(api: ApiPromise, address: string, ids: [BN, BN][], palletReferenda = 'convictionVoting'): SubmittableExtrinsic<'promise'> | null {
  if (!api.tx.utility || !ids.length) {
    return null;
  }

  const inner = ids.map(([classId, refId]) => api.tx[palletReferenda].removeVote(classId, refId));

  ids
    .reduce((all: BN[], [classId]) => {
      if (!all.find((id) => id.eq(classId))) {
        all.push(classId);
      }

      return all;
    }, [])
    .forEach((classId): void => {
      inner.push(api.tx[palletReferenda].unlock(classId, address));
    });

  return api.tx.utility.batch(inner);
}

async function showLedgerAddress(getLedger: () => Ledger, meta: KeyringJson$Meta): Promise<void> {
  const ledger = getLedger();

  await ledger.getAddress(true, meta.accountOffset as number || 0, meta.addressOffset as number || 0);
}

const transformRecovery = {
  transform: (opt: Option<RecoveryConfig>) => opt.unwrapOr(null)
};

function Account({ account: { address, meta }, className = '', delegation, filter, isFavorite, proxy, setBalance, toggleFavorite, onNameChange }: Props): React.ReactElement<Props> | null {
  const { t } = useTranslation();
  const [isExpanded, toggleIsExpanded] = useToggle(false);
  const { queueExtrinsic } = useQueue();
  const api = useApi();
  const { getLedger } = useLedger();
  const bestNumber = useBestNumber();
  const balancesAll = useBalancesAll(address);
  const stakingInfo = useStakingInfo(address);
  const democracyLocks = useCall<DeriveDemocracyLock[]>(api.api.derive.democracy?.locks, [address]);
  const recoveryInfo = useCall<RecoveryConfig | null>(api.api.query.recovery?.recoverable, [address], transformRecovery);
  const multiInfos = useMultisigApprovals(address);
  const proxyInfo = useProxies(address);
  const { flags: { isDevelopment, isEditable, isEthereum, isExternal, isHardware, isInjected, isMultisig, isProxied }, genesisHash, identity, name: accName, onSetGenesisHash, tags } = useAccountInfo(address);
  const convictionLocks = useAccountLocks('referenda', 'convictionVoting', address);
  const [{ democracyUnlockTx }, setDemocracyUnlock] = useState<DemocracyUnlockable>({ democracyUnlockTx: null, ids: [] });
  const [{ referendaUnlockTx }, setReferandaUnlock] = useState<ReferendaUnlockable>({ ids: [], referendaUnlockTx: null });
  const [vestingVestTx, setVestingTx] = useState<SubmittableExtrinsic<'promise'> | null>(null);
  const [isBackupOpen, toggleBackup] = useToggle();
  const [isEditOpen, toggleEdit] = useToggle();
  const [isForgetOpen, toggleForget] = useToggle();
  const [isIdentityMainOpen, toggleIdentityMain] = useToggle();
  const [isIdentitySubOpen, toggleIdentitySub] = useToggle();
  const [isMultisigOpen, toggleMultisig] = useToggle();
  const [isProxyOverviewOpen, toggleProxyOverview] = useToggle();
  const [isPasswordOpen, togglePassword] = useToggle();
  const [isRecoverAccountOpen, toggleRecoverAccount] = useToggle();
  const [isRecoverSetupOpen, toggleRecoverSetup] = useToggle();
  const { setIsTransferOpen } = useTokenTransfer();
  const [isDelegateOpen, toggleDelegate] = useToggle();
  const [isUndelegateOpen, toggleUndelegate] = useToggle();
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

      api.api.tx.vesting?.vest && setVestingTx(() =>
        balancesAll.vestingLocked.isZero()
          ? null
          : api.api.tx.vesting.vest()
      );
    }
  }, [address, api, balancesAll, setBalance, stakingInfo]);

  useEffect((): void => {
    bestNumber && democracyLocks && setDemocracyUnlock(
      (prev): DemocracyUnlockable => {
        const ids = democracyLocks
          .filter(({ isFinished, unlockAt }) => isFinished && bestNumber.gt(unlockAt))
          .map(({ referendumId }) => referendumId);

        if (JSON.stringify(prev.ids) === JSON.stringify(ids)) {
          return prev;
        }

        return {
          democracyUnlockTx: createClearDemocracyTx(api.api, address, ids),
          ids
        };
      }
    );
  }, [address, api, bestNumber, democracyLocks]);

  useEffect((): void => {
    bestNumber && convictionLocks && setReferandaUnlock(
      (prev): ReferendaUnlockable => {
        const ids = convictionLocks
          .filter(({ endBlock }) => endBlock.gt(BN_ZERO) && bestNumber.gt(endBlock))
          .map(({ classId, refId }): [classId: BN, refId: BN] => [classId, refId]);

        if (JSON.stringify(prev.ids) === JSON.stringify(ids)) {
          return prev;
        }

        return {
          ids,
          referendaUnlockTx: createClearReferendaTx(api.api, address, ids)
        };
      }
    );
  }, [address, api, bestNumber, convictionLocks]);

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

  const _clearDemocracyLocks = useCallback(
    () => democracyUnlockTx && queueExtrinsic({
      accountId: address,
      extrinsic: democracyUnlockTx
    }),
    [address, democracyUnlockTx, queueExtrinsic]
  );

  const _clearReferendaLocks = useCallback(
    () => referendaUnlockTx && queueExtrinsic({
      accountId: address,
      extrinsic: referendaUnlockTx
    }),
    [address, referendaUnlockTx, queueExtrinsic]
  );

  const _vestingVest = useCallback(
    () => vestingVestTx && queueExtrinsic({
      accountId: address,
      extrinsic: vestingVestTx
    }),
    [address, queueExtrinsic, vestingVestTx]
  );

  const _showOnHardware = useCallback(
    // TODO: we should check the hardwareType from metadata here as well,
    // for now we are always assuming hardwareType === 'ledger'
    (): void => {
      showLedgerAddress(getLedger, meta).catch((error): void => {
        console.error(`ledger: ${(error as Error).message}`);
      });
    },
    [getLedger, meta]
  );

  const _onUpdate = useCallback(() => {
    incTrigger();
    onNameChange();
  }, [incTrigger, onNameChange]);

  const menuItems = useMemo(() => [
    createMenuGroup('identityGroup', [
      isFunction(api.api.tx.identity?.setIdentity) && !isHardware && (
        <Menu.Item
          icon='link'
          key='identityMain'
          label={t('Set on-chain identity')}
          onClick={toggleIdentityMain}
        />
      ),
      isFunction(api.api.tx.identity?.setSubs) && identity?.display && !isHardware && (
        <Menu.Item
          icon='vector-square'
          key='identitySub'
          label={t('Set on-chain sub-identities')}
          onClick={toggleIdentitySub}
        />
      ),
      isFunction(api.api.tx.democracy?.unlock) && democracyUnlockTx && (
        <Menu.Item
          icon='broom'
          key='clearDemocracy'
          label={t('Clear expired democracy locks')}
          onClick={_clearDemocracyLocks}
        />
      ),
      isFunction(api.api.tx.convictionVoting?.unlock) && referendaUnlockTx && (
        <Menu.Item
          icon='broom'
          key='clearReferenda'
          label={t('Clear expired referenda locks')}
          onClick={_clearReferendaLocks}
        />
      ),
      isFunction(api.api.tx.vesting?.vest) && vestingVestTx && (
        <Menu.Item
          icon='unlock'
          key='vestingVest'
          label={t('Unlock vested amount')}
          onClick={_vestingVest}
        />
      )
    ], t('Identity')),
    createMenuGroup('backupGroup', [
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
    isFunction(api.api.tx.recovery?.createRecovery) && createMenuGroup('reoveryGroup', [
      !recoveryInfo && (
        <Menu.Item
          icon='redo'
          key='makeRecoverable'
          label={t('Make recoverable')}
          onClick={toggleRecoverSetup}
        />
      ),
      <Menu.Item
        icon='screwdriver'
        key='initRecovery'
        label={t('Initiate recovery for another')}
        onClick={toggleRecoverAccount}
      />
    ], t('Recovery')),
    isFunction(api.api.tx.multisig?.asMulti) && isMultisig && createMenuGroup('multisigGroup', [
      <Menu.Item
        icon='file-signature'
        isDisabled={!multiInfos || !multiInfos.length}
        key='multisigApprovals'
        label={t('Multisig approvals')}
        onClick={toggleMultisig}
      />
    ], t('Multisig')),
    isFunction(api.api.query.democracy?.votingOf) && delegation?.accountDelegated && createMenuGroup('undelegateGroup', [
      <Menu.Item
        icon='user-edit'
        key='changeDelegate'
        label={t('Change democracy delegation')}
        onClick={toggleDelegate}
      />,
      <Menu.Item
        icon='user-minus'
        key='undelegate'
        label={t('Undelegate')}
        onClick={toggleUndelegate}
      />
    ], t('Undelegate')),
    createMenuGroup('delegateGroup', [
      isFunction(api.api.query.democracy?.votingOf) && !delegation?.accountDelegated && (
        <Menu.Item
          icon='user-plus'
          key='delegate'
          label={t('Delegate democracy votes')}
          onClick={toggleDelegate}
        />
      ),
      isFunction(api.api.query.proxy?.proxies) && (
        <Menu.Item
          icon='sitemap'
          key='proxy-overview'
          label={proxy?.[0].length
            ? t('Manage proxies')
            : t('Add proxy')
          }
          onClick={toggleProxyOverview}
        />
      )
    ], t('Delegate')),
    isEditable && !api.isDevelopment && createMenuGroup('genesisGroup', [
      <ChainLock
        className='accounts--network-toggle'
        genesisHash={genesisHash}
        key='chainlock'
        onChange={onSetGenesisHash}
      />
    ])
  ].filter((i) => i),
    [_clearDemocracyLocks, _clearReferendaLocks, _showOnHardware, _vestingVest, api, delegation, democracyUnlockTx, genesisHash, identity, isDevelopment, isEditable, isEthereum, isExternal, isHardware, isInjected, isMultisig, multiInfos, onSetGenesisHash, proxy, referendaUnlockTx, recoveryInfo, t, toggleBackup, toggleDelegate, toggleForget, toggleIdentityMain, toggleIdentitySub, toggleMultisig, togglePassword, toggleProxyOverview, toggleRecoverAccount, toggleRecoverSetup, toggleUndelegate, vestingVestTx]);

  if (!isVisible) {
    return null;
  }

  return (
    <>
      <StyledTr className={`${className} isExpanded isFirst packedBottom`} key={'account-tr-' + trigger}>
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
        <td className='actions button'>
          <Button.Group>
            {isFunction(api.api.tx.balances?.transfer) && (
              <Button
                className='send-button'
                icon='paper-plane'
                label={t('send')}
                onClick={
                  () => {
                    setIsTransferOpen(true)
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
          </Button.Group>
        </td>
      </StyledTr>
      <StyledTr className={`${className} isExpanded ${isExpanded ? '' : 'isLast'} packedTop`}>
        <td />
        <td className='balance all'>
          <AddressInfo
            address={address}
            balancesAll={balancesAll}
            withBalance={BAL_OPTS_DEFAULT}
          />
        </td>
      </StyledTr>
    </>
  );
}

const StyledTr = styled.tr`
  .devBadge {
    opacity: var(--opacity-light);
  }
`;

export default React.memo(Account);
