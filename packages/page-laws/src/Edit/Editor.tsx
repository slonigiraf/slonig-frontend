import React, { useCallback } from 'react';
import { Button, Dropdown, Input, styled } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';
import { randomIdHex } from '../util.js';
import { parseJson, useInfo } from '@slonigiraf/app-slonig-components';
import Reordering from './Reordering.js';
import type { LawType } from '../types.js';
import ExerciseEditorList from './ExerciseEditorList.js';
import { useApi } from '@polkadot/react-hooks';

interface Props {
  className?: string;
  list: any;
  item: any;
  isAddingLink: boolean;
  isAddingItem: boolean;
  onListChange: (updatedList: any) => void;
  onItemChange: (updatedItem: any) => void;
  onItemIdHexChange: (updatedItemIdHex: any) => void;
  onIsAddingItemChange: (state: boolean) => void;
  onIsAddingLinkChange: (state: boolean) => void;
}

function Editor(props: Props): React.ReactElement<Props> {
  const { list, item, isAddingLink, isAddingItem, onListChange, onItemChange, onItemIdHexChange, onIsAddingItemChange, onIsAddingLinkChange } = props;
  const { t } = useTranslation();
  const { showInfo } = useInfo();
  const { api } = useApi();

  const parentToItemDefaultType = {
    0: 0,
    1: 2,
    2: 3,
  };

  const getDefaultItemLawType = useCallback(() => parentToItemDefaultType[list?.t] || 0, [list]);

  const editItemTitle = useCallback((title: string) => {
    onItemChange({
      ...item,
      h: title,
      t: item?.t || getDefaultItemLawType()
    });
  }, [item, onItemChange]);

  const editItemLink = useCallback((url: string) => {
    const namePattern = /[?&]id=([^&#]*)/;
    const match = url.match(namePattern);
    const idFromUrl = match ? match[1] : null;
    
    const checkAndUpdateList = async () => {
      if (idFromUrl && idFromUrl.length == 66) {
        const existingIds = list.e || [];
        if (!existingIds.includes(idFromUrl)) {
          const law = await api.query.laws.laws(idFromUrl);
          if (law.isSome) {
            const updatedList = {
              ...list,
              e: [...existingIds, idFromUrl]
            };
            showInfo(t('Added'));
            onListChange(updatedList);
          } else {
            showInfo(t('The link misses a known ID'), 'error');
          }
        } else {
          showInfo(t('Duplicate'), 'error');
        }
      } else {
        showInfo(t('The link misses a known ID'), 'error');
      }
    };
  
    checkAndUpdateList();
  }, [list, onListChange]);

  const selectLawType = useCallback((newLawType: LawType) => {
    if (!item || newLawType !== item.t) {
      onItemChange({
        ...item,
        t: newLawType
      });
    }
  }, [item, onItemChange]);

  const editListTitle = useCallback((title: string) => {
    onListChange({ ...list, h: title });
  }, [list, onListChange]);

  const baseOptions = {
    0: [
      { text: t('List'), value: 0 },
      { text: t('Course'), value: 1 },
    ],
    1: [{ text: t('Module'), value: 2 }],
    2: [{ text: t('Skill'), value: 3 }],
  };

  const lawTypeOpt = baseOptions[list?.t] || [];

  const addItem = useCallback(() => {
    if (isAddingItem || isAddingLink) {
      return;
    }
    if (list?.t === 3) { // Adding an exercise
      const itemJSONTemplate = `{"h":"", "a":""}`;
      const itemJson = parseJson(itemJSONTemplate);
      const updatedList = {
        ...list,
        q: [...(list.q || []), itemJson]
      };
      onListChange(updatedList);
    } else if (list?.t === 2) { // Adding a skill
      const newItemIdHex = randomIdHex();
      onItemIdHexChange(newItemIdHex);
      const itemType = getDefaultItemLawType();
      const itemJSONTemplate = `{"i":"${newItemIdHex}","t":${itemType},"h":"","q":[{"h":"", "a":""},{"h":"", "a":""}]}`;
      onItemChange(parseJson(itemJSONTemplate));
      const updatedList = {
        ...list,
        e: [...(list.e || []), newItemIdHex]
      };
      onListChange(updatedList);
      onIsAddingItemChange(true);
    } else { // Adding a general item
      const newItemIdHex = randomIdHex();
      onItemIdHexChange(newItemIdHex);
      const itemType = getDefaultItemLawType();
      const itemJSONTemplate = `{"i":"${newItemIdHex}","t":${itemType},"h":""}`;
      onItemChange(parseJson(itemJSONTemplate));
      const updatedList = {
        ...list,
        e: [...(list.e || []), newItemIdHex]
      };
      onListChange(updatedList);
      onIsAddingItemChange(true);
    }
  }, [list, onItemChange, onIsAddingItemChange, lawTypeOpt]);

  const linkItem = useCallback(() => {
    if (isAddingItem || isAddingLink) {
      return;
    }
    onIsAddingLinkChange(true);
  }, [onIsAddingLinkChange]);

  const itemType = (item !== null) ? item.t : getDefaultItemLawType();

  const itemText = (item && item.h) ? item.h : '...';

  return (
    <>
      {list && (
        <>
          <div className='ui--row'>
            <TitleContainer>
              <Input
                autoFocus
                className='full'
                label={t('title')}
                onChange={editListTitle}
                value={list.h}
              />
            </TitleContainer>
          </div>
          <Reordering list={list} onListChange={onListChange} itemText={itemText} />
        </>
      )}
      {isAddingLink && (
        <>
          <div className='ui--row'>
            <Input
              autoFocus
              className='full'
              label={t('link to the item')}
              onChange={editItemLink}
              value={item?.i || ""}
            />
          </div>
        </>
      )}
      {isAddingItem && (
        <>
          <div className='ui--row'>
            <Dropdown
              label={t('type of item')}
              value={itemType}
              onChange={selectLawType}
              options={lawTypeOpt}
            />
          </div>
          <div className='ui--row'>
            <Input
              autoFocus
              className='full'
              label={t('title of item')}
              onChange={editItemTitle}
              value={item?.h || ""}
            />
          </div>
        </>
      )}
      {/* For adding new exercises at skill view */}
      <ExerciseEditorList list={item} onListChange={onItemChange} className='exercise-editor' />
      {/* For adding new skills at module view */}
      <ExerciseEditorList list={list} onListChange={onListChange} className='exercise-editor' />
      {!isAddingItem && !isAddingLink && (<div className='ui--row'>
        <Button
          icon='add'
          label={t('Add new')}
          onClick={addItem}
        />
        <Button
          icon='link'
          label={t('Add existing')}
          onClick={linkItem}
        />
      </div>)}
    </>
  );
}
const TitleContainer = styled.div`
  width: 100%;
  .ui--Labelled {
    padding-left: 0px !important;
  }
  label {
    left: 20px !important;
  }
`;
export default React.memo(Editor);