// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookChapter } from '@slonigiraf/db';
import { updateBookChapterTitle } from '@slonigiraf/db';
import React, { useCallback, useState } from 'react';

import { Button, Input, Modal } from '@polkadot/react-components';

import { ChapterTitleEditorContent } from './ChapterTitleEditor.styles.js';

function ChapterTitleEditor ({ chapter, onClose, onError, onSaved }: { chapter: BookChapter; onClose: () => void; onError: (error: string) => void; onSaved: () => void }): React.ReactElement {
  const [title, setTitle] = useState(chapter.title);
  const save = useCallback((): void => {
    if (chapter.id === undefined || !title.trim()) {
      return;
    }

    updateBookChapterTitle(chapter.id, title.trim())
      .then(() => {
        onSaved();
        onClose();
      })
      .catch((error) => onError(error instanceof Error ? error.message : 'Unable to rename the chapter.'));
  }, [chapter.id, onClose, onError, onSaved, title]);

  return <Modal
    header='Edit chapter name'
    onClose={onClose}
    size='small'
  >
    <Modal.Content>
      <ChapterTitleEditorContent>
        <Input
          label='Chapter name'
          onChange={setTitle}
          onEnter={save}
          value={title}
        />
        <Button.Group>
          <Button
            icon='times'
            label='Cancel'
            onClick={onClose}
          />
          <Button
            icon='save'
            isDisabled={!title.trim() || title.trim() === chapter.title}
            label='Save'
            onClick={save}
          />
        </Button.Group>
      </ChapterTitleEditorContent>
    </Modal.Content>
  </Modal>;
}

export default ChapterTitleEditor;
