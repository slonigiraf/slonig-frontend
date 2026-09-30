// Copyright 2021-2026 @polkadot/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

export interface AiTutorStudentMessage<TMessage = unknown, TMedia = unknown> {
  key: string;
  lessonId: string;
  lessonStep: number;
  message: TMessage;
  studentExerciseMedia: TMedia[];
}
