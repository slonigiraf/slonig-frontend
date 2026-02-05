// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, LinearProgress, styled } from '@polkadot/react-components';
import { u8aToHex } from '@polkadot/util';
import { Confirmation, OKBox, FullFindow, VerticalCenterItemsContainer, useInfo, useLoginContext, HintBubble, useBooleanSettingValue, useLog, useNumberSettingValue, getIPFSDataFromContentID, parseJson, useIpfsContext, timeStampStringToNumber, bnToSlonFloatOrNaN, bnToSlonString, FullscreenActivity } from '@slonigiraf/slonig-components';
import { LetterTemplate, Lesson, Reexamination, getPseudonym, getLesson, getLetterTemplatesByLessonId, getReexaminationsByLessonId, getSetting, storeSetting, putLesson, getLetter, SettingKey, deleteSetting, isThereAnyLessonResult, setSettingToTrue, getToRepeatLetterTemplatesByLessonId, getValidLetterTemplatesByLessonId } from '@slonigiraf/db';
import DoInstructions from './DoInstructions.js';
import LessonsList from './LessonsList.js';
import LessonResults from './LessonResults.js';
import LessonRequestReceiver from './LessonRequestReceiver.js';
import { useTranslation } from '../translate.js';
import { useLocation, useNavigate } from 'react-router-dom';
import { EXAMPLE_MODULE_KNOWLEDGE_CID, FAST_SKILL_DISCUSSION_MS, MAX_FAST_DISCUSSED_SKILLS_IN_ROW_COUNT, MAX_SAME_PARTNER_TIME_MS, MIN_SAME_PARTNER_TIME_MS, MIN_SKILL_DISCUSSION_MS, ONE_SUBJECT_PERIOD_MS } from '@slonigiraf/utils';
import BN from 'bn.js';
import { TutorAction } from 'db/src/db/Lesson.js';
import { LessonStat } from '../types.js';
import AskToUnblockTutoring from './AskToUnblockTutoring.js';
import LessonProcessInfo from './LessonProcessInfo.js';
interface Props {
  className?: string;
}

function keyFromLessonStat(lessonStat: LessonStat): string {
  const normalize = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;

    if (Array.isArray(v)) return v.map(normalize);

    // object: sort keys for stable output
    return Object.keys(v as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = normalize((v as Record<string, unknown>)[k]);
        return acc;
      }, {});
  };

  return JSON.stringify(normalize(lessonStat));
}

function Teach({ className = '' }: Props): React.ReactElement<Props> {
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const showHelpQRInfo = queryParams.get('showHelpQRInfo') != null;
  const studentReminder = queryParams.get('studentReminder');
  const tutorReminder = queryParams.get('tutorReminder');

  const { t } = useTranslation();
  const { showInfo } = useInfo();
  const { logEvent, logBan } = useLog();
  const { ipfs } = useIpfsContext();
  // Initialize api, ipfs and translation
  const { currentPair, isLoggedIn } = useLoginContext();
  const [reexaminationToPerform, setReexaminationToPerform] = useState<Reexamination | null>(null);
  const [letterTemplateToIssue, setLetterTemplateToIssue] = useState<LetterTemplate | null>(null);

  // Store progress state
  const [reexamined, setReexamined] = useState<boolean>(false);

  //   student name
  const [studentName, setStudentName] = useState<string | null>(null);
  //   show stake and days or hide
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [letterTemplates, setLetterTemplates] = useState<LetterTemplate[]>([]);
  const [reexaminations, setReexaminations] = useState<Reexamination[]>([]);
  const [areResultsShown, setResultsShown] = useState(false);
  const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);
  const hasTutorCompletedTutorial = useBooleanSettingValue(SettingKey.TUTOR_TUTORIAL_COMPLETED);
  const blockTutoring = useBooleanSettingValue(SettingKey.BAN_TUTORING);
  const lastPartnerChangeTime = useNumberSettingValue(SettingKey.LAST_PARTNER_CHANGE_TIME);
  const [hasTuteeUsedSlonig, setHasTuteeUsedSlonig] = useState(false);
  const [isSendingResultsEnabled, setIsSendingResultsEnabled] = useState<boolean | undefined>(undefined);
  const [isHelpQRInfoShown, setIsHelpQRInfoShown] = useState(showHelpQRInfo);
  const [lastSkillDiscussedTime, setLastSkillDiscussedTime] = useState<number | null>(null);
  const [tooFastConfirmationIsShown, setTooFastConfirmationIsShown] = useState(false);
  const [fastDiscussedSkillsCount, setFastDiscussedSkillsCount] = useState(0);
  const [warningCount, setWarningCount] = useState(0);
  const [isPairChangeDialogueOpen, setIsPairChangeDialogueOpen] = useState(false);
  const lastTimeBucketRef = useRef<number | null>(null);
  const [lessonName, setLessonName] = useState<null | string>(null);
  const [pageWasJustRefreshed, setPageWasJustRefreshed] = useState(true);
  const [lessonStat, setLessonStat] = useState<LessonStat | null>(null);
  const [lastLessonId, setLastLessonId] = useState<null | string>(null);

  useEffect(() => {
    showHelpQRInfo && setIsHelpQRInfoShown(true);
  }, [showHelpQRInfo]);

  useEffect(() => {
    const refreshLessonStat = async () => {
      if (lesson === null) return;

      const reexaminations = await getReexaminationsByLessonId(lesson.id);
      const letterTemplates = await getLetterTemplatesByLessonId(lesson.id);

      const nothingToDiscuss = (reexaminations.length + letterTemplates.length) === 0;
      if (!lesson || nothingToDiscuss) return;

      try {
        // Get fresh data

        const markedToRepeat = await getToRepeatLetterTemplatesByLessonId(lesson.id);
        const toIssueLetters: LetterTemplate[] = await getValidLetterTemplatesByLessonId(lesson.id);

        const askedToLearn = letterTemplates.length;
        const askedToLearnSecondTime = letterTemplates.filter(t => t.mature).length;
        const askedToLearnFirstTime = letterTemplates.length - askedToLearnSecondTime;
        const askedForReexaminations = reexaminations.length;

        const lastBonus = (lesson.reexamineStep > 0 && lesson.learnStep === 0) &&
          !reexaminations[lesson.reexamineStep - 1].valid ?
          bnToSlonFloatOrNaN(new BN(reexaminations[lesson.reexamineStep - 1].amount)) : 0;

        const issuedBadgeCount = toIssueLetters.length;
        const markedForRepeatCount = markedToRepeat.length;
        const validatedBadgesCount = reexaminations.filter(r => r.created !== r.lastExamined && r.valid).length;
        const revokedBadgesCount = reexaminations.filter(r => !r.valid).length;
        const totalProfitForReexamination = bnToSlonFloatOrNaN(
          reexaminations
            .filter((r) => !r.valid)
            .reduce((acc, r) => acc.add(new BN(r.amount)), new BN(0))
        );
        const totalProfitForTeaching = issuedBadgeCount * bnToSlonFloatOrNaN(new BN(lesson.dPrice));
        const totalProfit = totalProfitForReexamination + totalProfitForTeaching;
        const totalWarranty = issuedBadgeCount * bnToSlonFloatOrNaN(new BN(lesson.dWarranty));


        setLessonStat({
          learnStep: lesson.learnStep,
          reexamineStep: lesson.reexamineStep,
          askedToLearn,
          askedToLearnFirstTime,
          askedToLearnSecondTime,
          askedForReexaminations,
          issuedBadgeCount,
          markedForRepeatCount,
          validatedBadgesCount,
          revokedBadgesCount,
          totalProfitForReexamination,
          totalProfitForTeaching,
          totalProfit,
          totalWarranty,
          lastAction: lesson.lastAction,
          lastBonus,
          dPrice: lesson.dPrice,
          dWarranty: lesson.dWarranty,
        })

      } catch (error) {
        console.error(error);
      }
    };

    refreshLessonStat();

  }, [lesson]);


  useEffect(() => {
    async function fetchData() {
      if (ipfs !== null && lesson && lesson.id !== lastLessonId) {
        try {
          const content = await getIPFSDataFromContentID(ipfs, lesson.cid);
          const json = parseJson(content);
          setLessonName(json.h);
          setLastLessonId(lesson.id);
          setIsPairChangeDialogueOpen(false);

          const lastLessonId = await getSetting(SettingKey.LAST_LESSON_ID);
          const lastLessonStartTime = timeStampStringToNumber(await getSetting(SettingKey.LAST_LESSON_START_TIME));
          const timePassed = lastLessonStartTime ? (Date.now() - lastLessonStartTime) : Date.now();
          if (lastLessonId !== lesson.id || timePassed > ONE_SUBJECT_PERIOD_MS) {
            logEvent('TUTORING', 'LESSON_START', json.h);
            await storeSetting(SettingKey.LAST_LESSON_ID, lesson.id);
            await storeSetting(SettingKey.LAST_LESSON_START_TIME, Date.now().toString());
          }
        } catch (e) {
          console.log(e);
        }
      }
    }
    fetchData();
  }, [ipfs, lesson, lastLessonId]);



  useEffect(() => {
    if (!lastSkillDiscussedTime && (letterTemplateToIssue !== null || reexaminationToPerform !== null)) {
      setLastSkillDiscussedTime((new Date()).getTime());
    }
  }, [lastSkillDiscussedTime, letterTemplateToIssue, reexaminationToPerform]);

  useEffect(() => {
    if (!lesson || isPairChangeDialogueOpen || !lastPartnerChangeTime) return;

    const tick = () => {
      const now = Date.now();
      const justStartedToWork = lastPartnerChangeTime && (now - lastPartnerChangeTime) < MIN_SAME_PARTNER_TIME_MS;
      const bucket = Math.floor(now / MAX_SAME_PARTNER_TIME_MS);
      if (!justStartedToWork && bucket !== lastTimeBucketRef.current) {
        setIsPairChangeDialogueOpen(true);
      }
      lastTimeBucketRef.current = bucket;
    };

    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [lesson, lastPartnerChangeTime, isPairChangeDialogueOpen, setIsPairChangeDialogueOpen]);

  const showTooFastWarning = useCallback(() => {
    setWarningCount(warningCount + 1);
    setTooFastConfirmationIsShown(true);
  }, [warningCount, setWarningCount, setTooFastConfirmationIsShown]);

  const protectTutor = useCallback(async (talkDuration: number, isLearning: boolean, lastAction: TutorAction, action: () => Promise<void>) => {
    if (!lastSkillDiscussedTime) return;

    const now = (new Date()).getTime();
    const timeSpent = now - lastSkillDiscussedTime;

    if (!hasTutorCompletedTutorial) {
      logEvent('ONBOARDING', 'TUTOR_TUTORIAL_TIME', 'tutor_tutorial_time_sec', Math.round(timeSpent / 1000));
      logEvent('ONBOARDING', 'TUTOR_TUTORIAL_TALK_TIME', 'tutor_tutorial_talk_time_sec', Math.round(talkDuration / 1000));
      await action();
      return;
    }

    setLastSkillDiscussedTime(now);

    const logTime = (isLearning: boolean) => {
      logEvent('TUTORING',
        isLearning ? 'TEACH_SKILL_TIME' : 'REEXAMINE_SKILL_TIME',
        isLearning ? 'teach_skill_time_sec' : 'reexamine_skill_time_sec',
        Math.round(timeSpent / 1000)
      );
      logEvent('TUTORING',
        isLearning ? 'TEACH_TALK_SKILL_TIME' : 'REEXAMINE_TALK_SKILL_TIME',
        isLearning ? 'teach_talk_skill_time_sec' : 'reexamine_talk_skill_time_sec',
        Math.round(talkDuration / 1000)
      );
    }

    if (lastAction === 'skip') {
      await action();
    } else if (lastAction === 'revoke') {
      logTime(isLearning);
      await action();
    } else if (talkDuration < MIN_SKILL_DISCUSSION_MS) {
      const eventType = isLearning ? 'too_short_teach_time_sec' : 'too_short_reexamine_time_sec';
      logEvent('TUTORING',
        isLearning ? 'TOO_SHORT_TEACH' : 'TOO_SHORT_REEXAMINE',
        eventType,
        Math.round(talkDuration / 1000)
      );
      logBan(eventType);
    } else if (talkDuration < FAST_SKILL_DISCUSSION_MS) {
      if (fastDiscussedSkillsCount + 1 > MAX_FAST_DISCUSSED_SKILLS_IN_ROW_COUNT) {
        logEvent('TUTORING', 'SEVERAL_FAST_DISCUSSIONS_IN_ROW');
        setFastDiscussedSkillsCount(0);
      } else {
        setFastDiscussedSkillsCount(fastDiscussedSkillsCount + 1);
        logTime(isLearning);
        await action();
      }
    } else {
      setFastDiscussedSkillsCount(0);
      logTime(isLearning);
      await action();
    }

  }, [hasTutorCompletedTutorial, fastDiscussedSkillsCount, lastSkillDiscussedTime, showTooFastWarning]);

  useEffect(() => {
    const checkResults = async () => {
      if (lesson) {
        setIsSendingResultsEnabled(await isThereAnyLessonResult(lesson?.id));
      }
    }
    checkResults();
  }, [lesson])

  // Helper functions
  const updateAndStoreLesson = useCallback(
    async (updatedLesson: Lesson | null) => {
      if (updatedLesson) {
        const mergedLesson = isSendingResultsEnabled
          ? { ...updatedLesson, deadline: Date.now() + MAX_SAME_PARTNER_TIME_MS }
          : updatedLesson;
        await putLesson(mergedLesson);
        setLesson(mergedLesson);
        setTooFastConfirmationIsShown(false);
        setPageWasJustRefreshed(false);
        onLessonUpdate(mergedLesson, letterTemplates, reexaminations);
      }
    },
    [letterTemplates, reexaminations, setLesson, putLesson, setPageWasJustRefreshed, isSendingResultsEnabled]
  );

  const fetchLesson = useCallback(
    async function fetchLesson() {
      const lessonId = await getSetting(SettingKey.LESSON);
      const lessonResultsAreShown = await getSetting(SettingKey.LESSON_RESULTS_ARE_SHOWN);
      if (lessonId) {
        const fetchedLesson = await getLesson(lessonId);
        setLesson(fetchedLesson || null);
        setResultsShown(lessonResultsAreShown ? true : false);
        if (fetchedLesson) {
          const fetchedLetterTemplates = await getLetterTemplatesByLessonId(lessonId);
          if (fetchedLetterTemplates) {
            setLetterTemplates(fetchedLetterTemplates);
          }
          const fetchedReexaminations = await getReexaminationsByLessonId(lessonId);
          if (fetchedReexaminations) {
            setReexaminations(fetchedReexaminations);
          }
          const pseudonym = fetchedLesson ? await getPseudonym(fetchedLesson.student) : null;
          if (pseudonym) {
            setStudentName(pseudonym);
          }
          onLessonUpdate(fetchedLesson, fetchedLetterTemplates, fetchedReexaminations);
        }
      } else {
        setLesson(null);
      }
    },
    []
  );

  useEffect(() => {
    fetchLesson();
  }, []);

  const updateReexamined = useCallback(async (talkDuration: number, updater: () => Promise<void>, lastAction: TutorAction) => {
    if (lesson) {
      const nextStep = lesson.reexamineStep + 1;
      if (nextStep <= lesson.toReexamineCount) {
        const updatedLesson = { ...lesson, lastAction, reexamineStep: nextStep };
        await protectTutor(talkDuration, false, lastAction, async () => {
          await updater();
          await updateAndStoreLesson(updatedLesson);
        });
      }
    }
  }, [lesson, updateAndStoreLesson, protectTutor]);

  const updateLearned = useCallback(async (talkDuration: number, updater: () => Promise<void>, lastAction: TutorAction) => {
    if (lesson && lesson.toLearnCount > lesson.learnStep) {
      const updatedLesson = { ...lesson, lastAction, learnStep: lesson.learnStep + 1 };
      await protectTutor(talkDuration, true, lastAction, async () => {
        await updater();
        await updateAndStoreLesson(updatedLesson);
      });
    }
  }, [lesson, updateAndStoreLesson, protectTutor]);

  const onResumeTutoring = useCallback(async (lesson: Lesson) => {
    await storeSetting(SettingKey.LESSON, lesson.id);
    fetchLesson();
  }, [storeSetting, setLesson]);

  const onShowResults = useCallback(async (lesson: Lesson) => {
    await Promise.all([
      storeSetting(SettingKey.LESSON, lesson.id),
      storeSetting(SettingKey.LESSON_RESULTS_ARE_SHOWN, 'true'),
    ]);
    setLesson(lesson);
    setResultsShown(true);
  }, [storeSetting, setLesson, setResultsShown]);

  useEffect(() => {
    const run = async () => {
      if (studentReminder === null) return;

      const lesson = await getLesson(studentReminder);
      if (lesson) {
        logEvent('TUTORING', 'LESSON_RESULTS', 'lesson_results_opened_after_student_reminder');
        onShowResults(lesson);
      }
    }
    studentReminder && run();

  }, [studentReminder, onShowResults]);

  useEffect(() => {
    const run = async () => {
      if (tutorReminder === null) return;

      const lesson = await getLesson(tutorReminder);
      if (lesson) {
        logEvent('TUTORING', 'LESSON_RESULTS', 'lesson_results_opened_after_tutor_reminder');
        onShowResults(lesson);
      }
    }
    tutorReminder && run();

  }, [tutorReminder, onShowResults]);

  const onLessonUpdate = useCallback((
    updatedLesson: Lesson,
    currentletterTemplates: LetterTemplate[],
    currentReexaminations: Reexamination[]) => {
    async function run() {
      if (updatedLesson) {
        setHasTuteeUsedSlonig(currentReexaminations?.length > 0 || updatedLesson.learnStep > 0);
      }
      if (updatedLesson.reexamineStep < updatedLesson.toReexamineCount) {
        setReexamined(false);
      } else {
        setReexamined(true);
      }
      if (updatedLesson.learnStep < currentletterTemplates.length) {
        setLetterTemplateToIssue(currentletterTemplates[updatedLesson.learnStep]);
      }
      if (updatedLesson.reexamineStep < currentReexaminations.length) {
        setReexaminationToPerform(currentReexaminations[updatedLesson.reexamineStep]);
      }
    }
    run();
  }, [setReexamined, getLetter, setLetterTemplateToIssue,
    setReexaminationToPerform, onShowResults, hasTutorCompletedTutorial]);

  const onCloseTutoring = useCallback(async () => {
    await deleteSetting(SettingKey.LESSON);
    await deleteSetting(SettingKey.LAST_LESSON_ID);
    await deleteSetting(SettingKey.LAST_LESSON_START_TIME);
    await deleteSetting(SettingKey.LESSON_RESULTS_ARE_SHOWN);

    setIsPairChangeDialogueOpen(false);
    setLastSkillDiscussedTime(null);
    setFastDiscussedSkillsCount(0);
    setTooFastConfirmationIsShown(false);
    setLesson(null);
    setLessonStat(null);
    setLessonName(null);
    setIsExitConfirmOpen(false);
    setReexaminationToPerform(null);
    setLetterTemplateToIssue(null);
    setReexamined(false);
    setStudentName(null);
    setLetterTemplates([]);
    setReexaminations([]);
    setResultsShown(false);
    setIsSendingResultsEnabled(undefined);
    navigate('', { replace: true });
  }, [deleteSetting, setLesson]);

  const onCloseResults = useCallback(async () => {
    onCloseTutoring();
    await deleteSetting(SettingKey.LESSON_RESULTS_ARE_SHOWN);
    setResultsShown(false);
  }, [deleteSetting, getSetting, hasTutorCompletedTutorial, setResultsShown, onCloseTutoring]);

  const tryToCloseTutoring = useCallback((): void => {
    setIsExitConfirmOpen(true);
  }, [setIsExitConfirmOpen]);

  const logEventAndCloseTutoring = useCallback(() => {
    logEvent('TUTORING', 'EXIT_TUTORING_CONFIRMED');
    onCloseTutoring();
  }, [logEvent, onCloseTutoring]);

  const onChangePartnerConfirm = useCallback(() => {
    if (!lesson) return;
    setIsPairChangeDialogueOpen(false);
    logEvent('CLASSROOM', 'AGREE_PARTNER_CHANGE');
    if (isSendingResultsEnabled) {
      logEvent('TUTORING', 'LESSON_RESULTS', 'click_agree_to_send_results');
      onShowResults(lesson);
    } else {
      onCloseResults();
    }
  }, [setIsPairChangeDialogueOpen, logEvent, isSendingResultsEnabled, onShowResults, onCloseResults, lesson]);

  const onChangePartnerPostpone = useCallback(async () => {
    setIsPairChangeDialogueOpen(false);
    logEvent('CLASSROOM', 'POSTPONE_PARTNER_CHANGE');
    const now = (new Date()).getTime();
    await storeSetting(SettingKey.LAST_PARTNER_CHANGE_TIME, now.toString());
  }, [setIsPairChangeDialogueOpen, logEvent, storeSetting]);

  const publicKeyHex = currentPair ? u8aToHex(currentPair.publicKey) : "";

  // Don't do reexaminations if the tutor is a first time tutor
  useEffect((): void => {
    if (lesson != null) {
      if (hasTutorCompletedTutorial === false && !reexamined && reexaminationToPerform) {
        if (letterTemplateToIssue) {
          updateReexamined(0, async () => { }, undefined);
        } else {
          onCloseTutoring();
          showInfo(t('You should practice tutoring first before you can reexamine.'));
        }
      }
    }
  }, [lesson, hasTutorCompletedTutorial, reexamined, reexaminationToPerform, letterTemplateToIssue, updateReexamined]);

  useEffect(() => {
    if (lessonStat === null || lesson === null) return;
    const sumResult = lessonStat.issuedBadgeCount + lessonStat.markedForRepeatCount + lessonStat.validatedBadgesCount + lessonStat.revokedBadgesCount;
    const ended = lessonStat.learnStep === lessonStat.askedToLearn && lessonStat.reexamineStep === lessonStat.askedForReexaminations;
    if (ended) {
      if (sumResult) {
        logEvent('TUTORING', 'LESSON_RESULTS', 'lesson_auto_send_opened');
        onShowResults(lesson);
      } else {
        logEvent('TUTORING', 'EXIT_LESSON_WITH_EMPTY_RESULTS');
        onCloseTutoring();
      }
    }
  }, [lessonStat, lesson]);

  const onNewLessonRequest = useCallback(async () => {
    const requestedLessonId = await getSetting(SettingKey.LESSON);
    if (requestedLessonId) {
      await onCloseResults();
      await storeSetting(SettingKey.LESSON, requestedLessonId);
      await fetchLesson();
    }
  }, [getSetting, onCloseResults, storeSetting, fetchLesson]);

  const clock = <ClockDiv>🕑</ClockDiv>;

  const isTutorial = lesson?.cid === EXAMPLE_MODULE_KNOWLEDGE_CID;

  const reexamAndDiplomaIssuing = (blockTutoring === true && lesson?.student !== undefined) ?
    <AskToUnblockTutoring onClose={onCloseTutoring} student={lesson?.student} />
    : <FullFindow>
      <VerticalCenterItemsContainer>
        {lesson && <Progress>
          <Spacer />
          <LinearProgress total={lesson.toLearnCount + lesson.toReexamineCount} value={lesson.learnStep + lesson.reexamineStep} />
          <CloseButton onClick={tryToCloseTutoring} icon='close' />
          <Spacer />
        </Progress>}

        {isSendingResultsEnabled !== undefined && <Bubbles>
          {!reexamined && reexaminationToPerform && lesson && lessonStat &&
            <DoInstructions
              entity={reexaminationToPerform}
              lessonStat={lessonStat}
              tooFastWarning={tooFastConfirmationIsShown}
              pageWasJustRefreshed={pageWasJustRefreshed}
              lesson={lesson}
              anythingToLearn={letterTemplateToIssue !== null}
              hasTuteeUsedSlonig={hasTuteeUsedSlonig}
              hasTutorCompletedTutorial={hasTutorCompletedTutorial}
              onResult={updateReexamined}
              studentName={studentName ?? ''}
              stake={bnToSlonString(new BN(reexaminationToPerform.amount ?? 0))}
              isTutorial={isTutorial}
              isSendingResultsEnabled={isSendingResultsEnabled}
              isBeforeTeaching={letterTemplates && letterTemplates.length > 0}
              key={'reexaminine' + warningCount + reexaminationToPerform.cid + keyFromLessonStat(lessonStat)} />}
          {reexamined && letterTemplateToIssue && lesson && lessonStat &&
            <DoInstructions
              entity={letterTemplateToIssue}
              lessonStat={lessonStat}
              tooFastWarning={tooFastConfirmationIsShown}
              pageWasJustRefreshed={pageWasJustRefreshed}
              lesson={lesson}
              hasTuteeUsedSlonig={hasTuteeUsedSlonig}
              hasTutorCompletedTutorial={hasTutorCompletedTutorial}
              onResult={updateLearned}
              studentName={studentName ?? ''}
              stake={letterTemplateToIssue.mature ? bnToSlonString(new BN(lesson?.dWarranty ?? 0)) : ''}
              isTutorial={isTutorial}
              isSendingResultsEnabled={isSendingResultsEnabled}
              key={'learn' + warningCount + letterTemplateToIssue.cid + keyFromLessonStat(lessonStat)} />}
          {lesson &&
            <SendResults $blur={isSendingResultsEnabled !== true}>
              {(hasTutorCompletedTutorial === false || isTutorial) && isSendingResultsEnabled === true &&
                <HintBubble>
                  <h2>{t('Press this button to send the results and get your reward for tutoring')}</h2>
                </HintBubble>
              }
              <Button
                isDisabled={!isSendingResultsEnabled}
                icon={'paper-plane'}
                label={t('Send results and get a reward')}
                onClick={() => {
                  logEvent('TUTORING', 'LESSON_RESULTS', 'click_send_during_lesson');
                  onShowResults(lesson);
                }
                } />
              {lessonStat && isSendingResultsEnabled && hasTutorCompletedTutorial && <LessonProcessInfo lessonStat={lessonStat} showLastAction={false} />}
            </SendResults>
          }
        </Bubbles>}
      </VerticalCenterItemsContainer>
    </FullFindow>;

  return (
    <div className={`toolbox--Tutor ${className}`}>
      {
        isLoggedIn &&
        <>
          <LessonRequestReceiver setCurrentLesson={onNewLessonRequest} />
          {lesson === null ? <LessonsList tutor={publicKeyHex} onResumeTutoring={onResumeTutoring} onShowResults={onShowResults} />
            :
            <> {(areResultsShown && lessonStat) ? <LessonResults lesson={lesson} lessonStat={lessonStat} updateAndStoreLesson={updateAndStoreLesson} onClose={tryToCloseTutoring} onFinished={onCloseTutoring} /> : reexamAndDiplomaIssuing}</>
          }
          {isExitConfirmOpen && (
            <Confirmation question={t('Sure to exit tutoring?')} onClose={() => setIsExitConfirmOpen(false)} onConfirm={logEventAndCloseTutoring} />
          )}
          {isHelpQRInfoShown && (
            <OKBox info={t('Tell the tutee to scan the same QR code.')} onClose={() => setIsHelpQRInfoShown(false)} />
          )}
          {
            lesson && isPairChangeDialogueOpen && !areResultsShown && blockTutoring === undefined &&
            <Confirmation
              decorator={clock}
              question={t('It’s time to send the results and become a student of a new partner.')}
              agreeText={t('OK')}
              disagreeText={t('Postpone')}
              onClose={onChangePartnerPostpone}
              onConfirm={onChangePartnerConfirm}
            />
          }
        </>
      }
    </div>
  );
}

const SendResults = styled.div<{ $blur: boolean }>`
  position: relative; /* 🧭 important for absolute positioning of HintBubble */
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  margin-top: 10px;

    transition: filter 0.3s ease, opacity 0.3s ease;
  filter: ${({ $blur }) => ($blur ? 'blur(3px) brightness(0.7)' : 'none')};
  opacity: ${({ $blur }) => ($blur ? 0.5 : 1)};
  pointer-events: ${({ $blur }) => ($blur ? 'none' : 'auto')};
`;

const Spacer = styled.div`
  width: 20px;
`;
const ClockDiv = styled.div`
  margin: 5px;  
  width: 100%;
  font-size: 4em;
  text-align: center;
`;
const Progress = styled.div`
  margin-top: 20px;
  width: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
`;
const Bubbles = styled.div`
  text-align: center;
  width: 100%;
`;
export const CloseButton = styled(Button)`
  position: relative;
  right: 0px;
  margin-left: 10px;
`;

export default React.memo(Teach);