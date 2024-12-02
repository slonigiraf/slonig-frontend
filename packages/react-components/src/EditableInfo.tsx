import React from 'react';
import { Button, Input, styled } from './index.js';
import { useToggle } from '@polkadot/react-hooks';

interface Props {
  className?: string;
  onChange: ((value: string) => void) | undefined;
  label?: string;
  value?: string;
  placeholder?: string;
  isError?: boolean;
}

function EditableInfo({ className = '', onChange, label = '', value = '', placeholder = '', isError = false }: Props): React.ReactElement<Props> | null {
  const [isEditing, toggleIsEditing] = useToggle();
  return (
    <StyledDiv>
      {isEditing ? <>
        <Input
          className='input--info'
          label={label}
          onChange={onChange}
          value={value}
          placeholder={placeholder}
          isError={isError}
        />
        <Button icon='save'
          onClick={toggleIsEditing}
        />
      </> : <><Button icon='edit' onClick={toggleIsEditing} className='edit' /><span>{value} {label}</span></>
      }
    </StyledDiv>
  );
}
const StyledDiv = styled.div`
  display: flex;
  flex-direction: row;
  width: 100%;
  padding: 10px;
  align: center;
  justify-content: center;
  & > span {
    display: flex;
    align-items: center;
  }
  .input--info {
    padding-left: 0px !important;
    width: 200px;
  }
  label {
    left: 20px !important;
  }
  button {
    margin-left: 10px !important;
  }
  .edit {
    .ui--Icon {
      background-color: transparent !important;
      color: #F39200 !important;
    }
  }
`;
export default React.memo(EditableInfo);