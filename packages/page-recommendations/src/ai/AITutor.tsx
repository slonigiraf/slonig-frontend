import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, LinearProgress, Modal, Spinner, styled } from '@polkadot/react-components';
import { Bubble, Confirmation, FullFindow, getIPFSDataFromContentID, KatexSpan, loadFromSessionStorage, parseJson, ResizableImage, saveToSessionStorage, TikzEditor, useIpfsContext, useSettingValue, VerticalCenterItemsContainer } from '@slonigiraf/slonig-components';
import { clearAiTutorStudentMessages, deleteAiTutorStudentMessage, getAiTutorStudentMessage, getSetting, putAiTutorStudentMessage, SettingKey, storeSetting } from '@slonigiraf/db';
import type { AiTutorStudentMessage } from '@slonigiraf/db';
import type { ModelSelectorRenderer } from './modelSelector.js';
import { AlgorithmStage, StageType } from '../Teach/AlgorithmStage.js';
import { TutoringAlgorithm } from '../Teach/TutoringAlgorithm.js';
import type { Skill as TutorSkill } from '@slonigiraf/slonig-components';
import { createAiLesson, AiSkill, aiLessonId, resetAiLesson, saveAiDecision } from './lessonStore.js';
import { askOpenRouter, DEFAULT_MODEL, transcribeOpenRouter } from './openRouter.js';
import type { OpenRouterAttachment } from './openRouter.js';
import { getLesson } from '@slonigiraf/db';
import { decisionPrompt, formatGeneratedStageMessage, generatedStagePrompt } from './tutorPrompts.js';
import { useTranslation } from '../translate.js';

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
  onProgressChange?: () => void;
  modelSelector?: ModelSelectorRenderer;
  persistedOpenRouterKey?: string | null;
  startMode?: 'continue' | 'restart';
}

const MODEL_STORAGE = 'slonig:ai-tutor:model';
const AI_TUTOR_SESSION = 'ai-tutor';
const MAX_ATTACHMENTS = 6;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

interface ComposerAttachment {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  kind: 'image' | 'file';
}

interface SubmittedStudentMessage {
  text: string;
  attachments: ComposerAttachment[];
  hasAudio: boolean;
  audioSeconds: number;
  tikz?: string;
}

type StoredStudentMessage = AiTutorStudentMessage<SubmittedStudentMessage, OpenRouterAttachment>;

function attachmentId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isTikzCode(value: string): boolean {
  const trimmed = value.trim();

  return /\\begin\s*\{tikzpicture\}/.test(trimmed) && /\\end\s*\{tikzpicture\}/.test(trimmed);
}

function isSvgAttachment(attachment: Pick<ComposerAttachment, 'mimeType' | 'dataUrl'>): boolean {
  return attachment.mimeType.toLowerCase().startsWith('image/svg+xml')
    || attachment.dataUrl.toLowerCase().startsWith('data:image/svg+xml');
}

type Translate = ReturnType<typeof useTranslation>['t'];

function textFromDataUrl(dataUrl: string, name: string, t: Translate): string {
  const separator = dataUrl.indexOf(',');
  if (separator < 0) throw new Error(t('Unable to read SVG source from {{name}}.', { replace: { name } }));

  const metadata = dataUrl.slice(0, separator);
  const payload = dataUrl.slice(separator + 1);
  try {
    if (/;base64(?:;|$)/i.test(metadata)) {
      const binary = atob(payload);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    }
    return decodeURIComponent(payload);
  } catch {
    throw new Error(t('Unable to decode SVG source from {{name}}.', { replace: { name } }));
  }
}

function TikzPreview({ sent = false, value }: { sent?: boolean; value: string }): React.ReactElement {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<{ source: string; src?: string; error?: string }>();

  useEffect(() => {
    let cancelled = false;

    // Load the compiler only when a drawing is attached. Standalone SVGs also
    // include outlined fonts, so labels survive rendering in the image viewer.
    void import('../../../page-laws/src/Edit/TikzDisplay.js')
      .then(({ renderTikzToSvg }) => renderTikzToSvg(value))
      .then((svg) => {
        if (!cancelled) setPreview({ source: value, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` });
      })
      .catch(() => {
        if (!cancelled) setPreview({ source: value, error: t('Unable to preview TikZ drawing.') });
      });

    return () => { cancelled = true; };
  }, [t, value]);

  // Never show an older drawing while its replacement is compiling.
  const current = preview?.source === value ? preview : undefined;
  const Image = sent ? SentImage : AttachmentImage;

  if (current?.error) return <span role='status' title={current.error}>{t('TikZ preview unavailable')}</span>;

  return current?.src
    ? <Image alt={t('TikZ drawing')} src={current.src} title={t('TikZ drawing — click to enlarge')} style={{ background: 'white', objectFit: 'contain' }} />
    : <span role='status' aria-label={t('Rendering TikZ drawing')}><Spinner noLabel /></span>;
}

function fileToDataUrl(file: File, t: Translate): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error(t('Unable to read {{name}}.', { replace: { name: file.name } })));
    reader.onerror = () => reject(reader.error || new Error(t('Unable to read {{name}}.', { replace: { name: file.name } })));
    reader.readAsDataURL(file);
  });
}

function inferredFileMimeType(file: File): string {
  if (file.type) return file.type;

  const extension = file.name.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    case 'heic': return 'image/heic';
    case 'heif': return 'image/heif';
    default: return 'application/octet-stream';
  }
}

function blobToDataUrl(blob: Blob, t: Translate): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error(t('Unable to encode the question image.')));
    reader.onerror = () => reject(reader.error || new Error(t('Unable to encode the question image.')));
    reader.readAsDataURL(blob);
  });
}

function inferredImageMimeType(bytes: Uint8Array): string {
  if (bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6) {
    const header = String.fromCharCode(...bytes.slice(0, 6));
    if (header === 'GIF87a' || header === 'GIF89a') return 'image/gif';
  }
  if (bytes.length >= 12) {
    const riff = String.fromCharCode(...bytes.slice(0, 4));
    const webp = String.fromCharCode(...bytes.slice(8, 12));
    if (riff === 'RIFF' && webp === 'WEBP') return 'image/webp';
  }
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image/bmp';

  const start = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.length, 512))).trimStart().toLowerCase();
  if (start.startsWith('<svg') || (start.startsWith('<?xml') && start.includes('<svg'))) return 'image/svg+xml';

  return 'application/octet-stream';
}

function isAsyncByteIterable(value: unknown): value is AsyncIterable<Uint8Array> {
  return Boolean(value) && typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function';
}

function isByteIterable(value: unknown): value is Iterable<Uint8Array> {
  return Boolean(value) && typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] === 'function';
}

async function readIpfsBytes(ipfs: unknown, cid: string, t: Translate): Promise<Uint8Array> {
  const cat = (ipfs as { cat?: (value: string) => unknown })?.cat;
  if (typeof cat !== 'function') throw new Error(t('The IPFS client cannot read the question image.'));

  const result = await Promise.resolve(cat.call(ipfs, cid));
  if (result instanceof Uint8Array) return result;
  if (result instanceof ArrayBuffer) return new Uint8Array(result);

  const chunks: Uint8Array[] = [];
  let total = 0;
  if (isAsyncByteIterable(result)) {
    for await (const chunk of result) {
      chunks.push(chunk);
      total += chunk.byteLength;
      if (total > MAX_ATTACHMENT_BYTES) throw new Error(t('The question image is too large to send to the AI tutor.'));
    }
  } else if (isByteIterable(result)) {
    for (const chunk of result) {
      chunks.push(chunk);
      total += chunk.byteLength;
      if (total > MAX_ATTACHMENT_BYTES) throw new Error(t('The question image is too large to send to the AI tutor.'));
    }
  } else {
    throw new Error(t('The IPFS client returned an unsupported question image format.'));
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function ipfsImageToAttachment(ipfs: unknown, cid: string, name: string, t: Translate): Promise<OpenRouterAttachment> {
  const bytes = await readIpfsBytes(ipfs, cid, t);
  const mimeType = inferredImageMimeType(bytes);
  if (!mimeType.startsWith('image/')) throw new Error(t('The stored question image has an unsupported format.'));
  return {
    name,
    mimeType,
    dataUrl: await blobToDataUrl(new Blob([bytes], { type: mimeType }), t),
    kind: 'image',
  };
}

function formatRecordingTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}:${remaining.toString().padStart(2, '0')}`;
}

function modelDisplayName(value: string): string {
  const id = (value.trim() || DEFAULT_MODEL).split('/').pop() || value.trim() || DEFAULT_MODEL;
  return id
    .split('-')
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === 'gpt') return 'GPT';
      if (lower === 'ai') return 'AI';
      return /^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ')
    .replace(/^GPT (\d+(?:\.\d+)?)/, 'GPT-$1');
}

function learningStepSessionKey(lessonId: string): string {
  return `${lessonId}:learnStep`;
}

function algorithmStageSessionKey(lessonId: string, lessonStep: number): string {
  return `${lessonId}:learnStep:${lessonStep}:algorithmStage`;
}

function studentExerciseSessionKey(lessonId: string, lessonStep: number): string {
  return `${lessonId}:learnStep:${lessonStep}:studentExercise`;
}

function generatedStageTextSessionKey(lessonId: string, lessonStep: number, type: StageType): string {
  return `${lessonId}:learnStep:${lessonStep}:generated:${type}`;
}

function tutorOpenSessionKey(moduleId: string, studentId: string): string {
  return `${moduleId}:${studentId}:open`;
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
        ? [{
          question: item.h,
          answer: item.a,
          questionImageCid: typeof item.p === 'string' && item.p.trim() ? item.p : undefined,
          answerImageCid: typeof item.i === 'string' && item.i.trim() ? item.i : undefined,
        }]
        : [];
    }),
  };
}

function makeAlgorithmSkill(skill: AiSkill): TutorSkill {
  return {
    i: skill.id,
    h: skill.title,
    q: skill.questions.map((question) => ({
      h: question.question,
      a: question.answer,
      p: question.questionImageCid || '',
      i: question.answerImageCid || '',
    })),
  };
}

function stageNeedsGeneratedText(stage: AlgorithmStage): boolean {
  return stage.getType() === StageType.provide_fake_solution || stage.getType() === StageType.correct_fake_solution;
}

function isCreateSimilarExerciseStage(stage: AlgorithmStage): boolean {
  return stage.getType() === StageType.begin_ask_to_create_similar_exercise
    || stage.getType() === StageType.ask_to_create_similar_exercise
    || stage.getType() === StageType.cycle_ask_to_create_similar_exercise;
}

function stageRequiresStudentImageWhenReferenceHasImage(stage: AlgorithmStage): boolean {
  return isCreateSimilarExerciseStage(stage)
    || stage.getType() === StageType.ask_to_repeat_example_solution
    || stage.getType() === StageType.ask_to_repeat_similar_exercise;
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

function stageImageCids(stage: AlgorithmStage | undefined): string[] {
  if (!stage) return [];
  return Array.from(new Set(stage.getMessages()
    .map((message) => message.image)
    .filter((cid): cid is string => typeof cid === 'string' && Boolean(cid.trim()))));
}

function skillExerciseImageCids(skill: AiSkill | undefined): string[] {
  if (!skill) return [];
  return Array.from(new Set(skill.questions
    .map((question) => question.questionImageCid)
    .filter((cid): cid is string => typeof cid === 'string' && Boolean(cid.trim()))));
}

function imageDataUrlPayload(dataUrl: string): string {
  const separator = dataUrl.indexOf(',');
  return separator >= 0 ? dataUrl.slice(separator + 1) : dataUrl;
}

function stageUsesStudentExerciseMedia(stage: AlgorithmStage): boolean {
  return stage.getType() === StageType.provide_fake_solution
    || stage.getType() === StageType.correct_fake_solution;
}


export function AITutor({ modelSelector, moduleId, moduleCid, persistedOpenRouterKey, skills: skillRefs, startMode = 'continue', studentId, onClose }: Props): React.ReactElement {
  const { t } = useTranslation();
  const { ipfs, isIpfsReady } = useIpfsContext();
  const [skills, setSkills] = useState<AiSkill[]>([]);
  const [lessonStep, setLessonStep] = useState(0);
  const [isLessonLoaded, setIsLessonLoaded] = useState(false);
  const [currentAiText, setCurrentAiText] = useState('');
  const [studentExercise, setStudentExercise] = useState('');
  const [studentExerciseMedia, setStudentExerciseMedia] = useState<OpenRouterAttachment[]>([]);
  const [lastStudentMessage, setLastStudentMessage] = useState<SubmittedStudentMessage>();
  const [answer, setAnswer] = useState('');
  const [shouldBlurTutorReply, setShouldBlurTutorReply] = useState(false);
  const answerInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const addControlRef = useRef<HTMLDetailsElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder>();
  const mediaStreamRef = useRef<MediaStream>();
  const mediaChunksRef = useRef<Blob[]>([]);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [audioBlob, setAudioBlob] = useState<Blob>();
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [tikz, setTikz] = useState('');
  const [tikzEditorOpen, setTikzEditorOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tutorValidationMessage, setTutorValidationMessage] = useState('');
  const storedOpenRouterKey = useSettingValue(SettingKey.OPENROUTER_TOKEN);
  const [openRouterKey, setOpenRouterKey] = useState<string | undefined>(() => persistedOpenRouterKey || undefined);
  const [isOpenRouterKeyLoaded, setIsOpenRouterKeyLoaded] = useState(() => persistedOpenRouterKey !== undefined);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [model, setModel] = useState(() => localStorage.getItem(MODEL_STORAGE) || DEFAULT_MODEL);
  const [repeatCount, setRepeatCount] = useState(0);
  const [okCount, setOkCount] = useState(0);

  const skill = skills[lessonStep];
  const lessonId = useMemo(() => aiLessonId(moduleId, studentId), [moduleId, studentId]);
  const answerScope = `${lessonId}:${lessonStep}`;
  const answerScopeRef = useRef(answerScope);
  const skillRefsKey = JSON.stringify(skillRefs.map(({ id, cid }) => [id, cid]));
  const algorithm = useMemo(() => skill ? new TutoringAlgorithm({
    canIssueBadge: false,
    hasTuteeUsedSlonig: true,
    skill: makeAlgorithmSkill(skill),
    stake: '0',
    studentName: t('student'),
    t,
    variation: 'regular',
  }) : undefined, [skill, t]);
  const [algorithmStage, setAlgorithmStage] = useState<AlgorithmStage>();
  const submitInFlightRef = useRef(false);
  const stageTextRequestRef = useRef(0);
  const questionImageCacheRef = useRef(new Map<string, OpenRouterAttachment>());
  const restartHandledRef = useRef(false);
  const currentStageImageCids = useMemo(() => stageImageCids(algorithmStage), [algorithmStage]);
  const currentSkillExerciseImageCids = useMemo(() => skillExerciseImageCids(skill), [skill]);

  const loadStageImageAttachments = useCallback(async (stage: AlgorithmStage): Promise<OpenRouterAttachment[]> => {
    const cids = stageImageCids(stage);
    if (cids.length === 0) return [];
    if (!ipfs) throw new Error(t('The question image is not available yet.'));
    return Promise.all(cids.map(async (cid, index) => {
      let cached = questionImageCacheRef.current.get(cid);
      if (!cached) {
        cached = await ipfsImageToAttachment(ipfs, cid, `Tutor stage image ${index + 1}`, t);
        questionImageCacheRef.current.set(cid, cached);
      }
      return { ...cached, name: `Tutor stage image ${index + 1}` };
    }));
  }, [ipfs, t]);

  const loadSkillExerciseImageAttachments = useCallback(async (): Promise<OpenRouterAttachment[]> => {
    if (currentSkillExerciseImageCids.length === 0) return [];
    if (!ipfs) throw new Error(t('The skill exercise images are not available yet.'));

    return Promise.all(currentSkillExerciseImageCids.map(async (cid, index) => {
      let cached = questionImageCacheRef.current.get(cid);
      if (!cached) {
        cached = await ipfsImageToAttachment(ipfs, cid, `Skill exercise image ${index + 1}`, t);
        questionImageCacheRef.current.set(cid, cached);
      }
      return { ...cached, name: `Skill exercise image ${index + 1}` };
    }));
  }, [currentSkillExerciseImageCids, ipfs, t]);

  useEffect(() => {
    if (storedOpenRouterKey === null) return;

    setIsOpenRouterKeyLoaded(true);
    if (storedOpenRouterKey) {
      setOpenRouterKey(storedOpenRouterKey);
      setKeyDialogOpen(false);
    }
  }, [storedOpenRouterKey]);

  useEffect(() => {
    const begin = algorithm?.getBegin();
    if (!begin) {
      setAlgorithmStage(undefined);
      setCurrentAiText('');
      setStudentExercise('');
      setStudentExerciseMedia([]);
      setLastStudentMessage(undefined);
      return;
    }

    const savedExercise = loadFromSessionStorage(AI_TUTOR_SESSION, studentExerciseSessionKey(lessonId, lessonStep)) || '';
    const storedStageType = loadFromSessionStorage(AI_TUTOR_SESSION, algorithmStageSessionKey(lessonId, lessonStep));
    const restoredStage = findStageByType(begin, storedStageType) || begin;
    let cancelled = false;

    (async () => {
      let persistedState: StoredStudentMessage | undefined;
      if (startMode === 'continue') {
        try {
          persistedState = await getAiTutorStudentMessage<SubmittedStudentMessage, OpenRouterAttachment>(lessonId, lessonStep);
        } catch {
          // Persistence is a best-effort enhancement. A browser that disables
          // IndexedDB should still be able to use the tutor normally.
        }
      }
      if (cancelled) return;

      const persistedMessage = persistedState?.message;
      const restoredStudentExerciseMedia = savedExercise
        ? (persistedState?.studentExerciseMedia || []).map((attachment) => ({ ...attachment }))
        : [];

      // Dynamic stages require the student's own exercise and, if that exercise
      // referenced attachments, the exact submitted media. When both were
      // persisted, Continue can safely reconstruct the context after a reload.
      const savedExerciseNeedsMedia = savedExercise.includes('Attached student files:');
      const missingRequiredContext = stageNeedsGeneratedText(restoredStage)
        && (!savedExercise || (savedExerciseNeedsMedia && restoredStudentExerciseMedia.length === 0));
      const safeStage = missingRequiredContext ? begin : restoredStage;

      setStudentExercise(savedExercise);
      setStudentExerciseMedia(restoredStudentExerciseMedia);
      setLastStudentMessage(persistedMessage);
      setAlgorithmStage(safeStage);
      setCurrentAiText('');

      // Rebuilding the same logical skill can happen when parents recreate props
      // or contexts update. Do not erase text the student is currently typing in
      // that case; only clear the draft when we actually move to another skill.
      if (answerScopeRef.current !== answerScope) {
        answerScopeRef.current = answerScope;
        setAnswer('');
        setShouldBlurTutorReply(false);
        setAttachments([]);
        setAudioBlob(undefined);
        setRecordingSeconds(0);
        setTikz('');
      }
    })();

    return () => { cancelled = true; };
  }, [algorithm, answerScope, lessonId, lessonStep, startMode]);

  useEffect(() => {
    if (!isIpfsReady || !ipfs) return;
    let cancelled = false;
    (async () => {
      try {
        const stableSkillRefs = (JSON.parse(skillRefsKey) as [string, string][]).map(([id, cid]) => ({ id, cid }));
        const loaded = await Promise.all(stableSkillRefs.map(async (ref) => {
          const content = await getIPFSDataFromContentID(ipfs, ref.cid, 1);
          return skillFromJson(ref.id, ref.cid, parseJson(content) as Record<string, unknown>);
        }));
        const existing = await getLesson(lessonId);
        if (startMode === 'restart' && !restartHandledRef.current) {
          await resetAiLesson(moduleId, moduleCid, studentId, loaded);
          try {
            await clearAiTutorStudentMessages(lessonId);
          } catch {
            // Do not block Restart if persistent browser storage is unavailable.
          }
          saveToSessionStorage(AI_TUTOR_SESSION, learningStepSessionKey(lessonId), '0');
          loaded.forEach((_skill, step) => {
            saveToSessionStorage(AI_TUTOR_SESSION, algorithmStageSessionKey(lessonId, step), '');
            saveToSessionStorage(AI_TUTOR_SESSION, studentExerciseSessionKey(lessonId, step), '');
            saveToSessionStorage(AI_TUTOR_SESSION, generatedStageTextSessionKey(lessonId, step, StageType.provide_fake_solution), '');
            saveToSessionStorage(AI_TUTOR_SESSION, generatedStageTextSessionKey(lessonId, step, StageType.correct_fake_solution), '');
          });
          setStudentExerciseMedia([]);
          setLastStudentMessage(undefined);
          restartHandledRef.current = true;
        }
        if (!cancelled) {
          setSkills(loaded);
          if (startMode === 'restart') {
            setLessonStep(0);
          } else {
            const storedStep = Number(loadFromSessionStorage(AI_TUTOR_SESSION, learningStepSessionKey(lessonId)));
            const persistedStep = existing?.learnStep || 0;
            const sessionStep = Number.isInteger(storedStep) && storedStep >= 0 ? storedStep : 0;
            setLessonStep(Math.min(Math.max(sessionStep, persistedStep), loaded.length));
          }
          setIsLessonLoaded(true);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t('Unable to load the module skills.'));
      }
    })();
    return () => { cancelled = true; };
  // Depend on the refs' content rather than the array identity. Some callers
  // recreate `skillRefs` on render; re-fetching in that case rebuilt the
  // algorithm and could reset transient UI state while the student was typing.
  }, [ipfs, isIpfsReady, skillRefsKey, lessonId, moduleCid, moduleId, startMode, studentId, t]);

  useEffect(() => {
    if (!isLessonLoaded) return;
    saveToSessionStorage(AI_TUTOR_SESSION, learningStepSessionKey(lessonId), String(lessonStep));
  }, [isLessonLoaded, lessonId, lessonStep]);

  useEffect(() => {
    if (!algorithmStage) return;
    saveToSessionStorage(AI_TUTOR_SESSION, algorithmStageSessionKey(lessonId, lessonStep), algorithmStage.getType());
  }, [algorithmStage, lessonId, lessonStep]);

  const generateStageText = useCallback(async (stage: AlgorithmStage, requestId: number): Promise<void> => {
    if (!skill || !stageNeedsGeneratedText(stage)) return;

    const saved = loadFromSessionStorage(
      AI_TUTOR_SESSION,
      generatedStageTextSessionKey(lessonId, lessonStep, stage.getType()),
    );
    if (saved) {
      if (stageTextRequestRef.current === requestId) setCurrentAiText(saved);
      return;
    }

    if (!studentExercise) {
      setError(t('The student-created exercise is missing. This skill was restarted so the tutor does not invent one.'));
      setAlgorithmStage(algorithm?.getBegin());
      return;
    }

    const sourceQuestionRequiresImage = Boolean(skill.questions[0]?.questionImageCid);
    const studentExerciseReferencesMedia = studentExercise.includes('Attached student files:');
    const studentExerciseHasTikz = isTikzCode(studentExercise);
    if ((studentExerciseReferencesMedia && studentExerciseMedia.length === 0)
      || (sourceQuestionRequiresImage && studentExerciseMedia.length === 0 && !studentExerciseHasTikz)) {
      setError(t('The student-created exercise media is no longer available. Please create the similar exercise again so the AI tutor can inspect it.'));
      setAlgorithmStage(algorithm?.getBegin());
      return;
    }

    if (!openRouterKey) {
      setKeyDialogOpen(true);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const generated = await askOpenRouter(
        { apiKey: openRouterKey, model: model.trim() || DEFAULT_MODEL },
        generatedStagePrompt(skill, stage, studentExercise),
        undefined,
        studentExerciseMedia,
      );
      const generatedMessage = generated.message.trim();
      if (!generatedMessage) throw new Error(t('The AI tutor returned no stage text.'));
      const text = formatGeneratedStageMessage(stage, generatedMessage);

      if (stageTextRequestRef.current !== requestId) return;

      setCurrentAiText(text);
      saveToSessionStorage(
        AI_TUTOR_SESSION,
        generatedStageTextSessionKey(lessonId, lessonStep, stage.getType()),
        text,
      );
      localStorage.setItem(MODEL_STORAGE, model.trim() || DEFAULT_MODEL);
    } catch (e) {
      if (stageTextRequestRef.current !== requestId) return;
      if (e instanceof Error && (e.message.includes('OpenRouter request failed (401)') || e.message.includes('OpenRouter request failed (403)'))) {
        setKeyInput(openRouterKey || '');
        setKeyDialogOpen(true);
        setError(t('The OpenRouter key was rejected. Please enter a different key.'));
      } else {
        setError(e instanceof Error ? e.message : t('The AI tutor could not prepare this programmed stage.'));
      }
    } finally {
      if (stageTextRequestRef.current === requestId) setLoading(false);
    }
  }, [algorithm, lessonId, lessonStep, model, openRouterKey, skill, studentExercise, studentExerciseMedia, t]);

  useEffect(() => {
    if (!skill || !algorithmStage) return;

    const requestId = ++stageTextRequestRef.current;
    if (stageNeedsGeneratedText(algorithmStage)) {
      void generateStageText(algorithmStage, requestId);
    } else {
      // This is the normal path: TutoringAlgorithm already contains the words
      // a human tutor should say, so render them instantly with no AI call.
      setCurrentAiText(stageText(algorithmStage));
    }
  }, [skill, algorithmStage, generateStageText]);

  const resetComposer = useCallback((): void => {
    setAnswer('');
    setShouldBlurTutorReply(false);
    setAttachments([]);
    setAudioBlob(undefined);
    setRecordingSeconds(0);
    setTikz('');
  }, []);

  const addFiles = useCallback(async (files: File[]): Promise<void> => {
    if (files.length === 0) return;
    setError('');

    const room = Math.max(MAX_ATTACHMENTS - attachments.length, 0);
    if (room === 0) {
      setError(t('You can attach up to {{count}} files at a time.', { replace: { count: MAX_ATTACHMENTS } }));
      return;
    }

    const selected = files.slice(0, room);
    const tooLarge = selected.find((file) => file.size > MAX_ATTACHMENT_BYTES);
    if (tooLarge) {
      setError(t('{{name}} is too large. Keep each attachment under 20 MB.', { replace: { name: tooLarge.name } }));
      return;
    }

    try {
      const next = await Promise.all(selected.map(async (file): Promise<ComposerAttachment> => {
        const mimeType = inferredFileMimeType(file);
        return {
          id: attachmentId(),
          name: file.name,
          mimeType,
          dataUrl: await fileToDataUrl(file, t),
          kind: mimeType.startsWith('image/') ? 'image' : 'file',
        };
      }));

      const imageAttachments = next.filter((attachment) => attachment.kind === 'image');
      const exerciseImages = imageAttachments.length > 0
        ? await loadSkillExerciseImageAttachments()
        : [];
      const exerciseImagePayloads = new Set(exerciseImages.map(({ dataUrl }) => imageDataUrlPayload(dataUrl)));
      const duplicateImages = imageAttachments.filter(({ dataUrl }) => exerciseImagePayloads.has(imageDataUrlPayload(dataUrl)));
      const duplicateIds = new Set(duplicateImages.map(({ id }) => id));
      const allowed = next.filter(({ id }) => !duplicateIds.has(id));

      if (allowed.length > 0) {
        setAttachments((current) => [...current, ...allowed].slice(0, MAX_ATTACHMENTS));
      }
      if (duplicateImages.length > 0) {
        setTutorValidationMessage(t('You attached some of mine images, you need to create your own'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Unable to attach that file.'));
    }
  }, [attachments.length, loadSkillExerciseImageAttachments, t]);

  const removeAttachment = useCallback((id: string): void => {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }, []);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.stop();
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const stopRecording = useCallback((): void => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
    setRecording(false);
  }, []);

  const startRecording = useCallback(async (): Promise<void> => {
    if (loading) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError(t('Audio recording is not supported by this browser.'));
      return;
    }

    setError('');
    setAudioBlob(undefined);
    setRecordingSeconds(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const candidates = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
      const mimeType = candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) mediaChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(mediaChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size > 0) setAudioBlob(blob);
        mediaChunksRef.current = [];
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = undefined;
        mediaRecorderRef.current = undefined;
        setRecording(false);
      };

      recorder.start();
      setRecording(true);
    } catch (e) {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = undefined;
      setError(e instanceof Error ? e.message : t('Unable to access the microphone.'));
    }
  }, [loading, t]);

  const finishSkill = useCallback(async (action: 'skip' | 'mark_for_repeat_crude', countedCorrect: boolean): Promise<void> => {
    const lesson = await createAiLesson(moduleId, moduleCid, studentId, skills);
    const updated = await saveAiDecision(lesson, lessonStep, action);
    try {
      await deleteAiTutorStudentMessage(lessonId, lessonStep);
    } catch {
      // Lesson progress is authoritative; persistence cleanup must not block it.
    }
    setRepeatCount((count) => count + 1);
    if (countedCorrect) setOkCount((count) => count + 1);
    // Clear the previous skill's stage in the same render as the step change so
    // the persistence effect cannot briefly save that stage under the new skill.
    setAlgorithmStage(undefined);
    setLessonStep(updated.learnStep);
    setCurrentAiText('');
    setStudentExerciseMedia([]);
    setLastStudentMessage(undefined);
    resetComposer();
  }, [lessonId, lessonStep, moduleCid, moduleId, resetComposer, skills, studentId]);

  const submitAnswer = useCallback(async (): Promise<void> => {
    // React state updates are asynchronous, so `loading` alone cannot prevent two
    // rapid Enter/click events from starting concurrent decisions for one stage.
    if (!skill || !algorithmStage || recording || submitInFlightRef.current) return;
    if (!answer.trim() && attachments.length === 0 && !audioBlob && !tikz) return;

    if (stageUsesStudentExerciseMedia(algorithmStage)
      && studentExercise.includes('Attached student files:')
      && studentExerciseMedia.length === 0) {
      setStudentExercise('');
      saveToSessionStorage(AI_TUTOR_SESSION, studentExerciseSessionKey(lessonId, lessonStep), '');
      setCurrentAiText('');
      setAlgorithmStage(algorithm?.getBegin());
      setError(t('The student-created exercise media is no longer available. Please create the similar exercise again so the AI tutor can inspect it.'));
      return;
    }

    // Keep the current tutor instruction blurred while the answer is being
    // validated/classified. Only a successful tutor result resets the composer
    // (and therefore removes the blur); validation/API errors leave it blurred.

    const submittedMessage: SubmittedStudentMessage = {
      text: answer.trim(),
      attachments: attachments.map((attachment) => ({ ...attachment })),
      hasAudio: Boolean(audioBlob),
      audioSeconds: recordingSeconds,
      tikz: tikz || undefined,
    };

    // Visual create-similar and "Repeat after me" stages require the student
    // to submit either an image or a TikZ drawing. Reject text-only, voice-only, and
    // non-image-file-only attempts locally so they do not consume either a
    // transcription request or a tutor decision request. Keep the draft intact
    // so the student can attach an image and submit again.
    const referenceRequiresStudentImage = stageRequiresStudentImageWhenReferenceHasImage(algorithmStage)
      && stageImageCids(algorithmStage).length > 0;
    const studentHasVisual = attachments.some((attachment) => attachment.kind === 'image') || isTikzCode(tikz);
    if (referenceRequiresStudentImage && !studentHasVisual) {
      setTutorValidationMessage(t('You forgot to attach an image or add a drawing.'));
      return;
    }

    setTutorValidationMessage('');

    if (!openRouterKey) {
      setKeyDialogOpen(true);
      return;
    }

    const previousStudentMessage = lastStudentMessage;
    let composerCommitted = false;

    submitInFlightRef.current = true;
    setLastStudentMessage(submittedMessage);
    setLoading(true);
    setError('');
    try {
      const audioTranscript = audioBlob
        ? await transcribeOpenRouter({ apiKey: openRouterKey }, audioBlob)
        : '';
      const typedAnswer = answer.trim();
      const svgAttachments = attachments.filter(isSvgAttachment);
      const mediaAttachments = attachments.filter((attachment) => !isSvgAttachment(attachment));
      const attachmentSummary = mediaAttachments.length > 0
        ? `Attached student files: ${mediaAttachments.map((attachment) => attachment.name).join(', ')}.`
        : '';
      const svgSummaries = svgAttachments.map((attachment) =>
        `Student SVG drawing (${attachment.name}):\n${textFromDataUrl(attachment.dataUrl, attachment.name, t)}`);
      const tikzSummary = tikz ? `Student TikZ drawing:\n${tikz}` : '';
      const studentAnswer = [typedAnswer, audioTranscript, attachmentSummary, ...svgSummaries, tikzSummary]
        .filter(Boolean)
        .join('\n\n');
      const studentMedia: OpenRouterAttachment[] = mediaAttachments.map(({ name, mimeType, dataUrl, kind }) => ({
        name: `Current student response: ${name}`,
        mimeType,
        dataUrl,
        kind,
      }));
      const tutorStageMedia = await loadStageImageAttachments(algorithmStage);
      const exerciseMedia = stageUsesStudentExerciseMedia(algorithmStage)
        ? studentExerciseMedia
        : [];
      const media = [...tutorStageMedia, ...exerciseMedia, ...studentMedia];

      const result = await askOpenRouter(
        { apiKey: openRouterKey, model: model.trim() || DEFAULT_MODEL },
        decisionPrompt(
          skill,
          algorithmStage,
          studentAnswer,
          currentAiText,
          studentExercise,
          studentMedia.filter((attachment) => attachment.kind === 'image').length + svgAttachments.length + (tikz ? 1 : 0),
        ),
        undefined,
        media,
        'nextStage',
      );

      const index = result.nextStage;
      const candidate = typeof index === 'number' && Number.isInteger(index)
        ? algorithmStage.getNext()[index]
        : undefined;
      if (!candidate) {
        throw new Error(t('The AI tutor did not choose one of the programmed TutoringAlgorithm branches.'));
      }

      localStorage.setItem(MODEL_STORAGE, model.trim() || DEFAULT_MODEL);

      const finishesSkill = candidate.getType() === StageType.skip
        || candidate.getType() === StageType.next_skill
        || candidate.getType() === StageType.repeat_tomorrow;
      const capturedStudentExerciseMedia = isCreateSimilarExerciseStage(algorithmStage)
        && candidate.getType() === StageType.provide_fake_solution
        ? studentMedia.map((attachment, index) => ({
          ...attachment,
          name: `Student-created exercise ${attachment.kind} ${index + 1}: ${attachment.name.replace(/^Current student response: /, '')}`,
        }))
        : studentExerciseMedia;
      if (!finishesSkill) {
        try {
          // Await the durable write before changing stages. Otherwise the stage
          // restoration effect could race ahead after a close/reopen or reload.
          await putAiTutorStudentMessage(lessonId, lessonStep, submittedMessage, capturedStudentExerciseMedia);
        } catch {
          // Keep tutoring functional in private/restricted browser modes where
          // IndexedDB may be unavailable or out of quota.
        }
      }

      resetComposer();
      composerCommitted = true;

      if (isCreateSimilarExerciseStage(algorithmStage) && candidate.getType() === StageType.provide_fake_solution) {
        // This exact student-created exercise is the subject of the next two
        // dynamic stages. Persist it so refreshes do not make the tutor invent a replacement.
        setStudentExercise(studentAnswer);
        setStudentExerciseMedia(capturedStudentExerciseMedia);
        saveToSessionStorage(AI_TUTOR_SESSION, studentExerciseSessionKey(lessonId, lessonStep), studentAnswer);
        saveToSessionStorage(AI_TUTOR_SESSION, generatedStageTextSessionKey(lessonId, lessonStep, StageType.provide_fake_solution), '');
        saveToSessionStorage(AI_TUTOR_SESSION, generatedStageTextSessionKey(lessonId, lessonStep, StageType.correct_fake_solution), '');
      }

      if (candidate.getType() === StageType.skip) {
        await finishSkill('skip', false);
        return;
      }

      if (candidate.getType() === StageType.next_skill || candidate.getType() === StageType.repeat_tomorrow) {
        await finishSkill('mark_for_repeat_crude', candidate.getType() === StageType.next_skill);
        return;
      }

      if (candidate === algorithmStage) {
        // Human Lesson shows the same programmed instruction again when the
        // tutor presses the button that loops to the same stage. Keep that text;
        // importantly, do not substitute AI feedback.
        if (!stageNeedsGeneratedText(candidate)) setCurrentAiText(stageText(candidate));
        return;
      }

      setCurrentAiText('');
      setAlgorithmStage(candidate);
    } catch (e) {
      if (!composerCommitted) setLastStudentMessage(previousStudentMessage);
      if (e instanceof Error && (e.message.includes('OpenRouter request failed (401)') || e.message.includes('OpenRouter request failed (403)'))) {
        setKeyInput(openRouterKey || '');
        setKeyDialogOpen(true);
        setError(t('The OpenRouter key was rejected. Please enter a different key.'));
      } else {
        setError(e instanceof Error ? e.message : t('The AI tutor could not classify the student response.'));
      }
    } finally {
      submitInFlightRef.current = false;
      setLoading(false);
    }
  }, [algorithm, algorithmStage, answer, attachments, audioBlob, currentAiText, finishSkill, lastStudentMessage, lessonId, lessonStep, loadStageImageAttachments, model, openRouterKey, recording, recordingSeconds, resetComposer, skill, studentExercise, studentExerciseMedia, t, tikz]);

  const resizeAnswerInput = useCallback((element: HTMLTextAreaElement | null): void => {
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 220)}px`;
  }, []);

  useEffect(() => {
    resizeAnswerInput(answerInputRef.current);
  }, [answer, loading, resizeAnswerInput]);

  useEffect(() => {
    setTutorValidationMessage('');
  }, [algorithmStage]);

  useEffect(() => {
    if (!skill || loading || recording || keyDialogOpen) return;

    // Programmed stages can render immediately and generated stages render after
    // an async request. In both cases, return keyboard focus to the composer once
    // the tutor has presented the next message.
    const frame = window.requestAnimationFrame(() => {
      answerInputRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [algorithmStage, currentAiText, keyDialogOpen, loading, recording, skill]);

  const skipSkill = useCallback(async (): Promise<void> => {
    if (!skill || loading || recording || submitInFlightRef.current) return;
    setLoading(true);
    setError('');
    try {
      // Skipping is a deterministic lesson action; no AI call is needed.
      await finishSkill('skip', false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Unable to skip this skill.'));
    } finally {
      setLoading(false);
    }
  }, [finishSkill, loading, recording, skill, t]);

  const canSubmit = !loading
    && !recording
    && Boolean(answer.trim() || attachments.length > 0 || audioBlob || tikz);
  const isTypingReply = shouldBlurTutorReply;

  return (
    <FullFindow>
      <TutorContainer>
        <Progress>
          <Spacer />
          <LinearProgress total={Math.max(skills.length, 1)} value={Math.min(lessonStep, skills.length)} />
          <CloseButton onClick={onClose} icon='close' />
          <Spacer />
        </Progress>
        <Pane>
          {isOpenRouterKeyLoaded && !openRouterKey && <KeySettings><Button label={t('Set OpenRouter key')} onClick={() => setKeyDialogOpen(true)} /></KeySettings>}
          {error && <ErrorText>{error}</ErrorText>}
          {!skill && !error && <Spinner label={t('Loading skills')} />}
          {skill && <>
            <Conversation>
              {lastStudentMessage && <StudentMessage>
                <StudentBubble>
                  <MessageRole>{t('You')}</MessageRole>
                  {lastStudentMessage.text && <MessageBody><KatexSpan content={lastStudentMessage.text} /></MessageBody>}
                  {(lastStudentMessage.attachments.length > 0 || lastStudentMessage.hasAudio || lastStudentMessage.tikz) && <SentMedia>
                    {lastStudentMessage.attachments.map((attachment) => attachment.kind === 'image'
                      ? <SentImage key={attachment.id} src={attachment.dataUrl} alt={attachment.name} title={attachment.name} />
                      : <SentFile key={attachment.id}>▤ {attachment.name}</SentFile>)}
                    {lastStudentMessage.hasAudio && <SentFile>● {t('Voice message')} · {formatRecordingTime(lastStudentMessage.audioSeconds)}</SentFile>}
                    {lastStudentMessage.tikz && <TikzPreview sent value={lastStudentMessage.tikz} />}
                  </SentMedia>}
                </StudentBubble>
              </StudentMessage>}
              {!loading && (currentAiText || currentStageImageCids.length > 0) && <TutorMessage>
                <TutorBubble className={isTypingReply ? 'is-replying' : ''}>
                  <MessageRole>{t('AI Tutor')}</MessageRole>
                  {currentAiText && <MessageBody><KatexSpan content={currentAiText} /></MessageBody>}
                  {currentStageImageCids.map((cid, index) => <QuestionImage key={`${cid}-${index}`}>
                    <ResizableImage cid={cid} />
                  </QuestionImage>)}
                </TutorBubble>
              </TutorMessage>}
              {!loading && tutorValidationMessage && <TutorMessage>
                <TutorBubble>
                  <MessageRole>{t('AI Tutor')}</MessageRole>
                  <MessageBody><KatexSpan content={tutorValidationMessage} /></MessageBody>
                </TutorBubble>
              </TutorMessage>}
              {loading && <TutorMessage>
                <ThinkingIndicator><Spinner noLabel /></ThinkingIndicator>
              </TutorMessage>}
            </Conversation>
            <ComposerDock>
              <Composer className={loading ? 'is-disabled' : ''} aria-disabled={loading}>
                <ComposerTextarea
                  ref={answerInputRef}
                  aria-label={t('Student answer')}
                  rows={1}
                  value={loading ? '' : answer}
                  onChange={(e) => {
                    setAnswer(e.target.value);
                    setShouldBlurTutorReply(e.target.value.length > 0);
                    resizeAnswerInput(e.currentTarget);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
                    e.preventDefault();
                    if (canSubmit) void submitAnswer();
                  }}
                  placeholder={t('Type your answer')}
                  disabled={loading}
                />
                {!loading && (attachments.length > 0 || audioBlob || recording || tikz) && <AttachmentTray>
                  {attachments.map((attachment) => <AttachmentChip key={attachment.id}>
                    {attachment.kind === 'image'
                      ? <AttachmentImage src={attachment.dataUrl} alt={t('Preview of {{name}}', { replace: { name: attachment.name } })} title={attachment.name} />
                      : <AttachmentFileIcon aria-hidden='true'>▤</AttachmentFileIcon>}
                    <AttachmentLabel title={attachment.name}>{attachment.name}</AttachmentLabel>
                    <RemoveAttachmentButton
                      type='button'
                      aria-label={t('Remove {{name}}', { replace: { name: attachment.name } })}
                      onClick={() => removeAttachment(attachment.id)}
                    >×</RemoveAttachmentButton>
                  </AttachmentChip>)}
                  {recording && <AudioChip className='recording'>
                    <RecordingDot aria-hidden='true' />
                    <AttachmentLabel>{t('Recording')} {formatRecordingTime(recordingSeconds)}</AttachmentLabel>
                    <AudioStopButton type='button' onClick={stopRecording}>{t('Stop')}</AudioStopButton>
                  </AudioChip>}
                  {audioBlob && !recording && <AudioChip>
                    <MicMini aria-hidden='true'>●</MicMini>
                    <AttachmentLabel>{t('Voice message')} · {formatRecordingTime(recordingSeconds)}</AttachmentLabel>
                    <RemoveAttachmentButton type='button' aria-label={t('Remove voice message')} onClick={() => {
                      setAudioBlob(undefined);
                      setRecordingSeconds(0);
                    }}>×</RemoveAttachmentButton>
                  </AudioChip>}
                  {tikz && <AttachmentChip>
                    <TikzPreview value={tikz} />
                    <AttachmentLabel title={tikz}>{t('TikZ drawing')}</AttachmentLabel>
                    <RemoveAttachmentButton type='button' aria-label={t('Remove TikZ drawing')} onClick={() => setTikz('')}>×</RemoveAttachmentButton>
                  </AttachmentChip>}
                </AttachmentTray>}
                <ComposerFooter>
                  <ComposerTools>
                    <AddControl ref={addControlRef}>
                      <AddControlSummary aria-label={t('Add to reply')} title={t('Add to reply')}>+</AddControlSummary>
                      <AddMenu>
                        <AddMenuButton type='button' onClick={() => {
                          if (addControlRef.current) addControlRef.current.open = false;
                          fileInputRef.current?.click();
                        }}>
                          <MenuGlyph aria-hidden='true'>⌁</MenuGlyph>
                          <span>{t('Add photos & files')}</span>
                        </AddMenuButton>
                        <AddMenuButton type='button' onClick={() => {
                          if (addControlRef.current) addControlRef.current.open = false;
                          cameraInputRef.current?.click();
                        }}>
                          <MenuGlyph aria-hidden='true'>▣</MenuGlyph>
                          <span>{t('Take a photo')}</span>
                        </AddMenuButton>
                        <AddMenuButton type='button' disabled={loading} onClick={() => {
                          if (addControlRef.current) addControlRef.current.open = false;
                          setTikzEditorOpen(true);
                        }}>
                          <MenuGlyph aria-hidden='true'>✎</MenuGlyph>
                          <span>{t('Draw image')}</span>
                        </AddMenuButton>
                      </AddMenu>
                    </AddControl>
                    <HiddenFileInput
                      ref={fileInputRef}
                      type='file'
                      multiple
                      onChange={(e) => {
                        const files = Array.from(e.currentTarget.files || []);
                        e.currentTarget.value = '';
                        void addFiles(files);
                      }}
                    />
                    <HiddenFileInput
                      ref={cameraInputRef}
                      type='file'
                      accept='image/*'
                      capture='environment'
                      onChange={(e) => {
                        const files = Array.from(e.currentTarget.files || []);
                        e.currentTarget.value = '';
                        void addFiles(files);
                      }}
                    />
                  </ComposerTools>
                  <ComposerActions>
                    <SkipAction
                      type='button'
                      aria-label={t('Skip skill')}
                      title={t('Skip skill')}
                      disabled={loading || recording}
                      onClick={() => void skipSkill()}
                    >
                      <span>{t('Skip')}</span>
                    </SkipAction>
                    <ModelControl>
                      <ModelControlSummary aria-label={t('AI model: {{model}}', { replace: { model: modelDisplayName(model) } })}>
                        <ModelName>{modelDisplayName(model)}</ModelName>
                        <Chevron aria-hidden='true' />
                      </ModelControlSummary>
                      <ModelControlMenu>
                        {modelSelector
                          ? modelSelector(model, setModel)
                          : <label>
                            <span>{t('AI tutor model')}</span>
                            <input aria-label={t('OpenRouter model')} placeholder={DEFAULT_MODEL} value={model} onChange={(e) => setModel(e.target.value)} />
                          </label>}
                      </ModelControlMenu>
                    </ModelControl>
                    <AudioButton
                      type='button'
                      className={recording ? 'recording' : ''}
                      aria-label={recording ? t('Stop recording') : t('Record voice answer')}
                      title={recording ? t('Stop recording') : t('Record voice answer')}
                      disabled={loading}
                      onClick={() => recording ? stopRecording() : void startRecording()}
                    >
                      {recording
                        ? <StopGlyph aria-hidden='true' />
                        : <svg aria-hidden='true' viewBox='0 0 24 24'>
                          <path d='M12 15.5a3.5 3.5 0 0 0 3.5-3.5V6a3.5 3.5 0 1 0-7 0v6a3.5 3.5 0 0 0 3.5 3.5Z' />
                          <path d='M5.5 11.5v.5a6.5 6.5 0 0 0 13 0v-.5M12 18.5V22M9 22h6' />
                        </svg>}
                    </AudioButton>
                    <SendButton
                      type='button'
                      aria-label={t('Send answer')}
                      title={t('Send answer (Enter)')}
                      disabled={!canSubmit}
                      onClick={() => void submitAnswer()}
                    >
                      ↑
                    </SendButton>
                  </ComposerActions>
                </ComposerFooter>
              </Composer>
              <ComposerMeta>
                <ComposerHint>{t('Enter to send · Shift+Enter for a new line')}</ComposerHint>
              </ComposerMeta>
            </ComposerDock>
          </>}
        </Pane>
      </TutorContainer>
      {keyDialogOpen && <Modal
        header={t('OpenRouter API key')}
        onClose={() => setKeyDialogOpen(false)}
        size='small'
      >
        <Modal.Content>
          <p>{t('Enter the OpenRouter key used by page-laws.')}</p>
          <Input
            autoFocus
            className='full'
            label={t('OpenRouter Token')}
            onChange={setKeyInput}
            type='password'
            value={keyInput}
          />
          <Button
            className='highlighted--button'
            isDisabled={!keyInput.trim()}
            label={t('Save')}
            onClick={async () => {
              await storeSetting(SettingKey.OPENROUTER_TOKEN, keyInput.trim());
              setOpenRouterKey(keyInput.trim());
              setKeyInput('');
              setKeyDialogOpen(false);
            }}
          />
        </Modal.Content>
      </Modal>}
      {tikzEditorOpen && <TikzEditor
        ariaLabel={t('Student drawing TikZ editor')}
        onCancel={() => setTikzEditorOpen(false)}
        onSave={(source) => {
          if (!isTikzCode(source)) throw new Error(t('The drawing must contain one complete tikzpicture environment.'));
          setTikz(source);
          setTutorValidationMessage('');
        }}
        onSaved={() => setTikzEditorOpen(false)}
        title={t('Draw image')}
        value={tikz}
      />}
    </FullFindow>
  );
}

export function AITutorButton(props: Omit<Props, 'onClose' | 'persistedOpenRouterKey' | 'startMode'>): React.ReactElement {
  const { t } = useTranslation();
  const openSessionKey = tutorOpenSessionKey(props.moduleId, props.studentId);
  const [open, setOpen] = useState(() => loadFromSessionStorage(AI_TUTOR_SESSION, openSessionKey) === 'true');
  const [opening, setOpening] = useState(false);
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [startMode, setStartMode] = useState<'continue' | 'restart'>('continue');
  const [persistedOpenRouterKey, setPersistedOpenRouterKey] = useState<string | null>();

  useEffect(() => {
    if (!open || persistedOpenRouterKey !== undefined) return;
    let cancelled = false;

    (async () => {
      setOpening(true);
      try {
        const key = await getSetting(SettingKey.OPENROUTER_TOKEN) || null;
        if (!cancelled) setPersistedOpenRouterKey(key);
      } catch {
        if (!cancelled) setPersistedOpenRouterKey(null);
      } finally {
        if (!cancelled) setOpening(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, persistedOpenRouterKey]);

  const openTutor = useCallback(async (mode: 'continue' | 'restart'): Promise<void> => {
    setStartDialogOpen(false);
    setOpening(true);

    try {
      setPersistedOpenRouterKey(await getSetting(SettingKey.OPENROUTER_TOKEN) || null);
    } catch {
      setPersistedOpenRouterKey(null);
    } finally {
      setStartMode(mode);
      saveToSessionStorage(AI_TUTOR_SESSION, openSessionKey, 'true');
      setOpen(true);
      setOpening(false);
    }
  }, [openSessionKey]);

  const closeTutor = useCallback((): void => {
    saveToSessionStorage(AI_TUTOR_SESSION, openSessionKey, 'false');
    setOpen(false);
    props.onProgressChange?.();
  }, [openSessionKey, props.onProgressChange]);

  return <>
    <Button icon='robot' isDisabled={opening} label={t('AI Tutor')} onClick={() => setStartDialogOpen(true)} />
    {startDialogOpen && <Confirmation
      agreeText={t('Continue')}
      disagreeText={t('Restart')}
      onClose={() => void openTutor('restart')}
      onConfirm={() => void openTutor('continue')}
      question={t('Continue the previous lesson?')}
    />}
    {open && persistedOpenRouterKey !== undefined && <AITutor {...props} onClose={closeTutor} persistedOpenRouterKey={persistedOpenRouterKey} startMode={startMode} />}
  </>;
}

const TutorContainer = styled(VerticalCenterItemsContainer)`
  min-height: 100dvh;
  box-sizing: border-box;
  justify-content: flex-start;
`;
const Progress = styled.div`
  margin-top: 20px;
  width: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  position: relative;

  .ui--Progress {
    width: 100%;
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
  }

  /* FullscreenActivity made this caption inherit a bold header weight. Keep
     the progress text identical to Teach/index.tsx instead. */
  .ui--Progress, .ui--Progress * {
    font-weight: 400 !important;
  }
`;
const Spacer = styled.div`width: 20px; flex: 0 0 20px;`;
const CloseButton = styled(Button)`
  position: relative;
  right: 0;
  margin-left: 10px;
`;
const Pane = styled.div`
  width: 100%;
  min-height: calc(100dvh - 82px);
  padding: 0 0 18px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
`;
const KeySettings = styled.div`display: flex; justify-content: flex-end; margin-bottom: 12px;`;
const ErrorText = styled.div`color: #b00020; margin: 8px 0;`;
const Conversation = styled.div`
  width: 100%;
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 18px 14px 12px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 22px;
`;
const MessageBase = styled.div`
  width: 100%;
  display: flex;
  box-sizing: border-box;
  white-space: pre-wrap;

  .katex { white-space: pre-wrap; }
`;
const TutorMessage = styled(MessageBase)`
  justify-content: flex-start;
`;
const StudentMessage = styled(MessageBase)`
  justify-content: flex-end;
`;
const MessageBubble = styled(Bubble)`
  width: fit-content;
  min-width: 0;
  max-width: min(78%, 720px);
  margin: 0;
  box-sizing: border-box;
  overflow-wrap: anywhere;
`;
const TutorBubble = styled(MessageBubble)`
  text-align: left;
  transition: filter 140ms ease;

  &.is-replying {
    filter: blur(5px);
  }
`;
const StudentBubble = styled(MessageBubble)`
  text-align: left;
`;
const MessageRole = styled.div`
  color: rgb(0 0 0 / 46%);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
`;
const MessageBody = styled.div`
  color: rgb(0 0 0 / 88%);
  font-size: 17px;
  line-height: 1.55;
`;
const ThinkingIndicator = styled.div`
  min-height: 34px;
  display: flex;
  align-items: center;
`;
const SentMedia = styled.div`
  max-width: 100%;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
`;
const SentImage = styled(ResizableImage)`
  width: 84px;
  height: 84px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid rgb(0 0 0 / 9%);
  cursor: zoom-in;
  padding-top: 0;
`;
const SentFile = styled.div`
  max-width: min(280px, 100%);
  padding: 6px 0;
  color: rgb(0 0 0 / 58%);
  font-size: 13px;
  line-height: 1.35;
  overflow-wrap: anywhere;
`;
const QuestionImage = styled.div`
  margin-top: 12px;
`;
const ComposerDock = styled.div`
  width: 100%;
  margin-top: auto;
  padding-top: 10px;
  flex: 0 0 auto;
`;
const Composer = styled.div`
  width: 100%;
  min-height: 104px;
  margin: 0 auto;
  padding: 15px 14px 10px 18px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  border: 1px solid rgb(0 0 0 / 11%);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 1px 2px rgb(0 0 0 / 5%), 0 7px 22px rgb(0 0 0 / 6%);
  transition: border-color 120ms ease, box-shadow 120ms ease;
  overflow: visible;

  &.is-disabled {
    pointer-events: none;
    opacity: .65;
  }

  &:focus-within {
    border-color: rgb(0 0 0 / 15%);
    box-shadow: 0 1px 2px rgb(0 0 0 / 6%), 0 9px 28px rgb(0 0 0 / 7%);
  }

  /* Match the horizontal inset used by the AI message bubble on phones. */
  @media (max-width: 520px) {
    width: calc(100% - 20px);
  }
`;
const ComposerTextarea = styled.textarea`
  width: 100%;
  min-width: 0;
  min-height: 36px;
  max-height: 220px;
  box-sizing: border-box;
  padding: 2px 5px 6px 3px;
  border: 0;
  outline: 0;
  resize: none;
  overflow-y: auto;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 17px;
  line-height: 1.5;

  &::placeholder { color: rgb(0 0 0 / 40%); }
  &:disabled { cursor: wait; opacity: .6; }
`;
const AttachmentTray = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
  margin: 5px 0 8px;
`;
const AttachmentChip = styled.div`
  height: 48px;
  max-width: min(260px, 100%);
  padding: 4px 7px 4px 4px;
  display: flex;
  align-items: center;
  gap: 7px;
  box-sizing: border-box;
  border: 1px solid rgb(0 0 0 / 9%);
  border-radius: 14px;
  background: rgb(0 0 0 / 3%);
`;
const AttachmentImage = styled(ResizableImage)`
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  object-fit: cover;
  border-radius: 10px;
  background: rgb(0 0 0 / 5%);
  cursor: zoom-in;
  padding-top: 0;
`;
const AttachmentFileIcon = styled.span`
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgb(0 0 0 / 6%);
  font-size: 18px;
  `;
const AttachmentLabel = styled.span`
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgb(0 0 0 / 68%);
  font-size: 13px;
`;
const RemoveAttachmentButton = styled.button`
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: rgb(0 0 0 / 48%);
  font: inherit;
  font-size: 20px;
  line-height: 22px;
  cursor: pointer;

  &:hover { background: rgb(0 0 0 / 6%); color: rgb(0 0 0 / 76%); }
`;
const AudioChip = styled(AttachmentChip)`
  min-width: 160px;
  &.recording { background: rgb(220 38 38 / 5%); }
`;
const RecordingDot = styled.span`
  width: 9px;
  height: 9px;
  flex: 0 0 9px;
  margin-left: 8px;
  border-radius: 50%;
  background: #dc2626;
  box-shadow: 0 0 0 4px rgb(220 38 38 / 10%);
`;
const MicMini = styled.span`
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgb(0 0 0 / 55%);
  font-size: 9px;
`;
const AudioStopButton = styled.button`
  height: 28px;
  padding: 0 9px;
  border: 0;
  border-radius: 14px;
  background: rgb(0 0 0 / 7%);
  color: rgb(0 0 0 / 66%);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
`;
const ComposerFooter = styled.div`
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 4px;
`;
const ComposerTools = styled.div`
  min-width: 40px;
  display: flex;
  align-items: center;
  gap: 6px;
`;
const AddControl = styled.details`
  position: relative;
  flex: 0 0 auto;
`;
const AddControlSummary = styled.summary`
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border-radius: 50%;
  list-style: none;
  background: transparent;
  color: rgb(0 0 0 / 82%);
  font: inherit;
  font-size: 30px;
  font-weight: 300;
  line-height: 1;
  cursor: pointer;
  user-select: none;

  &::-webkit-details-marker { display: none; }
  &::marker { display: none; content: ''; }
  &:hover { background: rgb(0 0 0 / 5%); }
  &:focus-visible { outline: 2px solid rgb(59 130 246 / 55%); outline-offset: 2px; }
`;
const AddMenu = styled.div`
  position: absolute;
  left: 0;
  bottom: calc(100% + 10px);
  z-index: 35;
  width: 230px;
  padding: 7px;
  box-sizing: border-box;
  border: 1px solid rgb(0 0 0 / 9%);
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 14px 40px rgb(0 0 0 / 14%);
`;
const AddMenuButton = styled.button`
  width: 100%;
  min-height: 42px;
  padding: 7px 9px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: rgb(0 0 0 / 78%);
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;

  &:hover:not(:disabled) { background: rgb(0 0 0 / 5%); }
  &:disabled { cursor: default; opacity: .5; }
`;
const MenuGlyph = styled.span`
  width: 24px;
  flex: 0 0 24px;
  display: inline-flex;
  justify-content: center;
  color: rgb(0 0 0 / 64%);
  font-size: 18px;
`;
const HiddenFileInput = styled.input`display: none;`;
const ComposerActions = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  flex: 0 1 auto;
  min-height: 40px;
`;
const ModelControl = styled.details`
  position: relative;
  flex: 0 1 auto;
  min-width: 0;

  &[open] > summary {
    background: rgb(0 0 0 / 5%);
    color: rgb(0 0 0 / 78%);
  }
`;
const ModelControlSummary = styled.summary`
  max-width: min(34vw, 220px);
  height: 38px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 9px 0 11px;
  box-sizing: border-box;
  border: 0;
  border-radius: 19px;
  list-style: none;
  background: transparent;
  color: rgb(0 0 0 / 48%);
  font: inherit;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  user-select: none;

  &::-webkit-details-marker { display: none; }
  &::marker { display: none; content: ''; }
  &:hover { background: rgb(0 0 0 / 4%); color: rgb(0 0 0 / 70%); }
  &:focus-visible { outline: 2px solid rgb(59 130 246 / 55%); outline-offset: 2px; }
`;
const ModelName = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;
const Chevron = styled.span`
  width: 8px;
  height: 8px;
  flex: 0 0 8px;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: translateY(-2px) rotate(45deg);
`;
const ModelControlMenu = styled.div`
  position: absolute;
  right: 0;
  bottom: calc(100% + 12px);
  z-index: 30;
  width: min(410px, calc(100vw - 48px));
  max-height: min(430px, 70vh);
  overflow: auto;
  box-sizing: border-box;
  padding: 12px;
  border: 1px solid rgb(0 0 0 / 10%);
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 16px 46px rgb(0 0 0 / 16%);

  &, & * { box-sizing: border-box; }

  > label {
    display: grid;
    gap: 7px;
    color: rgb(0 0 0 / 62%);
    font-size: 13px;
  }

  > div, .ui--Labelled, .ui--Input, .ui--Dropdown, .field {
    width: 100%;
    max-width: 100%;
  }

  input, select, button { max-width: 100%; }
`;
const AudioButton = styled.button`
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  padding: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: rgb(0 0 0 / 78%);
  cursor: pointer;

  svg {
    width: 22px;
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  &:hover:not(:disabled) { background: rgb(0 0 0 / 5%); }
  &.recording { background: rgb(220 38 38 / 9%); color: #dc2626; }
  &:disabled { cursor: default; opacity: .4; }
`;
const StopGlyph = styled.span`
  width: 11px;
  height: 11px;
  border-radius: 3px;
  background: currentColor;
`;
const SkipAction = styled.button`
  height: 38px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 11px;
  border: 0;
  border-radius: 19px;
  background: transparent;
  color: rgb(0 0 0 / 48%);
  font: inherit;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
  user-select: none;

  &:hover:not(:disabled) {
    background: rgb(0 0 0 / 4%);
    color: rgb(0 0 0 / 70%);
  }
  &:focus-visible { outline: 2px solid rgb(59 130 246 / 55%); outline-offset: 2px; }

  &:disabled {
    cursor: default;
    opacity: .4;
  }
`;
const SkipSquare = styled.span`
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
  box-sizing: border-box;
  border: 3px solid #f79200;
  border-radius: 3px;
`;
const SendButton = styled.button`
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  background: #F39200;
  color: #fff;
  font-size: 25px;
  line-height: 1;
  cursor: pointer;

  &:hover:not(:disabled) { background: #d98200; }
  &:disabled { cursor: default; background: rgb(0 0 0 / 12%); color: rgb(0 0 0 / 32%); }
`;
const ComposerMeta = styled.div`
  width: 100%;
  margin: 5px auto 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
`;
const ComposerHint = styled.div`
  flex: 1;
  text-align: right;
  color: rgb(0 0 0 / 42%);
  font-size: 12px;

  @media (max-width: 520px) { display: none; }
`;

export default React.memo(AITutorButton);
