// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import { styled } from '@polkadot/react-components';
import { ResizableImage } from '@slonigiraf/slonig-components';
import KnowledgeResizableImage from './KnowledgeResizableImage.js';

interface Props {
  alt?: string;
  value: string;
}

export function isLocalOrRemoteImageUrl (value: string): boolean {
  return /^(?:data:image\/|blob:|https?:\/\/)/i.test(value.trim());
}

export default function ExerciseImage ({ alt = '', value }: Props): React.ReactElement {
  return isLocalOrRemoteImageUrl(value)
    ? <LocalImage alt={alt} src={value} />
    : <KnowledgeResizableImage alt={alt} cid={value} />;
}

const LocalImage = styled(ResizableImage)`
  display: block;
  max-height: 18rem;
  max-width: min(100%, 32rem);
  object-fit: contain;
`;
