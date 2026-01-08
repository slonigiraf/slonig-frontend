// Copyright 2021-2022 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import BN from 'bn.js';
import { getIPFSContentIDAndPinIt, digestFromCIDv1, getCIDFromBytes, getIPFSDataFromContentID, loadFromSessionStorage, saveToSessionStorage, KatexSpan, LawType, useSettingValue, useLog } from '@slonigiraf/slonig-components';
import { BN_ZERO } from '@polkadot/util';
import React, { useCallback, useEffect, useState } from 'react';
import { Button, InputBalance, styled } from '@polkadot/react-components';
import { useToggle } from '@polkadot/react-hooks';
import { u8aToHex } from '@polkadot/util';
import { useTranslation } from '../translate.js';
import { useIpfsContext } from '@slonigiraf/slonig-components';
import { useApi } from '@polkadot/react-hooks';
import { parseJson } from '@slonigiraf/slonig-components';
import Editor from './Editor.js';
import ViewList from './ViewList.js';
import { useLocation } from 'react-router-dom';
import { useLoginContext } from '@slonigiraf/slonig-components';
import { sendCreateAndEditTransaction, sendEditTransaction } from './sendTransaction.js';
import { useInfo } from '@slonigiraf/slonig-components';
import { getSetting, SettingKey } from '@slonigiraf/db';
import { sessionPrefix } from '../constants.js';
import GenerateSkills from './GenerateSkills.js';
import SkillTemplateList from './SkillTemplateList.js';

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
  const { logEvent } = useLog();
  const [isProcessing, toggleProcessing] = useToggle(false);
  const [isDeveloper, setDeveloper] = useState<boolean>(false);

  const openAIToken = useSettingValue(SettingKey.OPENAI_TOKEN);

  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const defaultTextHexId = '0xfed8e6f01c6c746876d69f7f10f933cdcd849068f6dc2fa26769fc92584492e7';
  const idFromQuery = queryParams.get('id') || defaultTextHexId;
  const [idFromSessionStorage] = useState<string>(loadFromSessionStorage(sessionPrefix, 'textHexId') || "");
  const [textHexId, setTextHexId] = useState<string | undefined>(idFromQuery);

  // Load state changes to session storage
  const [list, setList] = useState<JsonType>(loadFromSessionStorage(sessionPrefix, 'list'));
  const [item, setItem] = useState<JsonType>(loadFromSessionStorage(sessionPrefix, 'item'));
  const [cidString, setCidString] = useState<string>(loadFromSessionStorage(sessionPrefix, 'cidString') || '');
  const [lawHexData, setLawHexData] = useState<string>(loadFromSessionStorage(sessionPrefix, 'lawHexData') || "");
  const [amountList, setAmountList] = useState<BN | undefined>(new BN(loadFromSessionStorage(sessionPrefix, 'amountList') || BN_ZERO));
  const [amountItem, setAmountItem] = useState<BN | undefined>(new BN(loadFromSessionStorage(sessionPrefix, 'amountItem') || BN_ZERO));
  const [previousAmount, setPreviousAmount] = useState<BN>(new BN(loadFromSessionStorage(sessionPrefix, 'previousAmount') || BN_ZERO));
  const [isEditView, setIsEditView] = useState<boolean>(loadFromSessionStorage(sessionPrefix, 'isEditView') || false);
  const [isAddingLink, setIsAddingLink] = useState<boolean>(loadFromSessionStorage(sessionPrefix, 'isAddingLink') || false);
  const [isAddingItem, setIsAddingElement] = useState<boolean>(loadFromSessionStorage(sessionPrefix, 'isAddingItem') || false);
  const [itemIdHex, setItemIdHex] = useState<string>(loadFromSessionStorage(sessionPrefix, 'itemIdHex') || '');

  // For storing original values
  const [originalList, setOriginalList] = useState<JsonType>(loadFromSessionStorage(sessionPrefix, 'originalList'));
  const [originalCidString, setOriginalCidString] = useState<string>(loadFromSessionStorage(sessionPrefix, 'originalCidString') || "");
  const [originalLawHexData, setOriginalLawHexData] = useState<string>(loadFromSessionStorage(sessionPrefix, 'originalLawHexData') || "");
  const [originalAmountList, setOriginalAmountList] = useState<BN | undefined>(new BN(loadFromSessionStorage(sessionPrefix, 'originalAmountList') || BN_ZERO));
  const [isClassInstructionShown, setIsClassInstructionShown] = useState(false);

  const toggleEditView = () => setIsEditView(!isEditView);

  useEffect((): void => {
    const loadDev = async () => {
      const isDev = await getSetting(SettingKey.DEVELOPER);
      setDeveloper(isDev === 'true' ? true : false);
    };
    loadDev();
  }, []);

  // Save state changes to session storage
  useEffect(() => {
    saveToSessionStorage(sessionPrefix, 'textHexId', textHexId);
    saveToSessionStorage(sessionPrefix, 'list', list);
    saveToSessionStorage(sessionPrefix, 'item', item);
    saveToSessionStorage(sessionPrefix, 'cidString', cidString);
    saveToSessionStorage(sessionPrefix, 'lawHexData', lawHexData);
    saveToSessionStorage(sessionPrefix, 'amountList', amountList?.toString());
    saveToSessionStorage(sessionPrefix, 'amountItem', amountItem?.toString());
    saveToSessionStorage(sessionPrefix, 'previousAmount', previousAmount.toString());
    saveToSessionStorage(sessionPrefix, 'isEditView', isEditView);
    saveToSessionStorage(sessionPrefix, 'isAddingLink', isAddingLink);
    saveToSessionStorage(sessionPrefix, 'isAddingItem', isAddingItem);
    saveToSessionStorage(sessionPrefix, 'itemIdHex', itemIdHex);
    //
    saveToSessionStorage(sessionPrefix, 'originalList', originalList);
    saveToSessionStorage(sessionPrefix, 'originalCidString', originalCidString);
    saveToSessionStorage(sessionPrefix, 'originalLawHexData', originalLawHexData);
    saveToSessionStorage(sessionPrefix, 'originalAmountList', originalAmountList?.toString());

  }, [textHexId, list, item, cidString, lawHexData, amountList, amountItem, previousAmount, isEditView, isAddingLink, isAddingItem, itemIdHex,
    originalList, originalCidString, originalLawHexData, originalAmountList]);

  useEffect(() => {
    if (idFromQuery && idFromSessionStorage && (idFromQuery !== idFromSessionStorage)) {
      setIsEditView(false);
    }
  }, [idFromQuery, idFromSessionStorage]);

  useEffect(() => {
    const updateSetting = async () => {
      if (idFromQuery && idFromQuery !== textHexId) {
        setList(null);
        setTextHexId(idFromQuery);
      }
    };
    updateSetting();
  }, [idFromQuery, setList]);

  const _onClickChangeView = useCallback(
    (): void => {
      toggleEditView();
    },
    [toggleEditView]
  );

  const _onClickEdit = useCallback(
    (): void => {
      if (isLoggedIn) {
        logEvent('EDITING', 'CLICK_EDIT', list?.h);
        if (isDeveloper) {
          _onClickChangeView();
        } else {
          showInfo(t('Enable developer mode first in settings'), 'error')
        }
      } else {
        setLoginIsRequired(true);
      }
    },
    [_onClickChangeView, isLoggedIn, isDeveloper, list]
  );

  const _onSuccess = useCallback((digestHex: string) => {
    logEvent('EDITING', 'UPDATED', list?.h);
    _onClickChangeView();
    setIsAddingElement(false);
    setIsAddingLink(false);
    setItem(null);
    setItemIdHex('');
    setLawHexData(digestHex);
    toggleProcessing();
  }, [
    logEvent,
    list,
    _onClickChangeView,
    setIsAddingElement,
    setIsAddingLink,
    setItem,
    setItemIdHex,
    setLawHexData,
    toggleProcessing
  ]);
  const _onFailed = () => {
    toggleProcessing();
  }

  useEffect(() => {
    if (textHexId) {
      fetchLaw(textHexId);
    }
  }, [textHexId, lawHexData]);

  useEffect(() => {
    const fetchIPFSData = async () => {
      if (!isIpfsReady || !cidString || cidString.length < 2) {
        return;
      }
      const textValue = await getIPFSDataFromContentID(ipfs, cidString);
      const fetchedList = parseJson(textValue);
      if (JSON.stringify(fetchedList) != JSON.stringify(originalList)) {
        setList(fetchedList);
        setOriginalList(fetchedList);
      }
    };
    fetchIPFSData();
  }, [cidString, ipfs]);

  async function fetchLaw(key: string) {
    if (key) {
      const law = (await api.query.laws.laws(key)) as { isSome: boolean; unwrap: () => [Uint8Array, BN] };
      if (law.isSome) {
        const tuple = law.unwrap();
        const byteArray = tuple[0]; // This should give you the [u8; 32] as Uint8Array
        const bigIntValue = tuple[1]; // This should give you the u128 as bigint

        const cid = await getCIDFromBytes(byteArray);
        if (cid !== cidString) {
          setCidString(cid);
          setLawHexData(u8aToHex(byteArray));
          setAmountList(bigIntValue);
          setPreviousAmount(bigIntValue);
          // Set initial values
          setOriginalCidString(cid);
          setOriginalLawHexData(u8aToHex(byteArray));
          setOriginalAmountList(bigIntValue);
        }
      }
    }
  }

  const _onCancel = (): void => {
    _onClickChangeView();
    setIsAddingElement(false);
    setIsAddingLink(false);
    setItem(null);
    setItemIdHex("");
    setAmountItem(BN_ZERO);
    setList(originalList);
    setCidString(originalCidString);
    setLawHexData(originalLawHexData);
    if (originalAmountList) {
      setAmountList(originalAmountList);
    }
  };

  const canBeSaved = useCallback((list: any, item: any) => {
    if (!list || list.h === '') {
      return false;
    }

    if (!item) {
      return true;
    }

    if (item.h === '') {
      return false;
    }

    if (item.t !== LawType.SKILL) {
      return true;
    }

    const questions = item.q;

    if (!Array.isArray(questions)) {
      return false;
    }

    return questions.every(
      (q: any) => q && q.h !== '' && q.a !== ''
    );
  }, []);

  const _onSave = async (): Promise<void> => {
    logEvent('EDITING', 'CLICK_SAVE', list?.h);
    if (!isIpfsReady) {
      return;
    }
    if (!canBeSaved(list, item)) {
      showInfo(t('Please fill in all the fields!'), 'error');
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
      key={amountItem ? 'ai' + amountItem.toString() : 'ai'}
      autoFocus
      isZeroable
      label={t('Slon to burn for item')}
      value={amountItem}
      onChange={setAmountItem}
      isDisabled={!isIpfsReady}
    />
  </div>);

  const editor = (list == null) ? ""
    :
    <Editor list={list} item={item} isAddingLink={isAddingLink} isAddingItem={isAddingItem} onListChange={setList} onItemChange={setItem} onItemIdHexChange={setItemIdHex} onIsAddingItemChange={setIsAddingElement} onIsAddingLinkChange={setIsAddingLink} />;

  const exampleKatex = '<kx>\\int</kx>';
  const editView = (
    <div className={`toolbox--Sign ${className}`}>
      <h1>{t('Edit')}</h1>
      <span>{t('You can use the KaTeX language to add formulas:')}</span>&nbsp;
      <span><em>&lt;kx&gt;\int&lt;/kx&gt;</em> {t('is')} <KatexSpan content={exampleKatex} />.</span>&nbsp;
      <span><a href='https://katex.org/docs/supported' target='_blank'>{t('See more about KaTeX')}</a></span>
      {editor}
      {amountItemElement}
      <div className='ui--row'>
        <InputBalance
          key={amountList ? 'aL' + amountList.toString() : 'aL'}
          autoFocus
          isZeroable
          label={t('Slon to burn')}
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

      {openAIToken && list && list.i && list.t !== null && list.t === LawType.MODULE && (
        <Templates>
          <GenerateSkills moduleId={list.i} />
          <SkillTemplateList moduleId={list.i} />
        </Templates>
      )}
      {!isIpfsReady ? <div>{t('Connecting to IPFS...')}</div> : ""}
    </div>
  );


  const viewView = (
    <div className={`toolbox--Sign ${className}`}>
      {textHexId && <ViewList key={textHexId} id={textHexId} cidString={cidString} isClassInstructionShown={isClassInstructionShown} setIsClassInstructionShown={(isShown: boolean) => setIsClassInstructionShown(isShown)} list={list} />}
      {list &&
        <ButtonsRow>
          <Button
            icon='edit'
            label={t('Edit')}
            onClick={_onClickEdit}
          />
          {list.t !== null && list.t === LawType.MODULE &&
            <Button
              icon='person-chalkboard'
              label={t('Show to a classroom')}
              onClick={() => setIsClassInstructionShown(true)}
            />
          }
        </ButtonsRow>
      }
      {!isIpfsReady ? <div>{t('Connecting to IPFS...')}</div> : ""}
    </div>
  );

  return <>
    {isEditView ? editView : viewView}
  </>;
}

const ButtonsRow = styled.div`
  width: 100%;
  display: flex;
  justify-content: left;
  align-items: center;
  column-gap: 20px;
  .ui--Button {
    text-align: center;
    margin: 5px;
  }
`;

const Templates = styled.div`
  margin-top: 20px;
`;

export default React.memo(Edit);
