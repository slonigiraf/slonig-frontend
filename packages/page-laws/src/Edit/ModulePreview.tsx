// Copyright 2021-2022 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import { styled } from '@polkadot/react-components';
import { ItemWithCID } from '../types.js';
import ItemPreview from './ItemPreview.js';


interface Props {
  className?: string;
  itemsWithCID: ItemWithCID[];
}

function ModulePreview({ className = '', itemsWithCID }: Props): React.ReactElement<Props> {
  return <StyledDiv>
    {itemsWithCID.map(item => <ItemPreview key={item.cid} item={item} />)}
  </StyledDiv>;
}

const StyledDiv = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 9999;
  background: white;

  column-width: 300px;       /* or any suitable width for your items */
  column-gap: 1rem;          /* space between columns */
  padding: 1rem;
  overflow: hidden;          /* avoid scrollbars, use columns instead */
`;



export default React.memo(ModulePreview);