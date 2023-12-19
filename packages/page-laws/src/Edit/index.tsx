// Copyright 2021-2022 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import BN from 'bn.js';
import { getIPFSContentID, digestFromCIDv1, getCIDFromBytes, getIPFSDataFromContentID } from '@slonigiraf/app-slonig-components';
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
import { parseJson } from '@slonigiraf/app-slonig-components';
import Editor from './Editor';
import ViewList from './ViewList';
import { useLocation, useNavigate } from 'react-router-dom';
import { storeSetting, getSetting, storePseudonym } from '@slonigiraf/app-recommendations';
import type { AccountState, SignerState } from '@slonigiraf/app-slonig-components';
interface Props {
  className?: string;
}

function Edit({ className = '' }: Props): React.ReactElement<Props> {
  const { ipfs, isIpfsReady, ipfsInitError } = useIpfsContext();
  const { t } = useTranslation();
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
  const [lawHexData, setLawHexData] = useState('');
  const [amountList, setAmountList] = useState<BN>(BN_ZERO);
  const [amountItem, setAmountItem] = useState<BN>(BN_ZERO);
  const [previousAmount, setPreviousAmount] = useState<BN>(BN_ZERO);
  const [digestHex, setDigestHex] = useState<string>("");
  const [itemDigestHex, setItemDigestHex] = useState<string>("");
  const { api } = useApi();
  const [isEditView, toggleEditView] = useToggle(false);
  const [isAddingItem, setIsAddingElement] = useState<boolean>(false);
  const [itemIdHex, setItemIdHex] = useState<string>("");

  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const tutor = queryParams.get("tutor");
  const tutorName = queryParams.get("name");
  const defaultTextHexId = '0x333a6ac2dfbfd22fa96896f98bedb232157417ff9631f7186d8a0d50c1ec4d1c';
  const idFromQuery = tutor ? undefined : queryParams.get("id") || defaultTextHexId;
  const [textHexId, setTextHexId] = useState<string | undefined>(idFromQuery);

  const setQueryKnowledgeId = (value: any) => {
    const newQueryParams = new URLSearchParams();
    newQueryParams.set("id", value);
    setTextHexId(value);
    navigate({ ...location, search: newQueryParams.toString() });
  };

  useEffect(() => {
    const updateSetting = async () => {
      if (tutor) {
        await storeSetting("currentTutor", tutor);
        if (tutorName) {
          try {
            if (typeof tutor === 'string' && typeof tutorName === 'string') {
              await storePseudonym(tutor, tutorName);
            }
          } catch (error) {
            console.error("Failed to save tutor pseudonym:", error);
          }
        }
        const savedId = await getSetting("currentKnowledge");
        setTextHexId(savedId);
      } else if (idFromQuery) {
        if (idFromQuery !== defaultTextHexId) {
          await storeSetting("currentKnowledge", idFromQuery);
        }
        setTextHexId(idFromQuery);
      }
    };
    updateSetting();
  }, [tutor, idFromQuery]);

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
      toggleEditView();
    },
    [toggleEditView]
  );

  const _onClickEdit = useCallback(
    (): void => {
      if (isLocked) {  
        toggleUnlock();
      } else {
        _onClickChangeView();
      }
    },
    [isLocked, _onClickChangeView]
  );

  const _onChangeAccount = useCallback(
    (accountId: string | null) => accountId && setCurrentPair(keyring.getPair(accountId)),
    []
  );

  const _onChangeLaw = useCallback(
    (lawId: string) => {
      setQueryKnowledgeId(lawId);
    },
    [setQueryKnowledgeId]
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
      _onClickChangeView();
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
    if (key) {
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
  }

  const txButtonEdit = isUsable && <TxButton
    isDisabled={!(isUsable && !isLocked && isIpfsReady)}
    className='signButton'
    accountId={currentPair?.address}
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
    accountId={currentPair?.address}
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
        <Button
          icon='cancel'
          label={t('Cancel')}
          onClick={_onClickChangeView}
        />
        {!isLocked && txButton}
        {!isIpfsReady ? <div>{t('Connecting to IPFS...')}</div> : ""}
      </Button.Group>
    </div>
  );

  const viewView = (
    <div className={`toolbox--Sign ${className}`}>
      <ViewList id={textHexId} currentPair={currentPair} onItemSelected={_onChangeLaw} />
      <Button.Group>
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
        <Button
          icon='edit'
          label={t('Edit')}
          onClick={_onClickEdit}
        />
        {isUnlockVisible && (
          <Unlock
            onClose={toggleUnlock}
            onUnlock={_onUnlock}
            pair={currentPair}
          />
        )}
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
