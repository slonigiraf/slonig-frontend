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

function Editor(props: Props): React.ReactElement<Props> {
  const { list, item, isAddingItem, onListChange, onItemChange, onItemIdHexChange, onIsAddingItemChange } = props;
  const { t } = useTranslation();

  const parentToItemDefaultType = {
    0: 1,
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
    console.log("list?.t: " + list?.t);
    if (list?.t === 3) { // Adding an exercise
      const itemJSONTemplate = `{"h":"", "a":""}`;
      const itemJson = parseJson(itemJSONTemplate);
      const updatedList = {
        ...list,
        q: [...(list.q || []), itemJson]
      };
      onListChange(updatedList);
    } else { // Adding a general item
      const newItemIdHex = randomIdHex();
      onItemIdHexChange(newItemIdHex);
      const itemJSONTemplate = `{"i":"${newItemIdHex}","t":0,"h":""}`;
      onItemChange(parseJson(itemJSONTemplate));

      const updatedList = {
        ...list,
        e: [...(list.e || []), newItemIdHex]
      };

      onListChange(updatedList);
      onIsAddingItemChange(true);
    }
  }, [list, onItemChange, onIsAddingItemChange, lawTypeOpt]);

  const renderExerciseEditor = (exercise: { h: string; a: string }, index: number) => {
    const onEditHeader = (newHeader: string) => {
      const updatedExercises = [...(list.q || [])];
      updatedExercises[index].h = newHeader;
      onListChange({ ...list, q: updatedExercises });  // change 'e' to 'q'
    };

    const onEditAnswer = (newAnswer: string) => {
      const updatedExercises = [...(list.q || [])];
      updatedExercises[index].a = newAnswer;
      onListChange({ ...list, q: updatedExercises });  // change 'e' to 'q'
    };

    return (
      <div key={index} className="exercise-editor">
        <Input
          autoFocus
          className='full'
          help={t('Exercise Header')}
          label={t('Header')}
          onChange={onEditHeader}
          value={exercise.h}
        />
        <Input
          className='full'
          help={t('Exercise Answer')}
          label={t('Answer')}
          onChange={onEditAnswer}
          value={exercise.a}
        />
      </div>
    );
  };


  const exerciseEditors = list?.t === 3 && list.q
    ? list.q.map((exercise, index) => renderExerciseEditor(exercise, index))
    : null;

  return (
    <>
      {list && (
        <>
          <div className='ui--row'>
            <Input
              autoFocus
              className='full'
              help={t('Title')}
              label={t('title')}
              onChange={editListTitle}
              value={list.h}
            />
          </div>



          <Reordering list={list} onListChange={onListChange} />
        </>
      )}
      {isAddingItem && (
        <>
          <div className='ui--row'>
            <Dropdown
              label={t('type of item')}
              value={item?.t || getDefaultItemLawType()}
              onChange={selectLawType}
              options={lawTypeOpt}
            />
          </div>
          <div className='ui--row'>
            <Input
              autoFocus
              className='full'
              help={t('Title of item')}
              label={t('title of item')}
              onChange={editItemTitle}
              value={item?.h || ""}
            />
          </div>
        </>
      )}
      {exerciseEditors}
      <div className='ui--row'>
        <Button
          icon='add'
          label={t('Add list item')}
          onClick={addItem}
        />
      </div>
    </>
  );
}

export default React.memo(Editor);