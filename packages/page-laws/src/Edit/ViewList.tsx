import React, { useCallback, useState } from 'react';
import { LawType, KatexSpan, SelectableList, StyledSpinnerContainer, useLoginContext } from '@slonigiraf/app-slonig-components';
import ItemLabel from './ItemLabel.js';
import SkillQR from './SkillQR.js';
import { useTranslation } from '../translate.js';
import ExerciseList from './ExerciseList.js';
import LearnWithAI from './LearnWithAI.js';
import { Toggle, Spinner } from '@polkadot/react-components';
import { ItemWithCID } from '../types.js';

type JsonType = { [key: string]: any } | null;
interface Props {
  className?: string;
  id: string;
  cidString: string;
  list: JsonType;
}

function ViewList({ className = '', id, cidString, list }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { isLoggedIn, setLoginIsRequired } = useLoginContext();
  const [isLearningRequested, setLearningRequested] = useState(false);
  const [isReexaminingRequested, setReexaminingRequested] = useState(false);
  const [isThereAnythingToReexamine, setIsThereAnythingToReexamine] = useState(false);
  const [isThereAnythingToLearn, setIsThereAnythingToLearn] = useState(false);
  const [selectedItems, setSelectedItems] = useState<ItemWithCID[]>([]);

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
  }, [setLoginIsRequired]);

  const handleReexaminingToggle = useCallback((checked: boolean): void => {
    setReexaminingRequested(checked);
    if (checked) {
      setLearningRequested(false);
    }
  }, []);

  const isModuleQRVisible = isLearningRequested || isReexaminingRequested;

  const handleSelectionChange = (newSelectedItems: ItemWithCID[]) => {
    setSelectedItems(newSelectedItems);
  };

  const handleItemsUpdate = useCallback((items: ItemWithCID[]): void => {
    if (items.length > 0) {
      const allHaveValidDiplomas = items.every(item => item.validDiplomas && item.validDiplomas.length > 0);
      setIsThereAnythingToLearn(!allHaveValidDiplomas);
      const someHaveValidDiplomas = items.some(item => item.validDiplomas && item.validDiplomas.length > 0);
      setIsThereAnythingToReexamine(someHaveValidDiplomas);
    }
  }, [setIsThereAnythingToLearn, setIsThereAnythingToReexamine]);

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
            <SkillQR id={id} cid={cidString} type={LawType.MODULE} selectedItems={selectedItems} isLearningRequested={isLearningRequested} isReexaminingRequested={isReexaminingRequested} />
          </div>
        </>
      )}
      {list.t !== null && list.t === LawType.SKILL && (
        <>
          <SkillQR id={id} cid={cidString} type={LawType.SKILL} selectedItems={[{ 'id': id, 'cid': cidString, 'validDiplomas': [] }]} isLearningRequested={true} />
          <LearnWithAI skillName={list.h} exercises={list.q} />
          <h3>{t('Example exercises to train the skill')}</h3>
        </>
      )}

      {list.e != null && (
        <SelectableList<ItemWithCID>
          items={list.e.map((id: string) => ({
            id: id,
            cid: ''
          }))}
          renderItem={(item, isSelected, isSelectionAllowed, onToggleSelection, handleItemUpdate) => (
            <ItemLabel
              id={item.id}
              isSelected={isSelected}
              isReexaminingRequested={isReexaminingRequested}
              onToggleSelection={onToggleSelection}
              isSelectable={isModuleQRVisible}
              onItemUpdate={handleItemUpdate}
            />
          )}
          onSelectionChange={handleSelectionChange}
          onItemsUpdate={handleItemsUpdate}
          isSelectionAllowed={isModuleQRVisible}
          keyExtractor={(item) => item.id}
          key={id}
        />
      )}

      {list.q != null && <ExerciseList exercises={list.q} />}
    </>
  );
}

export default React.memo(ViewList);