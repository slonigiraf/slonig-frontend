import React from 'react';
import React, { useCallback, useEffect, useState } from 'react';
import { IPFS } from 'ipfs-core';
import { getIPFSContentID, digestFromCIDv1, getCIDFromBytes, getIPFSDataFromContentID } from '@slonigiraf/helpers';
import { isFunction, u8aToHex, hexToU8a, u8aWrapBytes } from '@polkadot/util';
import { useApi } from '@polkadot/react-hooks';
import { parseJson } from '../util';
import { BN_ZERO } from '@polkadot/util';
import ItemLabel from './ItemLabel';

interface Props {
  className?: string;
  ipfs: IPFS;
  id: string;
  onItemSelected: (id: string) => void;
}

function ViewList({ className = '', ipfs, id, onItemSelected }: Props): React.ReactElement<Props> {
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

  return (
    list == null ? "" :
      <>
        <h2>{list.h}</h2>
        {list.e != null && list.e.map((item, index) => (
          <div className='ui--row' key={index}
            style={{
              alignItems: 'center'
            }}
          >
            <ItemLabel ipfs={ipfs} id={item} onClick={_onItemClicked}/>
          </div>
        ))}

      </>
  );
};

export default React.memo(ViewList);