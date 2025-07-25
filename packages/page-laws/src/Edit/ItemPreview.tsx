import React, { useEffect, useState } from 'react';
import { StyledSpinnerContainer, getIPFSDataFromContentID, parseJson, loadFromSessionStorage, useIpfsContext } from '@slonigiraf/app-slonig-components';
import ExerciseList from './ExerciseList.js';
import { Spinner } from '@polkadot/react-components';
import { ItemWithCID } from '../types.js';
import { sessionPrefix } from '../constants.js';

type JsonType = { [key: string]: any } | null;
interface Props {
  className?: string;
  item: ItemWithCID;
}

function ItemPreview({ className = '', item }: Props): React.ReactElement<Props> {
  const { ipfs, isIpfsReady } = useIpfsContext();
  const [list, setList] = useState<JsonType>(loadFromSessionStorage(sessionPrefix, 'list'));

  console.log("list: ", list)

  useEffect(() => {
    const fetchIPFSData = async () => {
      if (!isIpfsReady || !item.cid) {
        return;
      }
      const textValue = await getIPFSDataFromContentID(ipfs, item.cid);
      const fetchedList = parseJson(textValue);
      setList(fetchedList);
    };
    fetchIPFSData();
  }, [item, ipfs]);

  return (list == null || !list.q) ? <StyledSpinnerContainer><Spinner noLabel /></StyledSpinnerContainer> : (
    <div>
      <h2>{list.h}</h2>
      <ExerciseList exercises={list.q} />
    </div>
  );
}

export default React.memo(ItemPreview);