// Copyright 2021-2022 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useEffect, useState } from 'react';
import { useApi } from '@polkadot/react-hooks';
import { KatexSpan, getCIDFromBytes, getIPFSDataFromContentID, parseJson } from '@slonigiraf/app-slonig-components';
import { useIpfsContext } from '@slonigiraf/app-slonig-components';
import { Spinner, styled } from '@polkadot/react-components';
import DiplomaCheck from './DiplomaCheck.js';

interface Props {
  className?: string;
  id: string;
  isText?: boolean;
  defaultValue?: string;
}

function ItemLabel({ className = '', id, isText = false, defaultValue = '...' }: Props): React.ReactElement<Props> {
  const { ipfs, isIpfsReady, ipfsInitError } = useIpfsContext();
  const { api } = useApi();
  const [cidString, setCidString] = useState<string>("");
  const [text, setText] = useState<string>(id);
  const [isFetched, setIsFetched] = useState(false);
  const [isSkillItem, setIsSkillItem] = useState(false);

  useEffect(() => {
    fetchLaw(id);
  }, [id]);

  useEffect(() => {
    const fetchIPFSData = async () => {
      if (!isIpfsReady || cidString.length < 2) {
        return;
      }

      try {
        const jsonText = await getIPFSDataFromContentID(ipfs, cidString);
        const json = parseJson(jsonText);
        setText(json.h);
        setIsFetched(true);
        setIsSkillItem(json.t === 3);
      } catch (error) {
        console.error(error.message);
      }
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

  const textToDisplay = isFetched ? text : defaultValue;

  return isText ?
    <KatexSpan content={textToDisplay} />
    :
    isFetched ?
      <StyledA href={`/#/knowledge?id=${id}`}>{isSkillItem && <DiplomaCheck cid={cidString}/>}<KatexSpan content={textToDisplay} /></StyledA>
      :
      <StyledSpinner><Spinner noLabel /></StyledSpinner>;
}

const StyledA = styled.a`
   font-size: 16px;
   margin-bottom: 14px;
`;
const StyledSpinner = styled.div`
  .ui--Spinner{
    width: 50px;
    margin-left: 0px;
    margin-right: 25px;
  }
`;


export default React.memo(ItemLabel);