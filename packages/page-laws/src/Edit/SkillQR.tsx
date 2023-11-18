import React, { useState, useEffect } from 'react';
import { useTranslation } from '../translate';
import { u8aToHex } from '@polkadot/util';
import { QRWithShareAndCopy, getBaseUrl } from '@slonigiraf/app-slonig-components';
import { getAddressName } from '@polkadot/react-components';
import { getSetting } from '@slonigiraf/app-recommendations';
import type { KeyringPair } from '@polkadot/keyring/types';

interface Props {
  className?: string;
  cid: string;
  currentPair: KeyringPair;
}

function SkillQR({ className = '', cid, currentPair }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const [mentor, setMentor] = useState<string | undefined>();

  useEffect(() => {
    const fetchMentorSetting = async () => {
      const mentorSetting = await getSetting("currentMentor");
      setMentor(mentorSetting);
    };
    fetchMentorSetting();
  }, []);

  if (mentor === undefined) {
    return <h3>{t('Scan a QR of your mentor to get a diploma')}</h3>;
  }

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