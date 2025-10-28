// Copyright 2021-2022 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@polkadot/react-components';
import ItemLabel from './ItemLabel.js';
import { getCIDFromBytes } from '@slonigiraf/slonig-components';
import { ItemWithCID } from '../types.js';
import { useApi } from '@polkadot/react-hooks';
import BN from 'bn.js';

interface Props {
  className?: string;
  list: any;
  onListChange: (updatedList: any) => void;
  itemText: string;
}

function Reordering({ className = '', list, onListChange, itemText }: Props): React.ReactElement<Props> {
  const { api } = useApi();
  const [itemsWithCID, setItemsWithCID] = useState<ItemWithCID[]>([]);

  async function fetchLaw(key: string) {
    const law = (await api.query.laws.laws(key)) as { isSome: boolean; unwrap: () => [Uint8Array, BN] };
    if (law.isSome) {
      const tuple = law.unwrap();
      const byteArray = tuple[0];
      const cid = await getCIDFromBytes(byteArray);
      return cid;
    }
    return '';
  }

  useEffect(() => {
    const fetchCIDs = async () => {
      if (list?.e) {
        const items = await Promise.all(
          list.e.map(async (id: string) => ({
            id: id,
            cid: await fetchLaw(id) || ''
          }))
        );
        setItemsWithCID(items);
      }
    };
    fetchCIDs();
  }, [list]);


  const handleMoveUp = useCallback((index: number) => {
    if (index === 0) return; // Already at the top
    const newList = [...list.e];
    const temp = newList[index];
    newList[index] = newList[index - 1];
    newList[index - 1] = temp;
    onListChange({ ...list, e: newList });
  }, [list, onListChange]);

  const handleMoveDown = useCallback((index: number) => {
    if (index === list.e.length - 1) return; // Already at the bottom
    const newList = [...list.e];
    const temp = newList[index];
    newList[index] = newList[index + 1];
    newList[index + 1] = temp;
    onListChange({ ...list, e: newList });
  }, [list, onListChange]);

  const handleDelete = useCallback((index: number) => {
    const newList = [...list.e];
    newList.splice(index, 1);
    onListChange({ ...list, e: newList });
  }, [list, onListChange]);

  return (
    <>
      {itemsWithCID.map((item, index) => (
        <div className='ui--row' key={index}
          style={{
            alignItems: 'center'
          }}
        >
          <Button
            icon='arrow-up'
            isDisabled={index === 0}
            onClick={() => handleMoveUp(index)}
          />
          <Button
            icon='arrow-down'
            isDisabled={index === list.e.length - 1}
            onClick={() => handleMoveDown(index)}
          />
          <Button
            icon='times'  // Assuming 'times' is the icon for delete
            onClick={() => handleDelete(index)}
          />
          <ItemLabel key={item.id} item={item} isText={true} defaultValue={itemText} />
        </div>
      ))}
    </>
  );
}

export default React.memo(Reordering);
