// Copyright 2021-2022 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import BN from 'bn.js';
import { getIPFSContentIDAndPinIt, digestFromCIDv1, getCIDFromBytes, getIPFSDataFromContentID } from '@slonigiraf/app-slonig-components';
import { BN_ZERO } from '@polkadot/util';
import React, { useCallback, useEffect, useState } from 'react';
import { Button, InputBalance } from '@polkadot/react-components';
import { useToggle } from '@polkadot/react-hooks';
import { u8aToHex } from '@polkadot/util';
import { useTranslation } from '../translate.js';
import { useIpfsContext } from '@slonigiraf/app-slonig-components';
import { useApi } from '@polkadot/react-hooks';
import { parseJson } from '@slonigiraf/app-slonig-components';
import Editor from './Editor.js';
import ViewList from './ViewList.js';
import { useLocation } from 'react-router-dom';
import { storeSetting, getSetting, storePseudonym } from '@slonigiraf/app-recommendations';
import { useLoginContext } from '@slonigiraf/app-slonig-components';
import { sendCreateAndEditTransaction, sendEditTransaction } from './sendTransaction.js';
import { useInfo } from '@slonigiraf/app-slonig-components';

const saveToSessionStorage = (key: string, value: any) => {
  if (typeof window === "undefined") return;
  try {
    const serializedValue = JSON.stringify(value);
    sessionStorage.setItem(key, serializedValue);
  } catch (error) {
    console.error("Error saving to session storage", error);
  }
};

const loadFromSessionStorage = (key: string) => {
  if (typeof window === "undefined") return undefined;
  try {
    const serializedValue = sessionStorage.getItem(key);
    return serializedValue === null ? undefined : JSON.parse(serializedValue);
  } catch (error) {
    console.error("Error loading from session storage", error);
    return undefined;
  }
};


interface Props {
  className?: string;
}

function Edit({ className = '' }: Props): React.ReactElement<Props> {
  type JsonType = { [key: string]: any } | null;
  const { showInfo } = useInfo();
  const { ipfs, isIpfsReady } = useIpfsContext();
  const { t } = useTranslation();
  const { currentPair, isLoggedIn, setLoginIsRequired } = useLoginContext();
  const { api } = useApi();
  const [isProcessing, toggleProcessing] = useToggle(false);

  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const tutor = queryParams.get("tutor");
  const tutorName = queryParams.get("name");
  const defaultTextHexId = '0xfed8e6f01c6c746876d69f7f10f933cdcd849068f6dc2fa26769fc92584492e7';
  const idFromQuery = tutor ? undefined : queryParams.get("id") || defaultTextHexId;
  const [textHexId, setTextHexId] = useState<string | undefined>(idFromQuery);

  const [list, setList] = useState<JsonType>(null);
  const [item, setItem] = useState<JsonType>(null);
  const [cachedList, setCachedList] = useState<JsonType>(null);
  const [cidString, setCidString] = useState<string>("");
  const [lawHexData, setLawHexData] = useState('');
  const [amountList, setAmountList] = useState<BN>(BN_ZERO);
  const [amountItem, setAmountItem] = useState<BN>(BN_ZERO);
  const [previousAmount, setPreviousAmount] = useState<BN>(BN_ZERO);
  const [isEditView, toggleEditView] = useToggle(false);
  const [isAddingItem, setIsAddingElement] = useState<boolean>(false);
  const [itemIdHex, setItemIdHex] = useState<string>("");

  useEffect(() => {
    const updateSetting = async () => {
      if (tutor) {
        await storeSetting("tutor", tutor);
        if (tutorName) {
          try {
            if (typeof tutor === 'string' && typeof tutorName === 'string') {
              await storePseudonym(tutor, tutorName);
            }
          } catch (error) {
            console.error("Failed to save tutor pseudonym:", error);
          }
        }
        const savedId = await getSetting("knowledge");
        setTextHexId(savedId);
      } else if (idFromQuery) {
        if (idFromQuery !== defaultTextHexId) {
          await storeSetting("knowledge", idFromQuery);
        }
        setTextHexId(idFromQuery);
      }
    };
    updateSetting();
  }, [tutor, idFromQuery]);


  const _onClickChangeView = useCallback(
    (): void => {
      toggleEditView();
    },
    [toggleEditView]
  );

  const _onClickEdit = useCallback(
    (): void => {
      if (isLoggedIn) {
        _onClickChangeView();
      } else {
        setLoginIsRequired(true);
      }
    },
    [_onClickChangeView, isLoggedIn]
  );

  const _onSuccess = (digestHex: string) => {
    _onClickChangeView();
    setIsAddingElement(false);
    setItem(null);
    setItemIdHex("");
    setLawHexData(digestHex);
    toggleProcessing();
  }
  const _onFailed = () => {
    toggleProcessing();
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
      const fetchedList = parseJson(textValue);
      setList(fetchedList);
      setCachedList(fetchedList);
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

  const _onCancel = (): void => {
    _onClickChangeView();
    setIsAddingElement(false);
    setItem(null);
    setItemIdHex("");
    setList(cachedList);
  };

  const _onSave = async (): Promise<void> => {
    if (!isIpfsReady) {
      return;
    }
    // generate data about list
    const textCIDString = await getIPFSContentIDAndPinIt(ipfs, JSON.stringify(list));
    const digest = await digestFromCIDv1(textCIDString);
    const digestHex = u8aToHex(digest);

    // generate data about item
    const itemCIDString = await getIPFSContentIDAndPinIt(ipfs, JSON.stringify(item));
    const itemDigest = await digestFromCIDv1(itemCIDString);
    const itemDigestHex = u8aToHex(itemDigest);

    if (item == null) {
      if (!(textHexId && lawHexData && digestHex && amountList && currentPair)) {
        console.error('Required parameters are missing');
        return;
      }
      toggleProcessing();
      sendEditTransaction(textHexId, lawHexData, digestHex, amountList,
        currentPair, api, t, showInfo, _onSuccess, _onFailed);
    } else {
      if (!(itemIdHex && itemDigestHex && amountItem &&
        textHexId && lawHexData && digestHex && amountList && currentPair)) {
        console.error('Required parameters are missing');
        return;
      }
      toggleProcessing();
      sendCreateAndEditTransaction(itemIdHex, itemDigestHex, amountItem,
        textHexId, lawHexData, digestHex, amountList,
        currentPair, api, t, showInfo, _onSuccess, _onFailed);
    }
  };

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
        <Button
          icon='cancel'
          label={t('Cancel')}
          onClick={_onCancel}
        />
        <Button
          icon='save'
          label={t('Save')}
          onClick={_onSave}
          isDisabled={isProcessing}
        />
        {!isIpfsReady ? <div>{t('Connecting to IPFS...')}</div> : ""}
    </div>
  );

  const viewView = (
    <div className={`toolbox--Sign ${className}`}>
      <ViewList id={textHexId} currentPair={currentPair} />
        <Button
          icon='edit'
          label={t('Edit')}
          onClick={_onClickEdit}
        />
        {!isIpfsReady ? <div>{t('Connecting to IPFS...')}</div> : ""}
    </div>
  );

  return <>
    {isEditView ? editView : viewView}
  </>;
}

export default React.memo(Edit);
