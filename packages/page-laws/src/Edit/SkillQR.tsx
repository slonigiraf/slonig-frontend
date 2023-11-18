import React, { useState, useEffect } from 'react';
import { useTranslation } from '../translate';
import { u8aToHex } from '@polkadot/util';
import { QRWithShareAndCopy, getBaseUrl } from '@slonigiraf/app-slonig-components';
import { getAddressName } from '@polkadot/react-components';
import { getSetting } from '@slonigiraf/app-recommendations';
import type { KeyringPair } from '@polkadot/keyring/types';
import { Dropdown } from '@polkadot/react-components';
import { useLiveQuery } from "dexie-react-hooks";
import { db } from '@slonigiraf/app-recommendations';

interface Props {
  className?: string;
  cid: string;
  currentPair: KeyringPair;
}

function SkillQR({ className = '', cid, currentPair }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const [selectedMentorKey, setSelectedMentorKey] = useState<string | undefined>();

  // Fetch pseudonyms from the database
  const mentors = useLiveQuery(() => db.pseudonyms.toArray(), []);

  // Fetch currentMentor and set it as the default in the dropdown
  useEffect(() => {
    const fetchMentorSetting = async () => {
      const currentMentorPseudonym = await getSetting("currentMentor");
      console.log("currentMentorPseudonym: ", currentMentorPseudonym)
      if (mentors && currentMentorPseudonym) {
          setSelectedMentorKey(currentMentorPseudonym);
      }
    };

    fetchMentorSetting();
  }, [mentors]);

  // Prepare dropdown options
  const mentorOptions = mentors?.map(mentor => ({
    text: mentor.pseudonym,
    value: mentor.publicKey
  }));

  const handleMentorSelect = (selectedKey: string) => {
    setSelectedMentorKey(selectedKey);
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

  console.log("selectedMentorKey: ", selectedMentorKey)

  return (
    <>
      <h3>{t('Show the QR to your mentor')}</h3>
      <Dropdown
        label={t('Select Mentor')}
        value={selectedMentorKey}
        onChange={handleMentorSelect}
        options={mentorOptions || []}
      />
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

export default React.memo(SkillQR);