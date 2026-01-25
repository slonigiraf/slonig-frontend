import React, { useCallback, useEffect, useState } from 'react';
import { LawType, KatexSpan, SelectableList, StyledSpinnerContainer, useLoginContext, getCIDFromBytes, FullscreenActivity, Confirmation, NotClosableFullscreen, useBooleanSettingValue, OKBox, ClassInstruction, useLog, useIpfsContext, getIPFSDataFromContentID, parseJson, ProgressData, progressValue } from '@slonigiraf/slonig-components';
import { useLocation, useNavigate } from 'react-router-dom';
import ItemLabel from './ItemLabel.js';
import SkillQR from './SkillQR.js';
import { useTranslation } from '../translate.js';
import ExerciseList from './ExerciseList.js';
import { Spinner, Label, Button, Progress } from '@polkadot/react-components';
import { ItemWithCID } from '../types.js';
import { useApi } from '@polkadot/react-hooks';
import BN from 'bn.js';
import { getLettersForKnowledgeId, getRepetitionsForKnowledgeId, SettingKey } from '@slonigiraf/db';
import { u8aToHex } from '@polkadot/util';
import ModulePreview from './ModulePreview.js';
import styled from 'styled-components';
import { sleptBetween, takeWithinTime } from '../util.js';
import { EXAMPLE_COURSE_KNOWLEDGE_ID, EXAMPLE_MODULE_KNOWLEDGE_CID, EXAMPLE_MODULE_KNOWLEDGE_ID, LESSON_LENGTH_SEC } from '@slonigiraf/utils';
import LearningRouter from './LearningRouter.js';

type JsonType = { [key: string]: any } | null;

interface Props {
  className?: string;
  id: string;
  cidString: string;
  isClassInstructionShown: boolean;
  setIsClassInstructionShown: (isShown: boolean) => void;
  list: JsonType;
}

function ViewList({ className = '', id, cidString, isClassInstructionShown, setIsClassInstructionShown, list }: Props): React.ReactElement<Props> {
  const location = useLocation();
  const navigate = useNavigate();
  const { ipfs, isIpfsReady } = useIpfsContext();
  const { api } = useApi();
  const queryParams = new URLSearchParams(location.search);
  const lessonInUrl = queryParams.get('lesson') != null;
  const showSkillQrInUrl = queryParams.get('showSkillQr') != null;
  const examInUrl = queryParams.get('exam') != null;
  const expanded = queryParams.get('expanded') != null;
  const { t } = useTranslation();
  const hasTuteeCompletedTutorial = useBooleanSettingValue(SettingKey.TUTEE_TUTORIAL_COMPLETED);
  const nowIsClassOnboarding = useBooleanSettingValue(SettingKey.NOW_IS_CLASS_ONBOARDING);
  const { currentPair, isLoggedIn, setLoginIsRequired } = useLoginContext();
  const [isLearningRequested, setLearningRequested] = useState(false);
  const [isReexaminingRequested, setReexaminingRequested] = useState(false);
  const [isThereAnythingToReexamine, setIsThereAnythingToReexamine] = useState(false);
  const [isThereAnythingToLearn, setIsThereAnythingToLearn] = useState(false);
  const [shouldSelectAll, setShouldSelectAll] = useState(false);
  const [canBeLearnedToday, setCanBeLearnedToday] = useState<ItemWithCID[]>([]);
  const [canBeExamined, setCanBeExamined] = useState<ItemWithCID[]>([]);
  const [selectedItems, setSelectedItems] = useState<ItemWithCID[]>([]);
  const [isLearningInitialized, setIsLearningInitialized] = useState(false);
  const [itemsWithCID, setItemsWithCID] = useState<ItemWithCID[]>([]);
  const studentIdentity = u8aToHex(currentPair?.publicKey);
  const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);
  const [role, setRole] = useState<'tutee' | undefined>(undefined);
  const [isPutDeviceAsideOpen, setIsPutDeviceAsideOpen] = useState(false);
  const { logEvent } = useLog();
  const [progressData, setProgressData] = useState<ProgressData>({ skills: 0, letters: 0, repetitions: 0 });
  const [modulesProgress, setModulesProgess] = useState<Map<string, ProgressData>>(() => new Map());
  const [isLaunchLearnConfirmOpen, setIsLaunchLearnConfirmOpen] = useState(false);
  const [isLaunchExamConfirmOpen, setIsLaunchExamConfirmOpen] = useState(false);

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
        const now = (new Date()).getTime();
        const items = await Promise.all(
          list.e.filter((id: string) => id !== EXAMPLE_COURSE_KNOWLEDGE_ID).map(async (id: string) => {
            const cid = await fetchLaw(id) || '';
            if (list.t === LawType.MODULE) {
              const validDiplomas = await getLettersForKnowledgeId(studentIdentity, id);
              const repetitions = await getRepetitionsForKnowledgeId(studentIdentity, id);
              const shouldBeBlockedForLearning = repetitions.length > 0 ? !sleptBetween(repetitions[0].lastExamined, now) : false;

              return {
                id: id,
                cid: cid,
                validDiplomas: validDiplomas,
                shouldBeRepeated: repetitions.length > 0,
                isBlockedForLearning: shouldBeBlockedForLearning,
              };
            } else {
              return {
                id: id,
                cid: cid,
                validDiplomas: [],
                shouldBeRepeated: false,
                isBlockedForLearning: false,
              };
            }
          })
        );
        setItemsWithCID(items);
        const skills = items.length;
        const letters = items.filter(i => i.validDiplomas.length).length;
        const repetitions = items.filter(i => i.shouldBeRepeated).length;
        const blockedForLearning = items.filter(i => i.isBlockedForLearning).length;
        setProgressData({ skills, letters, repetitions });

        if (list.t !== null && list.t === LawType.MODULE && items.length > 0) {
          const allHaveValidDiplomas = items.every(item => item.validDiplomas && item.validDiplomas.length > 0);
          setIsThereAnythingToLearn(skills > letters + blockedForLearning);
          const someHaveValidDiplomas = items.some(item => item.validDiplomas && item.validDiplomas.length > 0);
          setIsThereAnythingToReexamine(someHaveValidDiplomas);
        }
      }
    };
    fetchCIDs();
  }, [list, studentIdentity, setIsThereAnythingToLearn, setIsThereAnythingToReexamine]);

  useEffect(() => {
    let cancelled = false;

    const fetchModulesIPFSData = async () => {
      if (
        modulesProgress.size > 0 ||
        !isIpfsReady ||
        itemsWithCID.length === 0 ||
        list?.t !== LawType.COURSE
      ) {
        return;
      }

      const now = Date.now();

      const results = await Promise.all(
        itemsWithCID.map(async (entry) => {
          const textValue = await getIPFSDataFromContentID(ipfs, entry.cid);
          const json = parseJson(textValue);

          const ids: string[] = Array.isArray(json?.e) ? json.e : [];

          const moduleItems = await Promise.all(
            ids.map(async (id) => {
              const cid = (await fetchLaw(id)) || '';
              const validDiplomas = await getLettersForKnowledgeId(studentIdentity, id);
              const reps = await getRepetitionsForKnowledgeId(studentIdentity, id);

              const isBlockedForLearning =
                reps.length > 0 ? !sleptBetween(reps[0].lastExamined, now) : false;

              return {
                id,
                cid,
                validDiplomas,
                shouldBeRepeated: reps.length > 0,
                isBlockedForLearning,
              };
            })
          );

          const itemsToLearnToday = moduleItems.filter(
            (x) => x.validDiplomas.length === 0 && !x.isBlockedForLearning
          );
          const itemsToReexamine = moduleItems.filter((x) => x.validDiplomas.length > 0);

          const progress = {
            skills: moduleItems.length,
            letters: itemsToReexamine.length,
            repetitions: moduleItems.filter((x) => x.shouldBeRepeated).length,
          };

          return { entry, itemsToLearnToday, itemsToReexamine, progress };
        })
      );

      if (cancelled) return;

      const progressMap = new Map(results.map((r) => [r.entry.id, r.progress]));
      setModulesProgess(progressMap);

      // total progress (sum of all module progresses)
      const totalProgress: ProgressData = results.reduce<ProgressData>(
        (acc, r) => ({
          skills: acc.skills + r.progress.skills,
          letters: acc.letters + r.progress.letters,
          repetitions: acc.repetitions + r.progress.repetitions,
        }),
        { skills: 0, letters: 0, repetitions: 0 }
      );
      setProgressData(totalProgress);

      const toLearn = takeWithinTime(
        results.flatMap((r) => r.itemsToLearnToday),
        LESSON_LENGTH_SEC
      );

      setCanBeLearnedToday(toLearn);
      setIsThereAnythingToLearn(toLearn.length > 0);
      const toExamine = results.flatMap((r) => r.itemsToReexamine);
      setCanBeExamined(toExamine)
      setIsThereAnythingToReexamine(toExamine.length > 0);
    };

    fetchModulesIPFSData();

    return () => {
      cancelled = true;
    };
  }, [list, itemsWithCID, isIpfsReady, ipfs, modulesProgress, studentIdentity]);

  useEffect(() => {
    if (
      !(lessonInUrl || showSkillQrInUrl) ||
      !list ||
      list.t === null ||
      (list.t !== LawType.MODULE && list.t !== LawType.COURSE)
    ) {
      return;
    }

    const timeout = setTimeout(() => {
      logEvent('LEARNING', 'AUTO_SHOW_LESSON_REQUEST_QR');
      logEvent('LEARNING', examInUrl ? 'EXAM_REQUESTED' : 'LEARNING_REQUESTED', list.h);
    }, 1000);

    return () => clearTimeout(timeout);
  }, [lessonInUrl, examInUrl, showSkillQrInUrl, list, logEvent]);

  const processLearn = useCallback((): void => {
    if (list?.t === LawType.COURSE) setSelectedItems(canBeLearnedToday);
    handleLearningToggle(true);
    setIsLaunchLearnConfirmOpen(false);
  }, [list, canBeLearnedToday, logEvent]);

  const learnClicked = useCallback((): void => {
    list && logEvent('LEARNING', 'CLICK_LEARN');
    if (list?.t === LawType.MODULE && list.p) {
      setIsLaunchLearnConfirmOpen(true);
    } else {
      logEvent('LEARNING', 'LEARNING_REQUESTED', list?.h);
      processLearn();
    }
  }, [list, processLearn, logEvent]);

  const processExam = useCallback((): void => {
    if (list?.t === LawType.COURSE) setSelectedItems(canBeExamined);
    handleReexaminingToggle(true);
    setIsLaunchExamConfirmOpen(false);
  }, [list, canBeExamined, logEvent]);

  const examClicked = useCallback((): void => {
    list && logEvent('LEARNING', 'CLICK_EXAM');
    if (list?.t === LawType.MODULE && list.p) {
      setIsLaunchExamConfirmOpen(true);
    } else {
      logEvent('LEARNING', 'EXAM_REQUESTED', list?.h);
      processExam();
    }
  }, [list, processExam, logEvent]);

  const handleLearningToggle = useCallback((checked: boolean): void => {
    setLearningRequested(checked);
    if (checked) {
      setReexaminingRequested(false);
    }
  }, [list, logEvent]);

  const handleReexaminingToggle = useCallback((checked: boolean): void => {
    setReexaminingRequested(checked);
    if (checked) {
      setLearningRequested(false);
    }
  }, [list, logEvent]);


  const closeQR = useCallback((): void => {
    setLearningRequested(false);
    setReexaminingRequested(false);
    setIsExitConfirmOpen(false);
    id && navigate(`/knowledge?id=${id}`, { replace: true });
  }, [id, navigate]);

  const helpTutor = useCallback((): void => {
    setLearningRequested(false);
    setReexaminingRequested(false);
    setIsExitConfirmOpen(false);
    navigate('/badges/teach?showHelpQRInfo', { replace: true });
  }, [navigate]);

  const onDataSent = useCallback((): void => {
    closeQR();
    setIsPutDeviceAsideOpen(true);
  }, [closeQR, setIsPutDeviceAsideOpen]);

  const exitFullScreenActivity = useCallback((): void => {
    setIsExitConfirmOpen(true);
  }, [hasTuteeCompletedTutorial]);

  useEffect((): void => {
    if (
      (lessonInUrl || showSkillQrInUrl) &&
      isThereAnythingToLearn &&
      !shouldSelectAll &&
      !isLearningInitialized
    ) {
      if (isLoggedIn) {
        setIsLearningInitialized(true);
        setShouldSelectAll(true);
      }
      if (examInUrl) {
        processExam();
      } else {
        processLearn();
      }
    }
  }, [examInUrl, lessonInUrl, showSkillQrInUrl, isLoggedIn, isThereAnythingToLearn, shouldSelectAll, isLearningInitialized]);

  const isAPairWork = isLearningRequested || isReexaminingRequested;
  const disableSelectionOfWhatToLearn = isAPairWork && (hasTuteeCompletedTutorial === false || nowIsClassOnboarding || list?.t === LawType.COURSE || id === EXAMPLE_MODULE_KNOWLEDGE_ID);

  const handleSelectionChange = (newSelectedItems: ItemWithCID[]) => {
    if (list?.t === LawType.COURSE) return;
    setSelectedItems(newSelectedItems);
  };

  const isSelectionAllowed = true;

  const filterOutItem = useCallback((item: ItemWithCID): boolean => {
    if (isReexaminingRequested) {
      return !(item.validDiplomas.length > 0);
    } else {
      return (item.validDiplomas.length > 0) || item.isBlockedForLearning;
    }
  }, [isReexaminingRequested]);

  const wasLearningDataLoaded = isThereAnythingToLearn || isThereAnythingToReexamine;
  const displayContent = list && (list.t === LawType.COURSE || list.t === LawType.MODULE) ? wasLearningDataLoaded : true;

  const content = list ? <>
    {!isAPairWork && <h1><KatexSpan content={list.h} /></h1>}
    {list.t !== null && (list.t === LawType.COURSE || list.t === LawType.MODULE) && (
      expanded ?
        (itemsWithCID.length > 0 && <ModulePreview itemsWithCID={itemsWithCID} />) :
        <>
          <div className='ui--row' style={isAPairWork ? {} : { display: 'none' }}>
            <SkillQR id={id} cid={cidString} selectedItems={selectedItems} isLearningRequested={isLearningRequested} isReexaminingRequested={isReexaminingRequested} lessonInUrl={lessonInUrl || showSkillQrInUrl} onDataSent={onDataSent} />
          </div>
          <ButtonsRow>
            {wasLearningDataLoaded &&
              <ProgressDiv style={isAPairWork ? { display: 'none' } : {}}>
                <Progress
                  value={progressValue(progressData)}
                  total={progressData.skills}
                />
              </ProgressDiv>
            }
            {isThereAnythingToLearn && !isAPairWork &&
              <Button
                className='highlighted--button'
                icon='people-arrows'
                label={t('Learn')}
                onClick={() => learnClicked()}
              />}
            {isThereAnythingToReexamine && !isAPairWork &&
              <Button
                icon='graduation-cap'
                label={t('Exam')}
                onClick={() => examClicked()}
              />}
          </ButtonsRow>
          {isLaunchLearnConfirmOpen && (
            <LearningRouter
              key="learn"
              courseId={list?.p}
              question={t('Select what to learn')}
              onClose={() => setIsLaunchLearnConfirmOpen(false)}
              onConfirm={() => {
                logEvent('LEARNING', 'LEARNING_REQUESTED', list?.h);
                processLearn();
              }
              } />
          )}
          {isLaunchExamConfirmOpen && (
            <LearningRouter
              key="exam"
              isExam={true}
              courseId={list?.p}
              question={t('Select what to examine')}
              onClose={() => setIsLaunchExamConfirmOpen(false)}
              onConfirm={() => {
                logEvent('LEARNING', 'EXAM_REQUESTED', list?.h);
                processExam();
              }} />
          )}
        </>
    )}
    {list.t !== null && list.t === LawType.SKILL && (
      <>
        {/* <LearnWithAI skillName={list.h} exercises={list.q} /> */}
        <h3>{t('Example exercises to train the skill')}</h3>
      </>
    )}

    {!displayContent && list.e && <Spinner />}

    {itemsWithCID.length > 0 && !expanded && displayContent && (
      <div className='ui--row' style={disableSelectionOfWhatToLearn ? { display: 'none' } : {}}>
        <SelectableList<ItemWithCID>
          items={itemsWithCID}
          renderItem={(item, isSelected, isSelectionAllowed, onToggleSelection) => (
            <ItemLabel
              item={item}
              isSelected={isSelected}
              isReexaminingRequested={isReexaminingRequested}
              onToggleSelection={onToggleSelection}
              isSelectable={isAPairWork}
              progressData={modulesProgress.get(item.id)}
            />
          )}
          onSelectionChange={handleSelectionChange}
          isSelectionAllowed={isAPairWork}
          keyExtractor={(item) => item.id + item.validDiplomas.length}
          filterOutSelection={(item) => filterOutItem(item)}
          key={id + isReexaminingRequested}
          allSelected={shouldSelectAll}
        />
      </div>
    )}
    {list.q != null && <ExerciseList exercises={list.q} />}
    {list.t !== null && list.s && list.t === LawType.MODULE && !isAPairWork && (
      <DivWithLeftMargin>
        <h3>{t('Educational standards') + ': '}</h3>
        <Standards data-testid='standards'>
          <Label label={list.s} />
        </Standards>
      </DivWithLeftMargin>
    )}
    {isPutDeviceAsideOpen && (
      <OKBox info={t('You can put your device aside')} onClose={() => setIsPutDeviceAsideOpen(false)} />
    )}
  </> : <></>;

  const roleSelector = <NotClosableFullscreen>
    <Title>{t('Choose your role for now')}</Title>
    <br />
    <RoleImagesRow>
      <RoleOption onClick={() => setRole('tutee')}>
        <img src="./tutee.png" alt="Tutee" />
        <p>{t('TUTEE – learns new skills and earns badges')}</p>
      </RoleOption>
      <RoleOption onClick={helpTutor}>
        <img src="./tutor.png" alt="Tutor" />
        <p>{t('TUTOR – helps friends and earns rewards')}</p>
      </RoleOption>
    </RoleImagesRow>
  </NotClosableFullscreen>;

  return list == null ?
    <StyledSpinnerContainer><Spinner noLabel /></StyledSpinnerContainer> :
    (isClassInstructionShown ?
      <ClassInstruction caption={list.h} knowledgeId={id} setIsClassInstructionShown={setIsClassInstructionShown} /> :
      isAPairWork ?
        (!role && lessonInUrl) ? roleSelector :
          <FullscreenActivity captionElement={<KatexSpan content={cidString === EXAMPLE_MODULE_KNOWLEDGE_CID ? t('Warm-up') : list.h} />} onClose={exitFullScreenActivity} >
            <RemoveBorders>{content}</RemoveBorders>
            {isExitConfirmOpen && (
              <Confirmation
                question={t('Sure to exit learning?')}
                onClose={() => setIsExitConfirmOpen(false)}
                onConfirm={() => {
                  logEvent('LEARNING', 'EXIT_LEARNING');
                  closeQR();
                }}
              />
            )}
          </FullscreenActivity> :
        content);
}

const RoleImagesRow = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  column-gap: 20px;
  margin-top: 10px;
  flex-wrap: wrap;
`;

const RoleOption = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  padding: 10px;
  border-radius: 16px;
  background: white;
  box-shadow: 0 0 8px rgba(0,0,0,0.1);
  border: 3px solid #F39200;
  width: 150px;

  &:hover {
    transform: scale(1.05);
    box-shadow: 0 0 12px rgba(0,0,0,0.2);
  }

  img {
    height: 140px;
    width: auto;
    object-fit: contain;
    margin-bottom: 8px;
    display: block;
  }

  p {
    margin: 0;
    font-weight: bold;
    text-align: center;
  }
`;

const Title = styled.h1`
  width: 100%;
  text-align: center;
  margin: 0.5rem 0 0;
  font-weight: bold;
`;

const ButtonsRow = styled.div`
  width: 100%;
  position: relative;
  display: flex;
  justify-content: flex-start;
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

const ProgressDiv = styled.div`
  position: absolute;
  top: -5px;
  right: 0px;
`;

export default React.memo(ViewList);