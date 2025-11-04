// Copyright 2021-2022 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useCallback, useEffect, useState } from 'react';
import { Button, styled } from '@polkadot/react-components';
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
  const [dragIndex, setDragIndex] = useState<number | null>(null);

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
            id,
            cid: (await fetchLaw(id)) || ''
          }))
        );
        setItemsWithCID(items);
      }
    };
    fetchCIDs();
  }, [list]);

  const handleDelete = useCallback((index: number) => {
    const newE = [...list.e];
    newE.splice(index, 1);
    onListChange({ ...list, e: newE });
  }, [list, onListChange]);

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, index: number) => {
    setDragIndex(index);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault(); // allow drop
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>, index: number) => {
    event.preventDefault();
    if (dragIndex === null || dragIndex === index) return;

    // reorder local items
    const newItems = [...itemsWithCID];
    const [moved] = newItems.splice(dragIndex, 1);
    newItems.splice(index, 0, moved);
    setItemsWithCID(newItems);

    // update on-chain list order
    const newE = newItems.map((item) => item.id);
    onListChange({ ...list, e: newE });

    setDragIndex(null);
  };

  return (
    <>
      {itemsWithCID.map((item, index) => (
        <div
          className={`ui--row ${className}`}
          key={item.id}
          style={{ alignItems: 'center', cursor: 'grab' }}
          draggable
          onDragStart={(e) => handleDragStart(e, index)}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, index)}
        >
          <ControElements>
            <Button
              icon='times'
              onClick={() => handleDelete(index)}
            />
            <div style={{ marginBottom: '0.5rem', fontSize: '1.2rem' }}>⋮⋮</div>
            <ItemLabel item={item} isText={true} defaultValue={itemText} />
          </ControElements>



        </div>
      ))}
    </>
  );
}

const ControElements = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
`;

export default React.memo(Reordering);