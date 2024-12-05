import React, { useCallback } from 'react';
import { Button, Dropdown, Input, styled } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';
import { countWords, PHRASE_WORD_COUNT, randomIdHex } from '../util.js';
import Reordering from './Reordering.js';
import ExerciseEditorList from './ExerciseEditorList.js';
import { useApi } from '@polkadot/react-hooks';
import { LawType, useInfo, useIpfsContext, getCIDFromBytes, getIPFSDataFromContentID, parseJson } from '@slonigiraf/app-slonig-components';
import BN from 'bn.js';
import MillerLawComment from './MillerLawComment.js';

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
  const { ipfs, isIpfsReady } = useIpfsContext();

  const parentToItemDefaultType = {
    [LawType.LIST]: LawType.LIST,
    [LawType.COURSE]: LawType.MODULE,
    [LawType.MODULE]: LawType.SKILL,
  };

  const getDefaultItemLawType = useCallback(() => parentToItemDefaultType[list?.t] || 0, [list]);

  const editItemTitle = useCallback((text: string) => {
    if (countWords(text) <= PHRASE_WORD_COUNT) {
      onItemChange({
        ...item,
        h: text,
        t: item?.t || getDefaultItemLawType()
      });
    }
  }, [item, onItemChange]);

  const selectLawType = useCallback((newLawType: typeof LawType) => {
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
    [LawType.LIST]: [
      { text: t('List'), value: LawType.LIST },
      { text: t('Course'), value: LawType.COURSE },
    ],
    [LawType.COURSE]: [{ text: t('Module'), value: LawType.MODULE }],
    [LawType.MODULE]: [{ text: t('Skill'), value: LawType.SKILL }],
  };

  const lawTypeOpt = baseOptions[list?.t] || [];

  const editItemLink = useCallback((url: string) => {
    const namePattern = /[?&]id=([^&#]*)/;
    const match = url.match(namePattern);
    const idFromUrl = match ? match[1] : null;

    const checkAndUpdateList = async () => {
      if (!idFromUrl || idFromUrl.length !== 66) {
        showInfo(t('The link misses a known ID'), 'error');
        return;
      }

      const existingIds = list.e || [];
      if (existingIds.includes(idFromUrl)) {
        showInfo(t('Duplicate'), 'error');
        return;
      }

      const law = (await api.query.laws.laws(idFromUrl)) as { isSome: boolean; unwrap: () => [Uint8Array, BN] };
      if (!law.isSome) {
        showInfo(t('The link misses a known ID'), 'error');
        return;
      }

      const tuple = law.unwrap();
      const byteArray = tuple[0];
      const cid = await getCIDFromBytes(byteArray);

      if (!isIpfsReady || cid.length <= 2) {
        showInfo(t('Problem with getting IPFS data'), 'error');
        return;
      }

      try {
        const jsonText = await getIPFSDataFromContentID(ipfs, cid);
        const json = parseJson(jsonText);
        const acceptableTypes = lawTypeOpt.map((option: { value: any; }) => option.value);
        if (!acceptableTypes.includes(json.t)) {
          showInfo(t('Cannot be its child'), 'error');
          return;
        }

        const updatedList = {
          ...list,
          e: [...existingIds, idFromUrl]
        };
        showInfo(t('Added'));
        onListChange(updatedList);
      } catch (error) {
        showInfo(t('Wrong JSON format'), 'error');
      }
    };

    checkAndUpdateList();
  }, [list, onListChange, api, ipfs, isIpfsReady, lawTypeOpt, showInfo, t]);

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
            <FormContainer>
              <Input
                autoFocus
                className='full'
                label={t('title')}
                onChange={editListTitle}
                value={list.h}
              />
              {countWords(list.h) === PHRASE_WORD_COUNT && <MillerLawComment />}
            </FormContainer>
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
              label={t('link') + ' (app.slonig.org/#/knowledge?id=...)'}
              onChange={editItemLink}
              value={item?.i || ""}
            />
          </div>
        </>
      )}
      {isAddingItem && (
        <>
          <FormContainer>
            <Dropdown
              label={t('type of item')}
              value={itemType}
              onChange={selectLawType}
              options={lawTypeOpt}
            />
            <Input
              autoFocus
              className='full'
              label={t('title of item')}
              onChange={editItemTitle}
              value={item?.h || ""}
            />
            {countWords(item?.h) === PHRASE_WORD_COUNT && <MillerLawComment />}
          </FormContainer>
        </>
      )}
      {/* For adding new exercises at skill view */}
      <ExerciseEditorList list={item} onListChange={onItemChange} className='exercise-editor' />
      {/* For adding new skills at module view */}
      <ExerciseEditorList list={list} onListChange={onListChange} className='exercise-editor' />
      {!isAddingItem && !isAddingLink && (<div className='ui--row'>
        <Button
          icon='link'
          label={t('Existing')}
          onClick={linkItem}
        />
        <Button
          icon='add'
          label={t('New')}
          onClick={addItem}
        />
      </div>)}
    </>
  );
}
const FormContainer = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  .ui--Labelled {
    padding-left: 0px !important;
  }
  label {
    left: 20px !important;
  }
`;

export default React.memo(Editor);