import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, LinearProgress, Modal, Spinner, styled } from '@polkadot/react-components';
import { FullscreenActivity, getIPFSDataFromContentID, KatexSpan, loadFromSessionStorage, parseJson, saveToSessionStorage, useIpfsContext, useSettingValue } from '@slonigiraf/slonig-components';
import { getSetting, SettingKey, storeSetting } from '@slonigiraf/db';
import type { ModelSelectorRenderer } from './modelSelector.js';
import { AlgorithmStage, StageType } from '../Teach/AlgorithmStage.js';
import { TutoringAlgorithm } from '../Teach/TutoringAlgorithm.js';
import type { Skill as TutorSkill } from '@slonigiraf/slonig-components';
import { createAiLesson, AiSkill, aiLessonId, saveAiDecision } from './lessonStore.js';
import { askOpenRouter, DEFAULT_MODEL, TutorTurn } from './openRouter.js';
import { getLesson } from '@slonigiraf/db';

export interface AiTutorSkillRef {
  id: string;
  cid: string;
}

interface Props {
  moduleId: string;
  moduleCid: string;
  skills: AiTutorSkillRef[];
  studentId: string;
  onClose: () => void;
  modelSelector?: ModelSelectorRenderer;
  persistedOpenRouterKey?: string | null;
}

const MODEL_STORAGE = 'slonig:ai-tutor:model';
const AI_TUTOR_SESSION = 'ai-tutor';

function learningStepSessionKey(lessonId: string): string {
  return `${lessonId}:learnStep`;
}

function algorithmStageSessionKey(lessonId: string, lessonStep: number): string {
  return `${lessonId}:learnStep:${lessonStep}:algorithmStage`;
}

function findStageByType(stage: AlgorithmStage | undefined, type: string | null | undefined): AlgorithmStage | undefined {
  if (!stage || !type) return undefined;

  const queue = [stage];
  const visited = new Set<AlgorithmStage>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    if (current.getType() === type) return current;
    queue.push(...current.getNext());
  }

  return undefined;
}

function skillFromJson(id: string, cid: string, json: Record<string, unknown>): AiSkill {
  const questions = Array.isArray(json.q) ? json.q : [];
  return {
    id,
    cid,
    title: typeof json.h === 'string' ? json.h : id,
    description: typeof json.d === 'string' ? json.d : undefined,
    questions: questions.flatMap((q) => {
      if (!q || typeof q !== 'object') return [];
      const item = q as Record<string, unknown>;
      return typeof item.h === 'string' && typeof item.a === 'string'
        ? [{ question: item.h, answer: item.a }]
        : [];
    }),
  };
}

function makeAlgorithmSkill(skill: AiSkill): TutorSkill {
  return {
    i: skill.id,
    h: skill.title,
    q: skill.questions.map((question) => ({ h: question.question, a: question.answer, p: '', i: '' })),
  };
}

function promptFor(skill: AiSkill, stage: AlgorithmStage, answer?: string): string {
  const messages = stage.getMessages().map((message) => [message.title, message.text, message.exercise].filter(Boolean).join(' ')).join('\n');
  const choices = stage.getNext().map((next, index) => `${index}: ${next.getType()} — ${next.getActionHint() || next.getName()}`).join('\n');

  return [
    'You are an encouraging tutor in a deliberate-practice lesson.',
    'The current stage comes from the existing TutoringAlgorithm decision tree. Judge the student answer and select exactly one of the offered next-stage indexes.',
    'The local app stores every result immediately. Never issue a badge. A completed skill is still marked for repeat.',
    'Do not invent a new exercise or rewrite the tutoring instructions. The app displays the existing TutoringAlgorithm text. Only provide learner-facing answer text when the current or selected stage is provide_fake_solution or correct_fake_solution.',
    'Return only JSON with keys: message, exercise, answer, feedback, decision, nextStage.',
    'decision must be exactly one of: continue, mastered, repeat, skip.',
    'nextStage must be an offered index, or -1 to remain on the current stage. Use skip only when the student explicitly skips.',
    `Current algorithm stage: ${stage.getType()}\nTutor instruction: ${stage.getActionHint() || 'Continue the current stage.'}\nStage messages:\n${messages}`,
    `Allowed next stages:\n${choices || '-1: remain on this stage'}`,
    `Skill: ${skill.title}\n${skill.description || ''}`,
    `Examples: ${skill.questions.map((q) => `${q.question} => ${q.answer}`).join(' | ') || 'none'}`,
    answer === undefined ? 'Start the next exercise for the student.' : `Student answer: ${answer}`,
  ].join('\n\n');
}

function stageText(stage: AlgorithmStage): string {
  return stage.getMessages()
    .filter((message) => message.title?.includes('🗣'))
    .map((message) => [message.text, message.exercise]
      .filter(Boolean)
      .join('')
      .replace(/^“\s*/, '')
      .replace(/\s*“$/, ''))
    .filter(Boolean)
    .join('\n\n');
}

function learnerFacingText(stage: AlgorithmStage, turn: TutorTurn): string {
  const staticText = stageText(stage);
  const allowsGeneratedAnswer = stage.getType() === StageType.provide_fake_solution || stage.getType() === StageType.correct_fake_solution;
  const generatedText = [turn.message, turn.feedback].filter(Boolean).join('\n\n');

  return allowsGeneratedAnswer && generatedText.trim()
    ? [staticText, generatedText].filter(Boolean).join('\n\n')
    : staticText;
}

export function AITutor({ modelSelector, moduleId, moduleCid, persistedOpenRouterKey, skills: skillRefs, studentId, onClose }: Props): React.ReactElement {
  const { ipfs, isIpfsReady } = useIpfsContext();
  const [skills, setSkills] = useState<AiSkill[]>([]);
  const [lessonStep, setLessonStep] = useState(0);
  const [isLessonLoaded, setIsLessonLoaded] = useState(false);
  const [currentAiText, setCurrentAiText] = useState('');
  const [answer, setAnswer] = useState('');
  const [turn, setTurn] = useState<TutorTurn>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const storedOpenRouterKey = useSettingValue(SettingKey.OPENROUTER_TOKEN);
  const [openRouterKey, setOpenRouterKey] = useState<string | undefined>(() => persistedOpenRouterKey || undefined);
  const [isOpenRouterKeyLoaded, setIsOpenRouterKeyLoaded] = useState(() => persistedOpenRouterKey !== undefined);
  const [keyDialogOpen, setKeyDialogOpen] = useState(() => persistedOpenRouterKey === null);
  const [keyInput, setKeyInput] = useState('');
  const [model, setModel] = useState(() => localStorage.getItem(MODEL_STORAGE) || DEFAULT_MODEL);
  const [repeatCount, setRepeatCount] = useState(0);
  const [okCount, setOkCount] = useState(0);

  const skill = skills[lessonStep];
  const lessonId = useMemo(() => aiLessonId(moduleId, studentId), [moduleId, studentId]);
  const algorithm = useMemo(() => skill ? new TutoringAlgorithm({
    canIssueBadge: false,
    hasTuteeUsedSlonig: true,
    skill: makeAlgorithmSkill(skill),
    stake: '0',
    studentName: 'student',
    t: (key, options) => options?.replace ? key.replace(/\{\{(\w+)\}\}/g, (_match: string, name: string) => String(options.replace[name] ?? '')) : key,
    variation: 'regular',
  }) : undefined, [skill]);
  const [algorithmStage, setAlgorithmStage] = useState<AlgorithmStage>();

  useEffect(() => {
    if (storedOpenRouterKey === null) return;

    setIsOpenRouterKeyLoaded(true);
    if (storedOpenRouterKey) {
      setOpenRouterKey(storedOpenRouterKey);
      setKeyDialogOpen(false);
    } else if (!openRouterKey) {
      setKeyDialogOpen(true);
    }
  }, [openRouterKey, storedOpenRouterKey]);

  useEffect(() => {
    const begin = algorithm?.getBegin();
    const storedStageType = loadFromSessionStorage(AI_TUTOR_SESSION, algorithmStageSessionKey(lessonId, lessonStep));
    setAlgorithmStage(findStageByType(begin, storedStageType) || begin);
    setCurrentAiText('');
    setTurn(undefined);
  }, [algorithm, lessonId, lessonStep]);

  useEffect(() => {
    if (!isIpfsReady || !ipfs) return;
    let cancelled = false;
    (async () => {
      try {
        const loaded = await Promise.all(skillRefs.map(async (ref) => {
          const content = await getIPFSDataFromContentID(ipfs, ref.cid, 1);
          return skillFromJson(ref.id, ref.cid, parseJson(content) as Record<string, unknown>);
        }));
        const existing = await getLesson(lessonId);
        if (!cancelled) {
          setSkills(loaded);
          const storedStep = Number(loadFromSessionStorage(AI_TUTOR_SESSION, learningStepSessionKey(lessonId)));
          const persistedStep = existing?.learnStep || 0;
          const sessionStep = Number.isInteger(storedStep) && storedStep >= 0 ? storedStep : 0;
          setLessonStep(Math.min(Math.max(sessionStep, persistedStep), loaded.length));
          setIsLessonLoaded(true);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unable to load the module skills.');
      }
    })();
    return () => { cancelled = true; };
  }, [ipfs, isIpfsReady, skillRefs, lessonId]);

  useEffect(() => {
    if (!isLessonLoaded) return;
    saveToSessionStorage(AI_TUTOR_SESSION, learningStepSessionKey(lessonId), String(lessonStep));
  }, [isLessonLoaded, lessonId, lessonStep]);

  useEffect(() => {
    if (!algorithmStage) return;
    saveToSessionStorage(AI_TUTOR_SESSION, algorithmStageSessionKey(lessonId, lessonStep), algorithmStage.getType());
  }, [algorithmStage, lessonId, lessonStep]);

  const ask = useCallback(async (studentAnswer?: string) => {
    if (!openRouterKey) {
      setKeyDialogOpen(true);
      return;
    }
    if (!skill || !algorithmStage) return;
    setLoading(true);
    setError('');
    try {
      const next = await askOpenRouter({ apiKey: openRouterKey, model: model.trim() || DEFAULT_MODEL }, promptFor(skill, algorithmStage, studentAnswer));
      const candidate = typeof next.nextStage === 'number' && next.nextStage >= 0
        ? algorithmStage.getNext()[next.nextStage]
        : undefined;
      const chosenCandidate = studentAnswer === undefined ? undefined : candidate;
      const stageToDisplay = chosenCandidate || algorithmStage;
      setCurrentAiText(learnerFacingText(stageToDisplay, next));
      setTurn(next);
      setAnswer('');
      localStorage.setItem(MODEL_STORAGE, model.trim() || DEFAULT_MODEL);

      const skipped = chosenCandidate?.getType() === StageType.skip || next.decision === 'skip';
      const completed = chosenCandidate?.getType() === StageType.next_skill || chosenCandidate?.getType() === StageType.repeat_tomorrow;

      if (completed || skipped) {
        const lesson = await createAiLesson(moduleId, moduleCid, studentId, skills);
        const updated = await saveAiDecision(lesson, lessonStep, skipped ? 'skip' : 'mark_for_repeat_crude');
        setRepeatCount((count) => count + 1);
        if (next.decision === 'mastered') setOkCount((count) => count + 1);
        setLessonStep(updated.learnStep);
        setCurrentAiText('');
        setTurn(undefined);
      } else if (chosenCandidate) {
        setAlgorithmStage(chosenCandidate);
      }
    } catch (e) {
      if (e instanceof Error && (e.message.includes('OpenRouter request failed (401)') || e.message.includes('OpenRouter request failed (403)'))) {
        setKeyInput(openRouterKey || '');
        setKeyDialogOpen(true);
        setError('The OpenRouter key was rejected. Please enter a different key.');
      } else {
        setError(e instanceof Error ? e.message : 'The AI tutor could not answer.');
      }
    } finally {
      setLoading(false);
    }
  }, [algorithmStage, lessonStep, model, moduleCid, moduleId, openRouterKey, skill, skills, studentId]);

  useEffect(() => {
    if (skill && algorithmStage && !turn && openRouterKey) void ask();
  }, [skill, algorithmStage, turn, openRouterKey, ask]);

  return (
    <FullscreenActivity captionElement={<b>AI Tutor</b>} onClose={onClose}>
      <Pane>
        <ProgressRow>
          <span>Progress</span>
          <LinearProgress value={lessonStep} total={Math.max(skills.length, 1)} />
          <span>{Math.min(lessonStep, skills.length)} / {skills.length}</span>
        </ProgressRow>
        <Settings>
          {modelSelector
            ? modelSelector(model, setModel)
            : <input aria-label='OpenRouter model' placeholder={DEFAULT_MODEL} value={model} onChange={(e) => setModel(e.target.value)} />}
          {isOpenRouterKeyLoaded && !openRouterKey && <Button label='Set OpenRouter key' onClick={() => setKeyDialogOpen(true)} />}
        </Settings>
        {error && <ErrorText>{error}</ErrorText>}
        {!skill && !error && <Spinner label='Loading skills' />}
        {skill && <>
          <SkillTitle>{skill.title}</SkillTitle>
          <Conversation>
            {currentAiText && <AiMessage><KatexSpan content={currentAiText} /></AiMessage>}
            {loading && <Spinner label='AI Tutor is thinking' />}
          </Conversation>
          <AnswerRow>
            <textarea aria-label='Student answer' value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder='Your answer…' disabled={loading} />
            <Button className='highlighted--button' label='Answer' onClick={() => void ask(answer)} isDisabled={loading || !answer.trim()} />
            <Button label='Skip skill' onClick={() => void ask('The student skips this skill.')} isDisabled={loading} />
          </AnswerRow>
        </>}
        <Stats>Marked for repeat: {repeatCount} · Correct: {okCount} · Remaining: {Math.max(skills.length - lessonStep, 0)}</Stats>
      </Pane>
      {keyDialogOpen && <Modal
        header='OpenRouter API key'
        onClose={() => setKeyDialogOpen(false)}
        size='small'
      >
        <Modal.Content>
          <p>Enter the OpenRouter key used by page-laws.</p>
          <Input
            autoFocus
            className='full'
            label='OpenRouter Token'
            onChange={setKeyInput}
            type='password'
            value={keyInput}
          />
          <Button
            className='highlighted--button'
            isDisabled={!keyInput.trim()}
            label='Save'
            onClick={async () => {
              await storeSetting(SettingKey.OPENROUTER_TOKEN, keyInput.trim());
              setOpenRouterKey(keyInput.trim());
              setKeyInput('');
              setKeyDialogOpen(false);
            }}
          />
        </Modal.Content>
      </Modal>}
    </FullscreenActivity>
  );
}

export function AITutorButton(props: Omit<Props, 'onClose' | 'persistedOpenRouterKey'>): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [persistedOpenRouterKey, setPersistedOpenRouterKey] = useState<string | null>();

  const openTutor = useCallback(async (): Promise<void> => {
    setOpening(true);

    try {
      setPersistedOpenRouterKey(await getSetting(SettingKey.OPENROUTER_TOKEN) || null);
      setOpen(true);
    } catch {
      setPersistedOpenRouterKey(null);
      setOpen(true);
    } finally {
      setOpening(false);
    }
  }, []);

  return <>
    <Button icon='robot' isDisabled={opening} label='AI Tutor' onClick={openTutor} />
    {open && persistedOpenRouterKey !== undefined && <AITutor {...props} onClose={() => setOpen(false)} persistedOpenRouterKey={persistedOpenRouterKey} />}
  </>;
}

const Pane = styled.div`width: 100%; padding: 0 20px 24px;`;
const ProgressRow = styled.div`display: flex; align-items: center; gap: 10px; margin: 10px 0 18px; .ui--Progress { flex: 1; }`;
const Settings = styled.div`display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; input { min-width: 0; flex: 1 1 180px; padding: 9px; }`;
const ErrorText = styled.div`color: #b00020; margin: 8px 0;`;
const SkillTitle = styled.h2`margin: 8px 0 14px;`;
const Conversation = styled.div`min-height: 220px; display: flex; flex-direction: column; gap: 12px;`;
const AiMessage = styled.div`align-self: flex-start; max-width: 92%; padding: 12px 15px; border-radius: 14px; background: #f4f4f4; white-space: pre-wrap; .katex { white-space: pre-wrap; }`;
const AnswerRow = styled.div`display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; textarea { flex: 1 1 100%; min-height: 72px; resize: vertical; padding: 10px; }`;
const Stats = styled.div`margin-top: 18px; color: rgb(0 0 0 / 55%); text-align: center;`;

export default React.memo(AITutorButton);
