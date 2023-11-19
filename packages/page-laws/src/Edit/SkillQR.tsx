import React, { useState, useEffect } from 'react';
import { useTranslation } from '../translate';
import { u8aToHex } from '@polkadot/util';
import { QRWithShareAndCopy, getBaseUrl } from '@slonigiraf/app-slonig-components';
import { getAddressName } from '@polkadot/react-components';
import { getSetting, storeSetting } from '@slonigiraf/app-recommendations';
import type { KeyringPair } from '@polkadot/keyring/types';
import { Dropdown } from '@polkadot/react-components';
import { useLiveQuery } from "dexie-react-hooks";
import { db } from '@slonigiraf/app-recommendations';
import { useLocation, useNavigate } from 'react-router-dom';
import { styled } from '@polkadot/react-components';

interface Props {
  className?: string;
  cid: string;
  currentPair: KeyringPair;
}

function SkillQR({ className = '', cid, currentPair }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const mentorFromQuery = queryParams.get("mentor");
  const [mentor, setMentor] = useState<string | null>(mentorFromQuery);
  const mentors = useLiveQuery(() => db.pseudonyms.toArray(), []);

  const setQueryMentorId = (value: any) => {
    const newQueryParams = new URLSearchParams();
    newQueryParams.set("mentor", value);
    navigate({ ...location, search: newQueryParams.toString() });
  };

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
  const mentorOptions = mentors?.map(mentor => ({
    text: mentor.pseudonym,
    value: mentor.publicKey
  }));

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

  const generateQRData = () => {
    const publicKeyHex = u8aToHex(currentPair.publicKey);
    const [, , name] = getAddressName(currentPair.address, null, "");
    return JSON.stringify({
      q: 5,
      n: name,
      p: publicKeyHex,
      d: `diplomas/mentor?cid=${cid}&student=${publicKeyHex}`,
    });
  };

  const qrCodeText = generateQRData();
  const url = `${getBaseUrl()}/#/diplomas/mentor?cid=${cid}&student=${u8aToHex(currentPair.publicKey)}`;

  return (
    <>
      <h3>{t('Show the QR to your mentor')}</h3>
      <StyledDiv>
        <Dropdown
          className={`dropdown ${className}`}
          label={t('Select Mentor')}
          value={mentor}
          onChange={handleMentorSelect}
          options={mentorOptions || []}
        />
      </StyledDiv>
      <QRWithShareAndCopy
        dataQR={qrCodeText}
        titleShare={t('QR code')}
        textShare={t('Press the link to start mentoring')}
        urlShare={url}
        dataCopy={url}
      />
    </>
  );
}

const StyledDiv = styled.div`
  .dropdown {
    max-width: 300px;
  }
`;

export default React.memo(SkillQR);