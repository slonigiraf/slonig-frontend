import React from 'react';
import { useTranslation } from '../translate.js';
import { FullWidthContainer } from '@slonigiraf/slonig-components';
import styled from 'styled-components';

const PHRASE_WORD_COUNT = 9;

function countWords(input: string) {
  if (input) {
    const kxMatches = input.match(/<kx>.*?<\/kx>/g) || [];
    const kxWordCount = kxMatches.length;
    const stringWithoutKx = input.replace(/<kx>.*?<\/kx>/g, '');
    const remainingWords = stringWithoutKx.trim().split(/\s+/).filter(Boolean);
    return kxWordCount + remainingWords.length;
  }
  return 0;
}

interface Props {
  text: string;
}
function MillerLawComment({ text }: Props): React.ReactElement {
  const { t } = useTranslation();
  const wordCount = countWords(text);

  return (
    wordCount > PHRASE_WORD_COUNT ?
      <FullWidthContainer>
        <StyledA
          href='https://en.wikipedia.org/wiki/The_Magical_Number_Seven,_Plus_or_Minus_Two'
          target='_blank'>
          {t('It’s better to shorten it to 9 words.')}
        </StyledA>
      </FullWidthContainer> : <></>
  );
}

const StyledA = styled.a`
  color: red !important;
`;

export default React.memo(MillerLawComment);