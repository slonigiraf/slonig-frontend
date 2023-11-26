// Copyright 2021-2022 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useEffect, useState, useCallback } from 'react';
import { IconLink, Label } from '@polkadot/react-components';
import { useApi } from '@polkadot/react-hooks';
import { getCIDFromBytes, getIPFSDataFromContentID, parseJson } from '@slonigiraf/app-slonig-components';
import { useIpfsContext } from '@slonigiraf/app-slonig-components';

interface Props {
  className?: string;
  id: string;
  onClick: (id: string) => void;
}

function ItemLabel({ className = '', id, onClick }: Props): React.ReactElement<Props> {
  const { ipfs, isIpfsReady, ipfsInitError } = useIpfsContext();
  const { api } = useApi();
  const [cidString, setCidString] = useState<string>("");
  const [text, setText] = useState<string>(id);

  useEffect(() => {
    fetchLaw(id);
  }, [id]);

  useEffect(() => {
    const fetchIPFSData = async () => {
      if (!isIpfsReady || cidString.length < 2) {
        return;
      }
      const jsonText = await getIPFSDataFromContentID(ipfs, cidString);
      const json = parseJson(jsonText);
      setText(json.h);
    };
    fetchIPFSData();
  }, [cidString, ipfs]);

  async function fetchLaw(key: string) {
    const law = await api.query.laws.laws(key);
    if (law.isSome) {
      const tuple = law.unwrap();
      const byteArray = tuple[0]; // This should give you the [u8; 32]
      const bigIntValue = tuple[1]; // This should give you the u128
      const cid = await getCIDFromBytes(byteArray);
      setCidString(cid);
    }
  }

  const _onClick = useCallback(
    (): void => {
      onClick(id);
    },
    [id, onClick]
  );

  return typeof onClick === 'function' ?
    <IconLink label={text} onClick={_onClick}/> : <Label label={text} />;
}

export default React.memo(ItemLabel);