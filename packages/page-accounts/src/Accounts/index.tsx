// Copyright 2017-2023 @polkadot/app-accounts authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { ActionStatus } from '@polkadot/react-components/Status/types';
import type { KeyringAddress } from '@polkadot/ui-keyring/types';
import type { BN } from '@polkadot/util';
import type { AccountBalance, Delegation, SortedAccount } from '../types.js';
import type { SortCategory } from '../util.js';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { Button, styled, Table, InputAddress } from '@polkadot/react-components';
import { getAccountCryptoType } from '@polkadot/react-components/util';
import { useAccounts, useDelegations, useFavorites, useIncrement, useNextTick, useProxies } from '@polkadot/react-hooks';
import { keyring } from '@polkadot/ui-keyring';
import { BN_ZERO } from '@polkadot/util';
import { useTranslation } from '../translate.js';
import { sortAccounts } from '../util.js';
import Account from './Account.js';
import Summary from './Summary.js';
import { CenterQRContainer, useLoginContext } from '@slonigiraf/app-slonig-components';
import PayToAccountQR from './PayToAccountQR.js';
import TransferParser from './TransferParser.js';

interface Balances {
  accounts: Record<string, AccountBalance>;
  summary?: AccountBalance;
}

interface Props {
  className?: string;
  onStatusChange: (status: ActionStatus) => void;
}

interface SortControls {
  sortBy: SortCategory;
  sortFromMax: boolean;
}

type GroupName = 'accounts' | 'hardware' | 'injected' | 'multisig' | 'proxied' | 'qr' | 'testing';

const DEFAULT_SORT_CONTROLS: SortControls = { sortBy: 'date', sortFromMax: true };

const STORE_FAVS = 'accounts:favorites';

const GROUP_ORDER: GroupName[] = ['accounts', 'injected', 'qr', 'hardware', 'proxied', 'multisig', 'testing'];

function groupAccounts(accounts: SortedAccount[]): Record<GroupName, string[]> {
  const ret: Record<GroupName, string[]> = {
    accounts: [],
    hardware: [],
    injected: [],
    multisig: [],
    proxied: [],
    qr: [],
    testing: []
  };

  for (let i = 0; i < accounts.length; i++) {
    const { account, address } = accounts[i];
    const cryptoType = getAccountCryptoType(address);

    if (account?.meta.isHardware) {
      ret.hardware.push(address);
    } else if (account?.meta.isTesting) {
      ret.testing.push(address);
    } else if (cryptoType === 'injected') {
      ret.injected.push(address);
    } else if (cryptoType === 'multisig') {
      ret.multisig.push(address);
    } else if (cryptoType === 'proxied') {
      ret.proxied.push(address);
    } else if (cryptoType === 'qr') {
      ret.qr.push(address);
    } else {
      ret.accounts.push(address);
    }
  }

  return ret;
}

function Overview({ className = '', onStatusChange }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { _onChangeAccount, isLoggedIn, setIsAddingAccount, currentPair } = useLoginContext();
  const { allAccounts } = useAccounts();
  const [favorites, toggleFavorite] = useFavorites(STORE_FAVS);
  const [balances, setBalances] = useState<Balances>({ accounts: {} });
  const [filterOn] = useState<string>('');
  const [sortedAccounts, setSorted] = useState<SortedAccount[]>([]);
  const [{ sortBy, sortFromMax }] = useState<SortControls>(DEFAULT_SORT_CONTROLS);
  const delegations = useDelegations();
  const proxies = useProxies();
  const isNextTick = useNextTick();
  const [trigger, incTrigger] = useIncrement(1);

  const setBalance = useCallback(
    (account: string, balance: AccountBalance) =>
      setBalances(({ accounts }: Balances): Balances => {
        accounts[account] = balance;

        const aggregate = (key: keyof AccountBalance) =>
          Object.values(accounts).reduce((total: BN, value: AccountBalance) => total.add(value[key]), BN_ZERO);

        return {
          accounts,
          summary: {
            bonded: aggregate('bonded'),
            locked: aggregate('locked'),
            redeemable: aggregate('redeemable'),
            total: aggregate('total'),
            transferable: aggregate('transferable'),
            unbonding: aggregate('unbonding')
          }
        };
      }),
    []
  );

  // We use favorites only to check if it includes some element,
  // so Object is better than array for that because hashmap access is O(1).
  const favoritesMap = useMemo(
    () => Object.fromEntries(favorites.map((x) => [x, true])),
    [favorites]
  );

  const accountsMap = useMemo(
    () => allAccounts
      .map((address, index): Omit<SortedAccount, 'account'> & { account: KeyringAddress | undefined } => {
        const deleg = delegations && delegations[index]?.isDelegating && delegations[index]?.asDelegating;
        const delegation: Delegation | undefined = (deleg && {
          accountDelegated: deleg.target.toString(),
          amount: deleg.balance,
          conviction: deleg.conviction
        }) || undefined;

        return {
          account: keyring.getAccount(address),
          address,
          delegation,
          isFavorite: favoritesMap[address ?? ''] ?? false
        };
      })
      .filter((a): a is SortedAccount => !!a.account)
      .reduce((ret: Record<string, SortedAccount>, x) => {
        ret[x.address] = x;

        return ret;
      }, {}),
    [allAccounts, favoritesMap, delegations]
  );

  const header = useMemo(
    (): Record<GroupName, [React.ReactNode?, string?, number?, (() => void)?][]> => {
      const ret: Record<GroupName, [React.ReactNode?, string?, number?, (() => void)?][]> = {
        accounts: [[<>{t('accounts')}</>]],
        hardware: [[<>{t('hardware')}<div className='sub'>{t('accounts managed via hardware devices')}</div></>]],
        injected: [[<>{t('extension')}<div className='sub'>{t('accounts available via browser extensions')}</div></>]],
        multisig: [[<>{t('multisig')}<div className='sub'>{t('on-chain multisig accounts')}</div></>]],
        proxied: [[<>{t('proxied')}<div className='sub'>{t('on-chain proxied accounts')}</div></>]],
        qr: [[<>{t('via qr')}<div className='sub'>{t('accounts available via mobile devices')}</div></>]],
        testing: [[<>{t('development')}<div className='sub'>{t('accounts derived via development seeds')}</div></>]]
      };

      Object.values(ret).forEach((a): void => {
        a[0][1] = 'start';
        a[0][2] = 4;
      });

      return ret;
    },
    [t]
  );

  const grouped = useMemo(
    () => groupAccounts(sortedAccounts),
    [sortedAccounts]
  );

  const accounts = useMemo(
    () => Object.values(accountsMap).reduce<Record<string, React.ReactNode>>((all, { account, address, delegation, isFavorite }, index) => {
      all[address] = (
        <Account
          account={account}
          delegation={delegation}
          filter={filterOn}
          isFavorite={isFavorite}
          key={address}
          proxy={proxies?.[index]}
          setBalance={setBalance}
          toggleFavorite={toggleFavorite}
          onNameChange={incTrigger}
        />
      );

      return all;
    }, {}),
    [accountsMap, filterOn, proxies, setBalance, toggleFavorite]
  );

  const groups = useMemo(
    () => GROUP_ORDER.reduce<Record<string, React.ReactNode[]>>((groups, group) => {
      const items = grouped[group];

      if (items.length) {
        groups[group] = items.map((account) => accounts[account]);
      }

      return groups;
    }, {}),
    [grouped, accounts]
  );

  useEffect((): void => {
    setSorted((prev) => [
      ...prev
        .map((x) => accountsMap[x.address])
        .filter((x): x is SortedAccount => !!x),
      ...Object
        .keys(accountsMap)
        .filter((a) => !prev.find((y) => a === y.address))
        .map((a) => accountsMap[a])
    ]);
  }, [accountsMap]);

  useEffect((): void => {
    setSorted((sortedAccounts) =>
      sortAccounts(sortedAccounts, accountsMap, balances.accounts, sortBy, sortFromMax));
  }, [accountsMap, balances, sortBy, sortFromMax]);

  return (
    <StyledDiv className={className}>
      <TransferParser/>
      {isLoggedIn && <>
        <CenterQRContainer>
          <h2 className='prompt'>{t('To get Slon, ask a sender to scan:')}</h2>
          <PayToAccountQR />
        </CenterQRContainer>
        <Summary balance={balances.summary} />
        <NoLeftPaddingLabeledContent>
          <InputAddress
            key={currentPair?.address + "-"+trigger}
            className='full'
            isInput={false}
            label={t('Current account')}
            onChange={_onChangeAccount}
            type='account'
          />
        </NoLeftPaddingLabeledContent>
        <div className='ui--row'>
          <Button.Group>
            {isLoggedIn && <Button
              icon='plus'
              label={t('Add account')}
              onClick={() => setIsAddingAccount(true)}
            />}
          </Button.Group>
        </div>

        {!isNextTick || !sortedAccounts.length
          ? (
            <Table
              empty={isNextTick && sortedAccounts && t("You don't have any accounts. Some features are currently hidden and will only become available once you have accounts.")}
              header={header.accounts}
            />
          )
          : GROUP_ORDER.map((group) =>
            groups[group] && (
              <Table
                empty={t('No accounts')}
                header={header[group]}
                isSplit
                key={group}
              >
                {groups[group]}
              </Table>
            )
          )
        }
      </>
      }
    </StyledDiv>
  );
}


const NoLeftPaddingLabeledContent = styled.div`
  .ui--Dropdown {
    width: 100% !important;
    padding-left: 0px !important;
  }
  label {
    left: 20px !important;
  }
`;

const StyledDiv = styled.div`
  .ui--Dropdown {
    width: 15rem;
  }
  .header-box {
    .dropdown-section {
      display: flex;
      flex-direction: row;
      align-items: center;
    }

    .ui--Button-Group {
      margin-left: auto;
    }
  }
`;

export default React.memo(Overview);
