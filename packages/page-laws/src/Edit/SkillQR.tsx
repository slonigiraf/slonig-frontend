import React, { useState, useEffect } from 'react';
import { useTranslation } from '../translate';
import { u8aToHex } from '@polkadot/util';
import { QRWithShareAndCopy, ScanQR, getBaseUrl } from '@slonigiraf/app-slonig-components';
import { getAddressName } from '@polkadot/react-components';
import { getSetting, storeSetting } from '@slonigiraf/app-recommendations';
import type { KeyringPair } from '@polkadot/keyring/types';
import { Dropdown, Label } from '@polkadot/react-components';
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

      <StyledDiv>
        <h3>{t('Show the QR to your mentor')}</h3>
        <FlexRow>
          <Dropdown
            className={`dropdown ${className}`}
            label={t('Select Mentor*')}
            value={mentor}
            onChange={handleMentorSelect}
            options={mentorOptions || []}
          />
          <ScanQR label={t('by QR')} type={4}/>
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