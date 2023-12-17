import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../translate';
import { QRAction, QRWithShareAndCopy, ScanQR, getBaseUrl, nameFromKeyringPair } from '@slonigiraf/app-slonig-components';
import { getSetting, storeSetting } from '@slonigiraf/app-recommendations';
import type { KeyringPair } from '@polkadot/keyring/types';
import { Button, Dropdown, InputAddress } from '@polkadot/react-components';
import { useLiveQuery } from "dexie-react-hooks";
import { db, Letter } from '@slonigiraf/app-recommendations';
import { keyForCid } from '@slonigiraf/app-slonig-components';
import { useLocation, useNavigate } from 'react-router-dom';
import { styled } from '@polkadot/react-components';
import { keyring } from '@polkadot/ui-keyring';
import { web3FromSource } from '@polkadot/extension-dapp';
import { isFunction, u8aToHex, hexToU8a, u8aWrapBytes } from '@polkadot/util';
import { useToggle } from '@polkadot/react-hooks';
import { getDataToSignByWorker } from '@slonigiraf/helpers';
import BN from 'bn.js';
import { BN_ONE } from '@polkadot/util';
import { useApi } from '@polkadot/react-hooks';
import { useBlockTime } from '@polkadot/react-hooks';
import Unlock from '@polkadot/app-signing/Unlock';
import type { AccountState, SignerState } from '@slonigiraf/app-slonig-components';

interface Props {
  className?: string;
  cid: string;
}

const getBlockAllowed = (currentBlock: BN, blockTimeMs: number, secondsToAdd: number): BN => {
  const secondsToGenerateBlock = blockTimeMs / 1000;
  const blocksToAdd = new BN(secondsToAdd).div(new BN(secondsToGenerateBlock));
  const blockAllowed = currentBlock.add(blocksToAdd);
  return blockAllowed;
}



function SkillQR({ className = '', cid }: Props): React.ReactElement<Props> {
  // Using key
  const { api, isApiReady } = useApi();
  // Last block number
  const [millisecondsPerBlock,] = useBlockTime(BN_ONE, api);
  const [blockAllowed, setBlockAllowed] = useState<BN>(new BN(1));
  // Key management
  const [currentPair, setCurrentPair] = useState<KeyringPair | null>(null);
  const [diplomaPublicKeyHex, setDiplomaPublicKeyHex] = useState<>("");
  const [{ isInjected }, setAccountState] = useState<AccountState>({ isExternal: false, isHardware: false, isInjected: false });
  const [isLocked, setIsLocked] = useState(false);
  const [{ isUsable, signer }, setSigner] = useState<SignerState>({ isUsable: true, signer: null });
  const [isUnlockVisible, toggleUnlock] = useToggle();
  // Rest params
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const tutorFromQuery = queryParams.get("tutor");
  const [tutor, setTutor] = useState<string | null>(tutorFromQuery);
  const tutors = useLiveQuery(() => db.pseudonyms.toArray(), []);
  const [diplomaToReexamine, setDiplomaToReexamine] = useState<Letter | null>(null);
  const [studentSignatureOverDiplomaToReexamine, setStudentSignatureOverDiplomaToReexamine] = useState<string>("");

  const setQueryTutorId = (value: any) => {
    const newQueryParams = new URLSearchParams();
    newQueryParams.set("tutor", value);
    navigate({ ...location, search: newQueryParams.toString() });
  };

  // If account is unlocked by password
  const _onUnlock = useCallback(
    (): void => {
      setIsLocked(false);
      toggleUnlock();
    },
    [toggleUnlock]
  );

  // Fetch block number (once)
  useEffect(() => {
    async function fetchBlockNumber() {
      if (isApiReady) {
        try {
          const chainHeader = await api.rpc.chain.getHeader();
          const currentBlockNumber = new BN(chainHeader.number.toString());
          //allow to reexamine within following time
          const secondsValid = 1800;
          const blockAllowed: BN = getBlockAllowed(currentBlockNumber, millisecondsPerBlock, secondsValid);
          setBlockAllowed(blockAllowed);
        } catch (error) {
          console.error("Error fetching block number: ", error);
        }
      }
    }
    fetchBlockNumber();
  }, [api, isApiReady]);

  // Initialize key
  useEffect((): void => {
    if(currentPair){
      const meta = (currentPair && currentPair.meta) || {};
      const isExternal = (meta.isExternal as boolean) || false;
      const isHardware = (meta.isHardware as boolean) || false;
      const isInjected = (meta.isInjected as boolean) || false;
      const isUsable = !(isExternal || isHardware || isInjected);
  
      setAccountState({ isExternal, isHardware, isInjected });
      const isLocked = isInjected ? false : (currentPair && currentPair.isLocked) || false;
      setIsLocked(isLocked);
      const diplomaKey = (!isLocked)? keyForCid(currentPair, cid) : null;
      const diplomaPublicKeyHex = u8aToHex(diplomaKey?.publicKey);
      setDiplomaPublicKeyHex(diplomaPublicKeyHex);
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
    }
  }, [currentPair, isLocked]);

  const _onChangeAccount = useCallback(
    (accountId: string | null) => accountId && setCurrentPair(keyring.getPair(accountId)),
    []
  );

  // Fetch currentTutor and set it as the default in the dropdown
  useEffect(() => {
    const fetchTutorSetting = async () => {
      if (tutorFromQuery) {
        await storeSetting("currentTutor", tutorFromQuery);
        setTutor(tutorFromQuery);
      } else {
        const tutorFromSettings = await getSetting("currentTutor");
        if (tutors && tutorFromSettings) {
          setTutor(tutorFromSettings);
        }
      }
    };
    fetchTutorSetting();
  }, [tutors, tutorFromQuery]);

  // Prepare dropdown options
  let tutorOptions = tutors?.map(tutor => ({
    text: tutor.pseudonym,
    value: tutor.publicKey
  }));

  // Check if 'tutor' is not null and not in 'tutorOptions'
  if (tutor && tutorOptions && !tutorOptions.some(option => option.value === tutor)) {
    // Add 'From web-link' as the first option
    tutorOptions = [{ text: t('From web-link'), value: tutor }, ...tutorOptions];
  }

  const handleTutorSelect = async (selectedKey: string) => {
    setTutor(selectedKey);
    if (selectedKey) {
      try {
        await db.settings.put({ id: "currentTutor", value: selectedKey });
      } catch (error) {
        console.error('Error saving tutor selection:', error);
      }
      setQueryTutorId(selectedKey);
    }
  };

  const studentIdentity = u8aToHex(currentPair?.publicKey);

  useEffect(() => {
    const fetchRandomDiploma = async () => {
      const allDiplomas = await db.letters.where('workerId').equals(studentIdentity).toArray();
      if (allDiplomas.length > 0) {
        const randomIndex = Math.floor(Math.random() * allDiplomas.length);
        setDiplomaToReexamine(allDiplomas[randomIndex]);
      }
    };
    fetchRandomDiploma();
  }, [studentIdentity]);

  useEffect(() => {
    const showQR = async () => {
      _onSign();
    };
    showQR();
  }, [tutor, diplomaToReexamine, blockAllowed]);

  const _onSign = useCallback(
    async () => {
      if (isLocked || !isUsable || !currentPair || !diplomaToReexamine || !tutor) {
        return;
      }
      // generate a data to sign    
      const letterInsurance = getDataToSignByWorker(diplomaToReexamine.letterNumber, new BN(diplomaToReexamine.block), blockAllowed, hexToU8a(diplomaToReexamine.referee),
        hexToU8a(diplomaToReexamine.worker), new BN(diplomaToReexamine.amount), hexToU8a(diplomaToReexamine.signOverReceipt), hexToU8a(tutor));

      const diplomaKey = keyForCid(currentPair, diplomaToReexamine.cid);
      const workerSignOverInsurance = u8aToHex(diplomaKey.sign(u8aWrapBytes(letterInsurance)));
      // TODO: storeLetterUsageRight(letter, tutor, workerSignOverInsurance);
      // create the result text

      setStudentSignatureOverDiplomaToReexamine(workerSignOverInsurance);
    },
    [currentPair, isLocked, isUsable, signer, tutor, diplomaToReexamine, blockAllowed]
  );

  const name = nameFromKeyringPair(currentPair);
  const reexamineData = diplomaToReexamine ? `+${diplomaToReexamine.cid}+${diplomaToReexamine.genesis}+${diplomaToReexamine.letterNumber}+${diplomaToReexamine.block}+${blockAllowed.toString()}+${diplomaToReexamine.referee}+${diplomaToReexamine.worker}+${diplomaToReexamine.amount}+${diplomaToReexamine.signOverPrivateData}+${diplomaToReexamine.signOverReceipt}+${studentSignatureOverDiplomaToReexamine}` : '';
  const urlDetails = `diplomas/tutor?name=${encodeURIComponent(name)}&d=${tutor}+${cid}+${studentIdentity}+${diplomaPublicKeyHex}${reexamineData}`;

  const generateQRData = () => {
    return JSON.stringify({
      q: QRAction.SKILL,
      n: name,
      d: urlDetails,
    });
  };

  const qrCodeText = generateQRData();
  const url = `${getBaseUrl()}/#/${urlDetails}`;

  const unlock = <>
    <div
      className='unlock-overlay'
      hidden={!isUsable || !isLocked || isInjected}
    >
      {isLocked && (
        <div className='unlock-overlay-warning'>
          <div className='unlock-overlay-content'>
            <div>
              <Button
                icon='unlock'
                label={t('Unlock your account before learning')}
                onClick={toggleUnlock}
              />
            </div>
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
  </>;

  const showToTutor = <>
    {tutor ?
      <StyledDiv>
        <h3>{t('Show the QR to your tutor')}</h3>
        <FlexRow>
          <Dropdown
            className={`dropdown ${className}`}
            label={t('select tutor')}
            value={tutor}
            onChange={handleTutorSelect}
            options={tutorOptions || []}
          />
          <ScanQR label={t('by QR')} type={4} />
        </FlexRow>
        <QRWithShareAndCopy
          dataQR={qrCodeText}
          titleShare={t('QR code')}
          textShare={t('Press the link to start tutoring')}
          urlShare={url}
          dataCopy={url}
        />
      </StyledDiv>
      : <h3>{t('Scan your tutor\'s QR code for help and a diploma.')}</h3>
    }
  </>;

  const toLearn = <>{isLocked ? unlock : showToTutor}</>;

  return (
    <>
      <div className='ui--row' style={{ display: 'none' }}>
        <InputAddress
          className='full'
          help={t('select the account you wish to sign data with')}
          isInput={false}
          label={t('account')}
          onChange={_onChangeAccount}
          type='account'
        />
      </div>
      {currentPair !== null && toLearn}
    </>
  );
}

const StyledDiv = styled.div`
  justify-content: center;
  align-items: center;
  .dropdown {
    max-width: 200px;
  }
`;
const FlexRow = styled.div`
  display: flex;
  justify-content: left;
  align-items: left;
  margin-top: 20px;
  .dropdown {
    margin-right: 30px;
  }
`;
export default React.memo(SkillQR);