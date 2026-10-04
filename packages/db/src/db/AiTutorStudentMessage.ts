// Copyright 2021-2026 @polkadot/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Durable AI tutor state for one lesson step.
 *
 * Besides the most recently submitted student message, the record may keep a
 * visual composer draft (uploaded files / student TikZ) and generated tutor
 * stage text. Both are stored in IndexedDB so visuals survive a page reload.
 */
export interface AiTutorStudentMessage<TMessage = unknown, TMedia = unknown, TVisualDraft = unknown, TTutorStageMessage = unknown> {
  key: string;
  lessonId: string;
  lessonStep: number;
  message?: TMessage;
  studentExerciseMedia: TMedia[];
  /** Exact student-created exercise used by generated tutor stages. */
  studentExercise?: string;
  /** Current tutor algorithm stage, persisted independently of sessionStorage. */
  currentTutorStageType?: string;
  visualDraft?: TVisualDraft;
  /**
   * Exact tutor messages already shown for this lesson step, keyed by stage.
   * The UI can store both text and already-rendered visual previews here so a
   * reload restores the same message without regenerating or recompiling it.
   */
  tutorStageMessages?: Record<string, TTutorStageMessage>;
  /** Learner-facing explanation for the most recent unsuccessful response. */
  wrongAnswerReasoning?: {
    stageType: string;
    text: string;
    locale?: string;
  };
  /** @deprecated Kept for compatibility with records written by older builds. */
  generatedStageText?: Record<string, string>;
}
