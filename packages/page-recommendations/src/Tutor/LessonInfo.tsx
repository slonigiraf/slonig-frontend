// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Button, Spinner, styled } from '@polkadot/react-components';
import React, { useState, useEffect } from 'react'
import { KatexSpan, getIPFSDataFromContentID, parseJson } from '@slonigiraf/app-slonig-components'
import { useTranslation } from '../translate.js';
import { useIpfsContext } from '@slonigiraf/app-slonig-components';
import { Lesson } from '../db/Lesson.js';

interface Props {
  lesson: Lesson;
  isSelected: boolean;
  onToggleSelection: (lesson: Lesson) => void;
}

function LessonInfo({ lesson, isSelected, onToggleSelection }: Props): React.ReactElement<Props> {
  const { ipfs } = useIpfsContext();
  const { t } = useTranslation();
  const [text, setText] = useState(lesson.cid);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function fetchData() {
      if (ipfs !== null && text === lesson.cid) {
        try {
          const content = await getIPFSDataFromContentID(ipfs, lesson.cid);
          const json = parseJson(content);
          setText(json.h);
          setLoaded(true);
        } catch (e) {
          setText(`${lesson.cid} (${t('loading')}...)`);
          console.log(e);
        }
      }
    }
    fetchData();
  }, [ipfs, lesson, text, t]);

  return (
    <StyledDiv >
      <Button
        icon={isSelected ? 'check' : 'square'}
        onClick={() => onToggleSelection(lesson)}
      />
      {loaded ? <KatexSpan content={text} /> : <Spinner noLabel />}
    </StyledDiv>
  );
}

const StyledDiv = styled.div`
  display: flex;
  align-items: center;
  justify-content: start;
  padding: 10px;
  padding-left: 6px;
  > span {
    margin-right: 10px;
    margin-left: 10px;
  }
  .ui--Spinner {
    width: 50px;
    margin-left: 25px;
    margin-right: 25px;
  }
`;

export default React.memo(LessonInfo);