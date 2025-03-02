import React, { useCallback, useEffect, useState } from 'react';
import { LawType, KatexSpan, SelectableList, StyledSpinnerContainer, useLoginContext, getCIDFromBytes } from '@slonigiraf/app-slonig-components';
import { useLocation } from 'react-router-dom';
import ItemLabel from './ItemLabel.js';
import SkillQR from './SkillQR.js';
import { useTranslation } from '../translate.js';
import ExerciseList from './ExerciseList.js';
import { Toggle, Spinner } from '@polkadot/react-components';
import { ItemWithCID } from '../types.js';
import { useApi } from '@polkadot/react-hooks';
import BN from 'bn.js';
import { getLettersForKnowledgeId } from '@slonigiraf/db';
import { u8aToHex } from '@polkadot/util';

type JsonType = { [key: string]: any } | null;
interface Props {
  className?: string;
  id: string;
  cidString: string;
  list: JsonType;
}

function ViewList({ className = '', id, cidString, list }: Props): React.ReactElement<Props> {
  const location = useLocation();
  const { api } = useApi();
  const queryParams = new URLSearchParams(location.search);
  const learnInUrl = queryParams.get('learn') != null;
  const { t } = useTranslation();
  const {currentPair, isLoggedIn, setLoginIsRequired } = useLoginContext();
  const [isLearningRequested, setLearningRequested] = useState(false);
  const [isReexaminingRequested, setReexaminingRequested] = useState(false);
  const [isThereAnythingToReexamine, setIsThereAnythingToReexamine] = useState(false);
  const [isThereAnythingToLearn, setIsThereAnythingToLearn] = useState(false);
  const [shouldSelectAll, setShouldSelectAll] = useState(false);
  const [selectedItems, setSelectedItems] = useState<ItemWithCID[]>([]);
  const [isLearningInitialized, setIsLearningInitialized] = useState(false);
  const [itemsWithCID, setItemsWithCID] = useState<ItemWithCID[]>([]);
  const studentIdentity = u8aToHex(currentPair?.publicKey);

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
          list.e.map(async (id: string) => {
            const cid = await fetchLaw(id) || '';
            const validDiplomas = await getLettersForKnowledgeId(studentIdentity, id);
            return {
              id: id,
              cid: cid,
              validDiplomas: validDiplomas
            };
          })
        );
        setItemsWithCID(items);

        if (items.length > 0) {
          const allHaveValidDiplomas = items.every(item => item.validDiplomas && item.validDiplomas.length > 0);
          setIsThereAnythingToLearn(!allHaveValidDiplomas);
          const someHaveValidDiplomas = items.some(item => item.validDiplomas && item.validDiplomas.length > 0);
          setIsThereAnythingToReexamine(someHaveValidDiplomas);
        }
      }
    };
    fetchCIDs();
  }, [list, studentIdentity, setIsThereAnythingToLearn, setIsThereAnythingToReexamine]);

  const handleLearningToggle = useCallback((checked: boolean): void => {
    if (isLoggedIn) {
      setLearningRequested(checked);
      if (checked) {
        setReexaminingRequested(false);
      }
    } else if (checked) {
      setLoginIsRequired(true);
      setLearningRequested(false);
    }
  }, [isLoggedIn, setLoginIsRequired]);

  const handleReexaminingToggle = useCallback((checked: boolean): void => {
    setReexaminingRequested(checked);
    if (checked) {
      setLearningRequested(false);
    }
  }, []);

  useEffect((): void => {
    if (
      learnInUrl &&
      isThereAnythingToLearn &&
      !shouldSelectAll &&
      !isLearningInitialized
    ) {
      if(isLoggedIn){
        setIsLearningInitialized(true);
        setShouldSelectAll(true);
      }
      handleLearningToggle(true);
    }
  }, [learnInUrl, isLoggedIn, isThereAnythingToLearn, shouldSelectAll, isLearningInitialized]);

  const isModuleQRVisible = isLearningRequested || isReexaminingRequested;

  const handleSelectionChange = (newSelectedItems: ItemWithCID[]) => {
    setSelectedItems(newSelectedItems);
  };

  const isSelectionAllowed = true;

  return list == null ? <StyledSpinnerContainer><Spinner noLabel /></StyledSpinnerContainer> : (
    <>
      <h1><KatexSpan content={list.h} /></h1>
      {list.t !== null && list.t === LawType.MODULE && (
        <>
          {isThereAnythingToLearn && <Toggle
            label={t('Learn with a tutor')}
            onChange={handleLearningToggle}
            value={isLearningRequested}
          />}
          {isThereAnythingToReexamine && <Toggle
            label={t('Reexamine my diplomas')}
            onChange={handleReexaminingToggle}
            value={isReexaminingRequested}
          />}
          <div className='ui--row' style={isModuleQRVisible ? {} : { display: 'none' }}>
            <SkillQR id={id} cid={cidString} type={LawType.MODULE} selectedItems={selectedItems} isLearningRequested={isLearningRequested} isReexaminingRequested={isReexaminingRequested} learnInUrl={learnInUrl} />
          </div>
        </>
      )}
      {list.t !== null && list.t === LawType.SKILL && (
        <>
          {/* <LearnWithAI skillName={list.h} exercises={list.q} /> */}
          <h3>{t('Example exercises to train the skill')}</h3>
        </>
      )}

      {itemsWithCID.length > 0 && (
        <SelectableList<ItemWithCID>
          items={itemsWithCID}
          renderItem={(item, isSelected, isSelectionAllowed, onToggleSelection) => (
            <ItemLabel
              item={item}
              isSelected={isSelected}
              isReexaminingRequested={isReexaminingRequested}
              onToggleSelection={onToggleSelection}
              isSelectable={isModuleQRVisible}
            />
          )}
          onSelectionChange={handleSelectionChange}
          isSelectionAllowed={isModuleQRVisible}
          keyExtractor={(item) => item.id+item.validDiplomas.length}
          filterOutSelection={(item) => isReexaminingRequested ? !(item.validDiplomas.length > 0) : (item.validDiplomas.length > 0)}
          key={id+isReexaminingRequested}
          allSelected={shouldSelectAll}
        />
      )}
      {list.q != null && <ExerciseList exercises={list.q} />}
    </>
  );
}

export default React.memo(ViewList);