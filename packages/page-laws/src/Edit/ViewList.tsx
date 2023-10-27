import React from 'react';
import React, { useCallback, useEffect, useState } from 'react';
import { getCIDFromBytes, getIPFSDataFromContentID } from '@slonigiraf/helpers';
import { u8aToHex } from '@polkadot/util';
import { useApi } from '@polkadot/react-hooks';
import { parseJson } from '@slonigiraf/app-slonig-components';
import { BN_ZERO } from '@polkadot/util';
import ItemLabel from './ItemLabel';
import QRCode from 'qrcode.react';
import type { KeyringPair } from '@polkadot/keyring/types';
import { useTranslation } from '../translate';
import { useIpfsContext } from '@slonigiraf/app-slonig-components';

interface Props {
  className?: string;
  id: string;
  currentPair: KeyringPair | null;
  onItemSelected: (id: string) => void;
}

function ViewList({ className = '', id, currentPair, onItemSelected }: Props): React.ReactElement<Props> {
  const { ipfs, isIpfsReady, ipfsInitError } = useIpfsContext();
  const { t } = useTranslation();
  type JsonType = { [key: string]: any } | null;
  const [list, setList] = useState<JsonType>(null);
  const [text, setText] = useState<string>("");
  const [cidString, setCidString] = useState<string>(null);
  const [lawHexData, setLawHexData] = useState('');
  const [amountList, setAmountList] = useState<BN>(BN_ZERO);
  const [previousAmount, setPreviousAmount] = useState<BN>(BN_ZERO);
  const { api } = useApi();

  async function fetchLaw(key: string) {
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

  useEffect(() => {
    fetchLaw(id);
  }, [id]);

  useEffect(() => {
    const fetchIPFSData = async () => {
      if (ipfs == null || cidString == null) {
        return;
      }
      const textValue = await getIPFSDataFromContentID(ipfs, cidString);
      setText(textValue);
      setList(parseJson(textValue));
    };

    fetchIPFSData();
  }, [cidString, ipfs]);

  const _onItemClicked = useCallback(
    (id): void => {
      onItemSelected(id);
    },
    [id, onItemSelected]
  );

  const publicKeyU8 = currentPair.publicKey;
  const publicKeyHex = u8aToHex(publicKeyU8);
  const qrText = `{"q": 0,"d": "recommendations?cid=${cidString}&person=${publicKeyHex}"}`;

  return (
    list == null ? "" :
      <>
        <h2>{list.h}</h2>
        {
          list.t !== null && list.t === 3 &&
          <>
            <h3>{t('Show the Qr to your mentor')}</h3>
            <QRCode value={qrText} />
            <h3>{t('Example exercises to train the skill')}</h3>
          </>
        }

        {list.e != null && list.e.map((item, index) => (
          <div className='ui--row' key={index}
            style={{
              alignItems: 'center'
            }}
          >
            <ItemLabel id={item} onClick={_onItemClicked} />
          </div>
        ))}

      </>
  );
};

export default React.memo(ViewList);