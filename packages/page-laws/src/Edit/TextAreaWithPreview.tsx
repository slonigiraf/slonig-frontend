import React, { useState } from 'react';
import { TextArea, Toggle, styled } from '@polkadot/react-components';
import { useToggle } from '@polkadot/react-hooks';
import { useTranslation } from '../translate.js';
import { KatexSpan, FullWidthContainer } from '@slonigiraf/slonig-components';
import MillerLawComment from './MillerLawComment.js';

interface Props {
  children?: React.ReactNode;
  className?: string;
  isError?: boolean;
  isReadOnly?: boolean;
  label?: React.ReactNode;
  onChange?: (arg: string) => void;
  seed?: string;
  withLabel?: boolean;
}

const TextAreaWithPreview: React.FC<Props> = ({ children, className, isError, isReadOnly, label, onChange, seed, withLabel }: Props) => {
  const [preview, togglePreview] = useToggle();
  const [content, setContent] = useState(seed ? seed : '');
  const { t } = useTranslation();

  const _onChange = (text: string) => {
    onChange && onChange(text);
    setContent(text);
  };

  return (
    <StyledDiv>
      {
        preview ?
          <FullWidthContainer>
            <KatexSpan content={content} />
          </FullWidthContainer> :
          <>
            <TextArea
              children={children}
              className={className}
              isError={isError}
              isReadOnly={isReadOnly}
              label={label}
              onChange={_onChange}
              seed={seed}
              withLabel={withLabel} />
            <MillerLawComment text={content} />
          </>
      }

      <Toggle
        label={t('preview')}
        onChange={togglePreview}
        value={preview}
      />
    </StyledDiv>
  );
};
const StyledDiv = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  .ui--Labelled {
    padding-left: 0px !important;
  }
  label {
    left: 20px !important;
  }
  .ui--Toggle {
    padding-top: 5px;
  }
`;

export default React.memo(TextAreaWithPreview);