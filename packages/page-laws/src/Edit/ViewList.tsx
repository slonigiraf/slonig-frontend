import React, { useCallback, useEffect, useState } from 'react';
import { LawType, KatexSpan, SelectableList, StyledSpinnerContainer, useLoginContext, getCIDFromBytes, FullscreenActivity, useInfo, Confirmation } from '@slonigiraf/app-slonig-components';
import { useLocation, useNavigate } from 'react-router-dom';
import ItemLabel from './ItemLabel.js';
import SkillQR from './SkillQR.js';
import { useTranslation } from '../translate.js';
import ExerciseList from './ExerciseList.js';
import { Spinner, Label, Button } from '@polkadot/react-components';
import { ItemWithCID } from '../types.js';
import { useApi } from '@polkadot/react-hooks';
import BN from 'bn.js';
import { getLettersForKnowledgeId, getSetting, SettingKey } from '@slonigiraf/db';
import { u8aToHex } from '@polkadot/util';
import ModulePreview from './ModulePreview.js';
import styled from 'styled-components';

type JsonType = { [key: string]: any } | null;
interface Props {
  className?: string;
  id: string;
  cidString: string;
  list: JsonType;
}

function ViewList({ className = '', id, cidString, list }: Props): React.ReactElement<Props> {
  const location = useLocation();
  const navigate = useNavigate();
  const { showInfo } = useInfo();
  const { api } = useApi();
  const queryParams = new URLSearchParams(location.search);
  const lessonInUrl = queryParams.get('lesson') != null;
  const expanded = queryParams.get('expanded') != null;
  const { t } = useTranslation();
  const { currentPair, isLoggedIn, setLoginIsRequired } = useLoginContext();
  const [isLearningRequested, setLearningRequested] = useState(false);
  const [isReexaminingRequested, setReexaminingRequested] = useState(false);
  const [isThereAnythingToReexamine, setIsThereAnythingToReexamine] = useState(false);
  const [isThereAnythingToLearn, setIsThereAnythingToLearn] = useState(false);
  const [shouldSelectAll, setShouldSelectAll] = useState(false);
  const [selectedItems, setSelectedItems] = useState<ItemWithCID[]>([]);
  const [isLearningInitialized, setIsLearningInitialized] = useState(false);
  const [itemsWithCID, setItemsWithCID] = useState<ItemWithCID[]>([]);
  const studentIdentity = u8aToHex(currentPair?.publicKey);
  const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);
  const [hasTuteeCompletedTutorial, setHasTuteeCompletedTutorial] = useState(false);

  useEffect((): void => {
    const loadTutorialResults = async () => {
      const completed = await getSetting(SettingKey.TUTEE_TUTORIAL_COMPLETED);
      setHasTuteeCompletedTutorial(completed === 'true' ? true : false);
    };
    loadTutorialResults();
  }, []);

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

        if (list.t !== null && list.t === LawType.MODULE && items.length > 0) {
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



  const closeQR = useCallback((): void => {
    setLearningRequested(false);
    setReexaminingRequested(false);
    setIsExitConfirmOpen(false);
    id && navigate(`/knowledge?id=${id}`, { replace: true });
  }, [id, navigate]);

  const onDataSent = useCallback((): void => {
    closeQR();
    showInfo(t('You can put your device aside'));
  }, [closeQR]);

  const exitFullScreenActivity = useCallback((): void => {
    hasTuteeCompletedTutorial ? closeQR() : setIsExitConfirmOpen(true);
  }, [hasTuteeCompletedTutorial, closeQR]);

  useEffect((): void => {
    if (
      lessonInUrl &&
      isThereAnythingToLearn &&
      !shouldSelectAll &&
      !isLearningInitialized
    ) {
      if (isLoggedIn) {
        setIsLearningInitialized(true);
        setShouldSelectAll(true);
      }
      handleLearningToggle(true);
    }
  }, [lessonInUrl, isLoggedIn, isThereAnythingToLearn, shouldSelectAll, isLearningInitialized]);

  const isModuleQRVisible = isLearningRequested || isReexaminingRequested;

  const handleSelectionChange = (newSelectedItems: ItemWithCID[]) => {
    setSelectedItems(newSelectedItems);
  };

  const isSelectionAllowed = true;

  const content = list ? <>
    {!isModuleQRVisible && <h1><KatexSpan content={list.h} /></h1>}
    {list.t !== null && list.t === LawType.MODULE && (
      expanded ?
        (itemsWithCID.length > 0 && <ModulePreview itemsWithCID={itemsWithCID} />) :
        <>
          <div className='ui--row' style={isModuleQRVisible ? {} : { display: 'none' }}>
            <SkillQR id={id} cid={cidString} type={LawType.MODULE} selectedItems={selectedItems} isLearningRequested={isLearningRequested} isReexaminingRequested={isReexaminingRequested} lessonInUrl={lessonInUrl} onDataSent={onDataSent} />
          </div>
          <ButtonsRow>
            {isThereAnythingToLearn && !isModuleQRVisible && <Button
              className='highlighted--button'
              icon='people-arrows'
              label={t('Learn')}
              onClick={() => handleLearningToggle(true)}
            />}
            {isThereAnythingToReexamine && !isModuleQRVisible && <Button
              // className='highlighted--button'
              icon='arrows-rotate'
              label={t('Reexamine')}
              onClick={() => handleReexaminingToggle(true)}
            />}
          </ButtonsRow>
        </>
    )}
    {list.t !== null && list.t === LawType.SKILL && (
      <>
        {/* <LearnWithAI skillName={list.h} exercises={list.q} /> */}
        <h3>{t('Example exercises to train the skill')}</h3>
      </>
    )}

    {itemsWithCID.length > 0 && !expanded && (
      <div className='ui--row' style={isModuleQRVisible ? { display: 'none' } : {}}>
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
          keyExtractor={(item) => item.id + item.validDiplomas.length}
          filterOutSelection={(item) => isReexaminingRequested ? !(item.validDiplomas.length > 0) : (item.validDiplomas.length > 0)}
          key={id + isReexaminingRequested}
          allSelected={shouldSelectAll}
        />
      </div>
    )}
    {list.q != null && <ExerciseList exercises={list.q} />}
    {list.t !== null && list.s && list.t === LawType.MODULE && !isModuleQRVisible && (
      <DivWithLeftMargin>
        <h3>{t('Educational standards') + ': '}</h3>
        <Standards data-testid='standards'>
          <Label label={list.s} />
        </Standards>
      </DivWithLeftMargin>
    )}
  </> : <></>;

  return list == null ?
    <StyledSpinnerContainer><Spinner noLabel /></StyledSpinnerContainer> :
    (isModuleQRVisible ?
      <FullscreenActivity captionElement={<KatexSpan content={list.h} />} onClose={exitFullScreenActivity} >
        <RemoveBorders>{content}</RemoveBorders>
        {isExitConfirmOpen && (
          <Confirmation question={t('Sure to exit learning?')} onClose={() => setIsExitConfirmOpen(false)} onConfirm={closeQR} />
        )}
      </FullscreenActivity> :
      content);
}
const ButtonsRow = styled.div`
  width: 100%;
  display: flex;
  justify-content: left;
  align-items: center;
  column-gap: 20px;
  .ui--Button {
    text-align: center;
    margin: 5px;
  }
`;

const RemoveBorders = styled.div`
  width: 100%;
  flex: 1;

  table {
    border-collapse: collapse;
    width: 100%;
  }

  tbody td {
    border-top: none !important;
  }

  tbody td:first-child {
    border-left: none !important;
    border-right: none !important;
    border-top: none !important;
  }
`;

const DivWithLeftMargin = styled.div`
  margin-left: 10px;
`;

const Standards = styled.div`
  display: flex;
  flex-direction: row;
  gap: 5px;
  flex-wrap: wrap;
  label {
    text-transform: none;
  }
`;
export default React.memo(ViewList);