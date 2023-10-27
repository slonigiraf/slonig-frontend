// Copyright 2021-2022 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useCallback, useState, useRef } from 'react';
import { Button, Dropdown, Input } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';
import { parseJson, randomIdHex } from '../util';
import Reordering from './Reordering';
import type { LawType } from '../types.js';
import { useIpfsContext } from '@slonigiraf/app-slonig-components';

interface Props {
  className?: string;
  list: any;
  item: any;
  itemIdHex: string;
  isAddingItem: boolean;
  onListChange: (updatedList: any) => void;
  onItemChange: (updatedItem: any) => void;
  onItemIdHexChange: (updatedItemIdHex: any) => void;
  onIsAddingItemChange: (state: boolean) => void;
}

function Editor({ className = '', list, item, isAddingItem, onListChange, onItemChange, onItemIdHexChange, onIsAddingItemChange }: Props): React.ReactElement<Props> {
  const { ipfs, isIpfsReady, ipfsInitError } = useIpfsContext();
  const { t } = useTranslation();

  const _onClickAddItem = useCallback(
    (): void => {
      const newItemIdHex = randomIdHex();
      onItemIdHexChange(newItemIdHex);
      const itemJSONTemplate = `{"i":"${newItemIdHex}","t":0,"h":""}`;
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

  const parentToItemDefaultType: any = {
    0: 1,
    1: 2,
    2: 3,
    3: 4,
  };
  const getDefaultItemLawType = useCallback(() => {
    if (list != null) {
      return parentToItemDefaultType[list.t];
    } else {
      return 0
    }
  }, [list, onListChange]);

  const _onEditItemTitle = useCallback(
    (title: string) => {
      const copiedItem = { ...item };
      copiedItem.h = title;
      copiedItem.t = item?.t || getDefaultItemLawType();
      onItemChange(copiedItem);
    },
    [item, onItemChange]
  );

  const _selectLawType = useCallback(
    (newLawType: LawType): void => {
      if (item == null && newLawType != getDefaultItemLawType()
        || item != null && newLawType !== item.t
      ) {
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

  const baseOptions: any = {
    0: useRef((
      [
        { text: t('List'), value: 0 },
        { text: t('Course'), value: 1 },
      ]
    )),
    1: useRef((
      [
        { text: t('Module'), value: 2 },
      ]
    )),
    2: useRef((
      [
        { text: t('Skill'), value: 3 },
      ]
    )),
    3: useRef((
      [
        { text: t('Exercise'), value: 4 },
      ]
    )),
  };

  const getLawTypeOpt = useCallback(() => {
    if (list != null) {
      return baseOptions[list.t];
    } else {
      return []
    }
  }, [list, onListChange]);



  const lawTypeOpt = getLawTypeOpt();

  console.log("lawTypeOpt: " + lawTypeOpt)


  if (item != null) {
    console.log("item is not null")
    console.log("item.t: " + item.t)
    console.log("typeof(item.t): " + typeof (item.t))
  } else {
    console.log("item is null")
  }


  const itemEditor = isAddingItem ?
    <>
      <div className='ui--row'>
        <Dropdown
          label={t('type of item')}
          value={item?.t || getDefaultItemLawType()}
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
    <>
      {list != null && list.t != 4 &&
        <div className='ui--row'>
          <Button
            icon='add'
            label={t('Add list item')}
            onClick={_onClickAddItem}
          />
        </div>
      }
    </>;


  const reordering = (list == null | list.e == null) ? "" : (
    <Reordering list={list} onListChange={onListChange} />
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
