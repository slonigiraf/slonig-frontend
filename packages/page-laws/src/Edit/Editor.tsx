// Copyright 2021-2022 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useCallback, useState, useRef } from 'react';
import { Button, Dropdown, Input } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';
import { parseJson, randomIdHex } from '../util';
import Reordering from './Reordering';
import { IPFS } from 'ipfs-core';
import type { LawType } from '../types.js';


interface Props {
  className?: string;
  ipfs: IPFS;
  list: any;
  item: any;
  itemIdHex: string;
  isAddingItem: boolean;
  onListChange: (updatedList: any) => void;
  onItemChange: (updatedItem: any) => void;
  onItemIdHexChange: (updatedItemIdHex: any) => void;
  onIsAddingItemChange: (state: boolean) => void;
}

function Editor({ className = '', ipfs, list, item, isAddingItem, onListChange, onItemChange, onItemIdHexChange, onIsAddingItemChange }: Props): React.ReactElement<Props> {
  console.log("Editor load");
  const { t } = useTranslation();
  const defaultLawType: LawType = 0
  
  const _onClickAddItem = useCallback(
    (): void => {
      const newItemIdHex = randomIdHex();
      onItemIdHexChange(newItemIdHex);
      const itemJSONTemplate = `{"i":"${newItemIdHex}","t":"0","h":""}`;
      onItemChange(parseJson(itemJSONTemplate));

      const updatedList = { ...list };
      if (!Array.isArray(updatedList.e)) {
        updatedList.e = []; // initialize it if it's not an array or doesn't exist
      }
      updatedList.e.push(newItemIdHex);

      onListChange(updatedList);
      onIsAddingItemChange(true);
    },
    [list, onItemChange, onIsAddingItemChange]
  );


  const _onEditItemTitle = useCallback(
    (title: string) => {
      const copiedItem = { ...item };
      copiedItem.h = title;
      copiedItem.t = item?.t || defaultLawType;
      onItemChange(copiedItem);
    },
    [item, onItemChange]
  );

  const _selectLawType = useCallback(
    (newLawType: LawType): void => {
      if(item == null && newLawType != defaultLawType
        || item != null && newLawType !== item.t
        ){
        const copiedItem = { ...item };
        copiedItem.t = newLawType;
        onItemChange(copiedItem);
      }
    },
    [item, onItemChange]
  );

  const _onEditListTitle = useCallback(
    (title: string) => {
      const copiedList = { ...list };
      copiedList.h = title;
      onListChange(copiedList);
    },
    [list, onListChange]
  );

  const lawTypeOpt = useRef((
    [
      { text: t('List'), value: 0 },
      { text: t('Course'), value: 1 },
      { text: t('Module'), value: 2 },
      { text: t('Skill'), value: 3 },
      { text: t('Exercise'), value: 4 },
    ]
  ));

  

  const itemEditor = isAddingItem ?
    <>
      <div className='ui--row'>
      <Dropdown
        label={t('type of item')}
        value={item?.t || defaultLawType}
        onChange={_selectLawType}
        options={lawTypeOpt.current}
      />
      </div>
      <div className='ui--row'>
        <Input
          autoFocus
          className='full'
          help={t('Title of item')}
          label={t('title of item')}
          onChange={_onEditItemTitle}
          value={item?.h || ""}
        />
      </div>
    </>
    :
  <div className='ui--row'>
    <Button
      icon='add'
      label={t('Add list item')}
      onClick={_onClickAddItem}
    />
  </div>;

  const reordering = (list == null | list.e == null) ? "" : (
    <Reordering ipfs={ipfs} list={list} onListChange={onListChange} />
  );

  const listEditor = (list == null) ? "" : (
    <>
      <div className='ui--row'>
        <Input
          autoFocus
          className='full'
          help={t('Title')}
          label={t('title')}
          onChange={_onEditListTitle}
          value={list.h}
        />
      </div>
      {reordering}

      {itemEditor}


    </>
  );

  return listEditor;
}

export default React.memo(Editor);
