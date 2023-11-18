// Copyright 2021-2022 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import BN from 'bn.js';
import { getIPFSContentID, digestFromCIDv1, getCIDFromBytes, getIPFSDataFromContentID } from '@slonigiraf/helpers';
import { BN_ZERO } from '@polkadot/util';
import type { Signer } from '@polkadot/api/types';
import type { KeyringPair } from '@polkadot/keyring/types';
import React, { useCallback, useEffect, useState } from 'react';
import { web3FromSource } from '@polkadot/extension-dapp';
import { Button, InputAddress, InputBalance, TxButton } from '@polkadot/react-components';
import { useToggle } from '@polkadot/react-hooks';
import { keyring } from '@polkadot/ui-keyring';
import { isFunction, u8aToHex } from '@polkadot/util';
import { useTranslation } from '../translate.js';
import Unlock from '@polkadot/app-signing/Unlock';
import { useIpfsContext } from '@slonigiraf/app-slonig-components';
import { useApi } from '@polkadot/react-hooks';
import { parseJson } from '@slonigiraf/helpers';
import Editor from './Editor';
import ViewList from './ViewList';
import { useRouting } from './useRouting';
import { useLocation } from 'react-router-dom';
import { storeSetting } from '@slonigiraf/app-recommendations';

interface Props {
  className?: string;
}

interface AccountState {
  isExternal: boolean;
  isHardware: boolean;
  isInjected: boolean;
}

interface SignerState {
  isUsable: boolean;
  signer: Signer | null;
}

function Edit({ className = '' }: Props): React.ReactElement<Props> {
  const { ipfs, isIpfsReady, ipfsInitError } = useIpfsContext();
  const { t } = useTranslation();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const mentor = queryParams.get("mentor");
  useEffect(() => {
    if (mentor) {
      storeSetting("currentMentor", mentor);
    }
  }, [mentor]);

  const [currentPair, setCurrentPair] = useState<KeyringPair | null>(() => keyring.getPairs()[0] || null);
  const [text, setText] = useState<string>("");
  type JsonType = { [key: string]: any } | null;
  const [list, setList] = useState<JsonType>(null);
  const [item, setItem] = useState<JsonType>(null);
  const [{ isInjected }, setAccountState] = useState<AccountState>({ isExternal: false, isHardware: false, isInjected: false });
  const [isLocked, setIsLocked] = useState(false);
  const [{ isUsable, signer }, setSigner] = useState<SignerState>({ isUsable: true, signer: null });
  const [signature, setSignature] = useState('');
  const [isUnlockVisible, toggleUnlock] = useToggle();
  const [cidString, setCidString] = useState<string>("");
  const defaultTextHexId = '0xad007e87fa684a4c4acf169450a7fbcd5634f7602c828beb91f2acc68e81b21c';
  const { textHexId, setQueryParam } = useRouting(defaultTextHexId);
  const [lawHexData, setLawHexData] = useState('');
  const [amountList, setAmountList] = useState<BN>(BN_ZERO);
  const [amountItem, setAmountItem] = useState<BN>(BN_ZERO);
  const [previousAmount, setPreviousAmount] = useState<BN>(BN_ZERO);
  const [digestHex, setDigestHex] = useState<string>("");
  const [itemDigestHex, setItemDigestHex] = useState<string>("");
  const { api } = useApi();
  const [isEditView, setIsEditView] = useToggle(false);
  const [isAddingItem, setIsAddingElement] = useState<boolean>(false);
  const [itemIdHex, setItemIdHex] = useState<string>("");

  useEffect((): void => {
    const meta = (currentPair && currentPair.meta) || {};
    const isExternal = (meta.isExternal as boolean) || false;
    const isHardware = (meta.isHardware as boolean) || false;
    const isInjected = (meta.isInjected as boolean) || false;
    const isUsable = !(isExternal || isHardware || isInjected);

    setAccountState({ isExternal, isHardware, isInjected });
    setIsLocked(
      isInjected
        ? false
        : (currentPair && currentPair.isLocked) || false
    );
    setSignature('');
    setSigner({ isUsable, signer: null });

    // for injected, retrieve the signer
    if (meta.source && isInjected) {
      web3FromSource(meta.source as string)
        .catch((): null => null)
        .then((injected) => setSigner({
          isUsable: isFunction(injected?.signer?.signRaw),
          signer: injected?.signer || null
        }))
        .catch(console.error);
    }
  }, [currentPair]);

  useEffect(() => {
    _onSign();
  }, [list, item, textHexId]);

  useEffect(() => {
    setText(JSON.stringify(list));
  }, [list]);


  const _onClickChangeView = useCallback(
    (): void => {
      setIsEditView();
    },
    [setIsEditView]
  );

  const _onChangeAccount = useCallback(
    (accountId: string | null) => accountId && setCurrentPair(keyring.getPair(accountId)),
    []
  );

  const _onChangeLaw = useCallback(
    (lawId: string) => {
      setQueryParam("id", lawId);
    },
    [setQueryParam]
  );

  const _onSign = useCallback(
    async () => {
      if (!isIpfsReady) {
        return;
      }
      // generate data about list
      const textCIDString = await getIPFSContentID(ipfs, JSON.stringify(list));
      const digest = await digestFromCIDv1(textCIDString);
      setDigestHex(u8aToHex(digest));

      // generate data about item
      const itemCIDString = await getIPFSContentID(ipfs, JSON.stringify(item));
      const itemDigest = await digestFromCIDv1(itemCIDString);
      setItemDigestHex(u8aToHex(itemDigest));
    },
    [currentPair, isLocked, isUsable, signer, ipfs, list, item]
  );

  const _onUnlock = useCallback(
    (): void => {
      setIsLocked(false);
      toggleUnlock();
    },
    [toggleUnlock]
  );

  const _onSuccess = (_result: any) => {
    _onClickChangeView();
    setIsAddingElement(false);
    setItem(null);
    setItemDigestHex("");
    setItemIdHex("");
    setLawHexData(digestHex);
  }
  const _onFailed = (_result: any) => {
  }

  useEffect(() => {
    fetchLaw(textHexId);
  }, [textHexId]);

  useEffect(() => {
    const fetchIPFSData = async () => {
      if (!isIpfsReady || cidString.length < 2) {
        return;
      }
      const textValue = await getIPFSDataFromContentID(ipfs, cidString);
      setText(textValue);
      setList(parseJson(textValue));
    };

    fetchIPFSData();
  }, [cidString, ipfs]);

  async function fetchLaw(key: string) {
    const law = await api.query.laws.laws(key);
    if (law.isSome) {
      const tuple = law.unwrap();
      const byteArray = tuple[0]; // This should give you the [u8; 32]
      const bigIntValue = tuple[1]; // This should give you the u128
      const cid = await getCIDFromBytes(byteArray);
      setCidString(cid);
      setLawHexData(u8aToHex(byteArray));
      setAmountList(bigIntValue);
      setPreviousAmount(bigIntValue);
    }
  }

  const txButtonEdit = isUsable && <TxButton
    isDisabled={!(isUsable && !isLocked && isIpfsReady)}
    className='signButton'
    accountId={currentPair.address}
    icon='key'
    label={t('Sign')}
    onSuccess={_onSuccess}
    onFailed={_onFailed}
    onClick={_onSign}
    params={
      [textHexId, lawHexData, digestHex, amountList,]
    }
    tx={api.tx.laws.edit}
  />

  const txButtonCreateAndEdit = isUsable && <TxButton
    isDisabled={!(isUsable && !isLocked && isIpfsReady)}
    className='signButton'
    accountId={currentPair.address}
    icon='key'
    label={t('Sign')}
    onSuccess={_onSuccess}
    onFailed={_onFailed}
    onClick={_onSign}
    params={
      [itemIdHex, itemDigestHex, amountItem,
        textHexId, lawHexData, digestHex, amountList,]
    }
    tx={api.tx.laws.createAndEdit}
  />

  const txButton = (item == null) ? txButtonEdit : txButtonCreateAndEdit;

  const amountItemElement = (item == null ? "" : <div className='ui--row'>
    <InputBalance
      help={t('Tokens to burn for item help info')}
      isZeroable
      label={t('Tokens to burn for item')}
      value={amountItem}
      onChange={setAmountItem}
      isDisabled={!isIpfsReady}
    />
  </div>);

  const editor = (list == null) ? ""
    :
    <Editor list={list} item={item} isAddingItem={isAddingItem} onListChange={setList} onItemChange={setItem} onItemIdHexChange={setItemIdHex} onIsAddingItemChange={setIsAddingElement} />;

  const hiddenKeyringInitializer = <div className='ui--row' style={{ display: 'none' }}>
    <InputAddress
      className='full'
      help={t('select the account you wish to sign data with')}
      isInput={false}
      label={t('account')}
      onChange={_onChangeAccount}
      type='account'
    />
  </div>;
  const editView = (
    <div className={`toolbox--Sign ${className}`}>
      <h1>{t('Edit')}</h1>
      {editor}
      {amountItemElement}
      <div className='ui--row'>
        <InputBalance
          autoFocus
          help={t('Tokens to burn help info')}
          isZeroable
          label={t('Tokens to burn')}
          value={amountList}
          onChange={setAmountList}
          isDisabled={!isIpfsReady}
        />
      </div>
      <Button.Group>
        <div
          className='unlock-overlay'
          hidden={!isUsable || !isLocked || isInjected}
        >
          {isLocked && (
            <div className='unlock-overlay-warning'>
              <div className='unlock-overlay-content'>
                {t('You need to unlock this account to be able to sign data.')}<br />
                <Button.Group>
                  <Button
                    icon='unlock'
                    label={t('Unlock account')}
                    onClick={toggleUnlock}
                  />
                </Button.Group>
              </div>
            </div>
          )}
        </div>
        <div
          className='unlock-overlay'
          hidden={isUsable}
        >
          <div className='unlock-overlay-warning'>
            <div className='unlock-overlay-content'>
              {isInjected
                ? t('This injected account cannot be used to sign data since the extension does not support raw signing.')
                : t('This external account cannot be used to sign data. Only Limited support is currently available for signing from any non-internal accounts.')}
            </div>
          </div>
        </div>
        {isUnlockVisible && (
          <Unlock
            onClose={toggleUnlock}
            onUnlock={_onUnlock}
            pair={currentPair}
          />
        )}
        <Button
          icon='cancel'
          label={t('Cancel')}
          onClick={_onClickChangeView}
        />
        {!isLocked && txButton}
        {!isIpfsReady ? <div>{t('Connecting to IPFS...')}</div> : ""}
      </Button.Group>
      <div className='ui--row'>
        <p><b>Debug</b><br />
          List:<br />
          {JSON.stringify(list)}<br />
          Item:<br />{JSON.stringify(item)}
        </p>
      </div>
    </div>
  );

  const viewView = (
    <div className={`toolbox--Sign ${className}`}>
      <ViewList id={textHexId} currentPair={currentPair} onItemSelected={_onChangeLaw} />
      <Button.Group>
        <Button
          icon='edit'
          label={t('Edit')}
          onClick={_onClickChangeView}
        />
        {!isIpfsReady ? <div>{t('Connecting to IPFS...')}</div> : ""}
      </Button.Group>
    </div>
  );

  return <>
    {hiddenKeyringInitializer}
    {isEditView ? editView : viewView}
  </>;
}

export default React.memo(Edit);
