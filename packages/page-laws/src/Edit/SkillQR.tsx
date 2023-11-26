import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../translate';
import { QRWithShareAndCopy, ScanQR, getBaseUrl, nameFromKeyringPair } from '@slonigiraf/app-slonig-components';
import { getSetting, storeSetting } from '@slonigiraf/app-recommendations';
import type { KeyringPair } from '@polkadot/keyring/types';
import { Dropdown, InputAddress } from '@polkadot/react-components';
import { useLiveQuery } from "dexie-react-hooks";
import { db, Letter } from '@slonigiraf/app-recommendations';
import { useLocation, useNavigate } from 'react-router-dom';
import { styled } from '@polkadot/react-components';
import { keyring } from '@polkadot/ui-keyring';
import { web3FromSource } from '@polkadot/extension-dapp';
import { isFunction, u8aToHex, hexToU8a, u8aWrapBytes } from '@polkadot/util';
import { useToggle } from '@polkadot/react-hooks';
import { getDataToSignByWorker } from '@slonigiraf/helpers';
import type { Signer } from '@polkadot/api/types';
import BN from 'bn.js';
import { BN_ONE } from '@polkadot/util';
import { useApi, useCall } from '@polkadot/react-hooks';
import type { BlockNumber } from '@polkadot/types/interfaces';
import { useBlockTime } from '@polkadot/react-hooks';

interface Props {
  className?: string;
  cid: string;
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

const calculateFutureBlock = (block: string, blockTimeMs: number, msToAdd: number): BN => {
  const currentBlock = new BN(block);
  const blocksToAdd = new BN(msToAdd).div(new BN(blockTimeMs));
  const blockAllowed = currentBlock.add(blocksToAdd);
  return blockAllowed;
}

function SkillQR({ className = '', cid }: Props): React.ReactElement<Props> {
  // Using key
  const { api, isApiReady } = useApi();
  const useFinalizedBlocks = false;
  //TODO: test how does it work if block number > u32 (BlockNumber seems to be u32)
  const bestNumber = useCall<BlockNumber>(isApiReady && (useFinalizedBlocks ? api.derive.chain.bestNumberFinalized : api.derive.chain.bestNumber));
  const currentBlock = bestNumber?.toString() || "0";
  const [blockTimeMs,] = useBlockTime(BN_ONE, api);
  //Allow only for 30 mins
  const blockAllowed: BN = calculateFutureBlock(currentBlock, blockTimeMs, 1800000);

  const [currentPair, setCurrentPair] = useState<KeyringPair | null>(() => keyring.getPairs()[0] || null);
  const [{ isInjected }, setAccountState] = useState<AccountState>({ isExternal: false, isHardware: false, isInjected: false });
  const [isLocked, setIsLocked] = useState(false);
  const [{ isUsable, signer }, setSigner] = useState<SignerState>({ isUsable: true, signer: null });
  const [signature, setSignature] = useState('');
  const [isUnlockVisible, toggleUnlock] = useToggle();
  //Rest params
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

  // Initialize key
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

  const publicKeyHex = u8aToHex(currentPair.publicKey);
  useEffect(() => {
    const fetchRandomDiploma = async () => {
      const allDiplomas = await db.letters.toArray();
      if (allDiplomas.length > 0) {
        const randomIndex = Math.floor(Math.random() * allDiplomas.length);
        setDiplomaToReexamine(allDiplomas[randomIndex]);
      }
    };
    fetchRandomDiploma();
  }, []);

  useEffect(() => {
    const showQR = async () => {
      _onSign();
    };
    showQR();
  }, [tutor, diplomaToReexamine]);



  const _onSign = useCallback(
    async () => {
      if (isLocked || !isUsable || !currentPair || !diplomaToReexamine || !tutor) {
        return;
      }

      // generate a data to sign    

      const letterInsurance = getDataToSignByWorker(diplomaToReexamine.letterNumber, new BN(diplomaToReexamine.block), blockAllowed, hexToU8a(diplomaToReexamine.referee),
      hexToU8a(diplomaToReexamine.worker), new BN(diplomaToReexamine.amount), hexToU8a(diplomaToReexamine.signOverReceipt), hexToU8a(tutor));
       
      let workerSignOverInsurance = "";
      // sign
      if (signer && isFunction(signer.signRaw)) {// Use browser extenstion 
        const u8WorkerSignOverInsurance = await signer.signRaw({
          address: currentPair.address,
          data: u8aToHex(letterInsurance),
          type: 'bytes'
        });
        workerSignOverInsurance = u8WorkerSignOverInsurance.signature;
      } else {// Use locally stored account to sign
        workerSignOverInsurance = u8aToHex(currentPair.sign(u8aWrapBytes(letterInsurance)));
      }
      // TODO: storeLetterUsageRight(letter, tutor, workerSignOverInsurance);
      // create the result text

      setStudentSignatureOverDiplomaToReexamine(workerSignOverInsurance);
    },
    [currentPair, isLocked, isUsable, signer, tutor, diplomaToReexamine, currentBlock]
  );

  const reexamineData = diplomaToReexamine ? `+${diplomaToReexamine.cid}+${diplomaToReexamine.genesis}+${diplomaToReexamine.letterNumber}+${diplomaToReexamine.block}+${blockAllowed.toString()}+${diplomaToReexamine.referee}+${diplomaToReexamine.worker}+${diplomaToReexamine.amount}+${diplomaToReexamine.signOverPrivateData}+${diplomaToReexamine.signOverReceipt}+${studentSignatureOverDiplomaToReexamine}` : '';
  const urlDetails = `diplomas/tutor?d=${tutor}+${cid}+${publicKeyHex}+${publicKeyHex}${reexamineData}`;

  const generateQRData = () => {
    const name = nameFromKeyringPair(currentPair);
    return JSON.stringify({
      q: 5,
      n: name,
      d: urlDetails,
    });
  };

  const qrCodeText = generateQRData();
  const url = `${getBaseUrl()}/#/${urlDetails}`;

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