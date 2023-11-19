import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../translate';
import { QRWithShareAndCopy, ScanQR, getBaseUrl } from '@slonigiraf/app-slonig-components';
import { getAddressName } from '@polkadot/react-components';
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
import { storeLetterUsageRight } from '../utils.js';
import { getDataToSignByWorker } from '@slonigiraf/helpers';
import type { Signer } from '@polkadot/api/types';
import BN from 'bn.js';

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

function SkillQR({ className = '', cid }: Props): React.ReactElement<Props> {
  // Using key
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
  const mentorFromQuery = queryParams.get("mentor");
  const [mentor, setMentor] = useState<string | null>(mentorFromQuery);
  const mentors = useLiveQuery(() => db.pseudonyms.toArray(), []);
  const [diplomaToReexamine, setDiplomaToReexamine] = useState<Letter | null>(null);
  const [studentSignatureOverDiplomaToReexamine, setStudentSignatureOverDiplomaToReexamine] = useState<string>("");

  const setQueryMentorId = (value: any) => {
    const newQueryParams = new URLSearchParams();
    newQueryParams.set("mentor", value);
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

  // Fetch currentMentor and set it as the default in the dropdown
  useEffect(() => {
    const fetchMentorSetting = async () => {
      if (mentorFromQuery) {
        await storeSetting("currentMentor", mentorFromQuery);
        setMentor(mentorFromQuery);
      } else {
        const mentorFromSettings = await getSetting("currentMentor");
        if (mentors && mentorFromSettings) {
          setMentor(mentorFromSettings);
        }
      }
    };
    fetchMentorSetting();
  }, [mentors, mentorFromQuery]);

  // Prepare dropdown options
  let mentorOptions = mentors?.map(mentor => ({
    text: mentor.pseudonym,
    value: mentor.publicKey
  }));

  // Check if 'mentor' is not null and not in 'mentorOptions'
  if (mentor && mentorOptions && !mentorOptions.some(option => option.value === mentor)) {
    // Add 'From web-link' as the first option
    mentorOptions = [{ text: t('From web-link'), value: mentor }, ...mentorOptions];
  }

  const handleMentorSelect = async (selectedKey: string) => {
    setMentor(selectedKey);
    if (selectedKey) {
      try {
        await db.settings.put({ id: "currentMentor", value: selectedKey });
      } catch (error) {
        console.error('Error saving mentor selection:', error);
      }
      setQueryMentorId(selectedKey);
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
  }, [mentor, diplomaToReexamine]);

  const reexamineData = diplomaToReexamine ? `&cidR=${diplomaToReexamine.cid}&genesisR=${diplomaToReexamine.genesis}&nonceR=${diplomaToReexamine.letterNumber}&blockR=${diplomaToReexamine.block}&mentorR=${diplomaToReexamine.referee}&studentR=${diplomaToReexamine.worker}&amountR=${diplomaToReexamine.amount}&mentorSignR=${diplomaToReexamine.signOverPrivateData}&studentSignR=${studentSignatureOverDiplomaToReexamine}` : '';
  const urlDetails = `diplomas/mentor?cid=${cid}&student=${publicKeyHex}${reexamineData}`;

  const generateQRData = () => {
    const [, , name] = getAddressName(currentPair.address, null, "");
    return JSON.stringify({
      q: 5,
      n: name,
      p: publicKeyHex,
      d: urlDetails,
    });
  };

  const qrCodeText = generateQRData();
  const url = `${getBaseUrl()}/#/${urlDetails}`;

  const _onSign = useCallback(
    async () => {
      if (isLocked || !isUsable || !currentPair || !diplomaToReexamine || !mentor) {
        return;
      }

      // generate a data to sign      
      const letterInsurance = getDataToSignByWorker(diplomaToReexamine.letterNumber, new BN(diplomaToReexamine.block), hexToU8a(diplomaToReexamine.referee),
        hexToU8a(diplomaToReexamine.worker), new BN(diplomaToReexamine.amount), hexToU8a(diplomaToReexamine.signOverReceipt), hexToU8a(mentor));
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
      // storeLetterUsageRight(letter, mentor, workerSignOverInsurance);
      // create the result text

      setStudentSignatureOverDiplomaToReexamine(workerSignOverInsurance);
    },
    [currentPair, isLocked, isUsable, signer, mentor, diplomaToReexamine]
  );

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
      <StyledDiv>
        <h3>{t('Show the QR to your mentor')}</h3>
        <FlexRow>
          <Dropdown
            className={`dropdown ${className}`}
            label={t('select mentor')}
            value={mentor}
            onChange={handleMentorSelect}
            options={mentorOptions || []}
          />
          <ScanQR label={t('by QR')} type={4} />
        </FlexRow>
        <QRWithShareAndCopy
          dataQR={qrCodeText}
          titleShare={t('QR code')}
          textShare={t('Press the link to start mentoring')}
          urlShare={url}
          dataCopy={url}
        />
      </StyledDiv>

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
  margin-top: 20px; // Adjust as needed

  // Add margin to either the dropdown or ScanQR if needed
  .dropdown {
    margin-right: 30px;
  }
`;
export default React.memo(SkillQR);