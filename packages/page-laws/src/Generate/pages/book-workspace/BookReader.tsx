// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react';

import { useBookReaderController, type Props } from './BookReaderController.js';
import { BookReaderView } from './BookReaderView.js';

export { OPENAI_MODELS } from '../../../openrouter/models.js';

function BookReader (props: Props): React.ReactElement {
  const controller = useBookReaderController(props);

  return <BookReaderView controller={controller} />;
}

export default React.memo(BookReader);
