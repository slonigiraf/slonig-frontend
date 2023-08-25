// Copyright 2021-2022 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useCallback } from 'react';
import { Button, Input } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';
import { parseJson } from '../util';

interface Props {
  className?: string;
  list: any;
  item: any;
  isAddingItem: boolean;
  onListChange: (updatedList: any) => void;
  onItemChange: (updatedItem: any) => void;
  onIsAddingItemChange: (state: boolean) => void;
}

function Editor_0({ className = '', list, item, isAddingItem, onListChange, onItemChange, onIsAddingItemChange }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();

  const jsonTemplate = parseJson("{\"t\":\"0\",\"h\":\"\"}");
  
  const _onClickAddItem = useCallback(
    (): void => {
      onItemChange(parseJson(jsonTemplate));
      onIsAddingItemChange(true);
    },
    [onIsAddingItemChange]
  );

  const _onEditItemTitle = useCallback(
    (header: string) => {
      const copiedNewElement = { ...item };
      copiedNewElement.h = header;
      onItemChange(copiedNewElement);
    },
    [item, onItemChange]
  );

  const _onEditListTitle = useCallback(
    (title: string) => {
      const copiedList = { ...list };
      copiedList.h = title;
      onListChange(copiedList);
    },
    [list]
  );

  const itemEditor = isAddingItem? 
    <Input
      autoFocus
      className='full'
      help={t('Title of item')}
      label={t('title of item')}
      onChange={_onEditItemTitle}
      value={item == null? "" : item.h}
    />
  : 
  <Button
    icon='add'
    label={t('Add list item')}
    onClick={_onClickAddItem}
  />;

  const dataEditor = (list == null) ? "" : (
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
      <div className='ui--row'>
        {itemEditor}
      </div>
      
    </>
  );

  return dataEditor;
}

export default React.memo(Editor_0);
