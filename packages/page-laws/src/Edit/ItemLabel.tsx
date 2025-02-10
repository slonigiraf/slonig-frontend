// Copyright 2021-2022 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useEffect, useState } from 'react';
import { KatexSpan, StyledSpinnerContainer, getIPFSDataFromContentID, parseJson } from '@slonigiraf/app-slonig-components';
import { useIpfsContext } from '@slonigiraf/app-slonig-components';
import { Button, Icon, styled, Spinner } from '@polkadot/react-components';
import DiplomaCheck from './DiplomaCheck.js';
import { Letter } from '@slonigiraf/db';
import { ItemWithCID } from '../types.js';
interface Props {
  className?: string;
  id: string;
  cid: string;
  isText?: boolean;
  defaultValue?: string;
  isSelected?: boolean;
  isSelectable?: boolean;
  isReexaminingRequested?: boolean;
  onToggleSelection?: (item: ItemWithCID) => void;
  onItemUpdate?: (item: ItemWithCID) => void;
}

function ItemLabel({ className = '', id, cid, isText = false, defaultValue = '...', isSelected = false, isSelectable = false, isReexaminingRequested = false, onToggleSelection, onItemUpdate, }: Props): React.ReactElement<Props> {
  const { ipfs, isIpfsReady } = useIpfsContext();
  const [text, setText] = useState<string>(id);
  const [isFetched, setIsFetched] = useState(false);
  const [isSkillItem, setIsSkillItem] = useState(false);
  const [type, setType] = useState(-1);
  const [validDiplomas, setValidDiplomas] = useState<Letter[]>([]);
  const [wasSelected, setWasSelected] = useState(isSelected);

  useEffect(() => {
    setWasSelected(isSelected);
  }, [isSelected]);

  // Disable button based on validDiplomas size and toggle selection if necessary
  useEffect(() => {
    const allowSelection = isReexaminingRequested ? validDiplomas.length > 0 : validDiplomas.length === 0;
    if (!allowSelection && isSelected && onToggleSelection) {
      onToggleSelection({ 'id': id, 'cid': cid, 'validDiplomas': validDiplomas }); // Deselect if no valid diplomas
    }
  }, [validDiplomas, isSelected, onToggleSelection, id, cid]);

  const handleToggleSelection = () => {
    if (onToggleSelection) {
      setWasSelected(true);
      onToggleSelection({ id, cid: cid, validDiplomas });
    }
  };

  useEffect(() => {
    const fetchIPFSData = async () => {
      if (!isIpfsReady || cid.length < 2) {
        return;
      }

      try {
        const jsonText = await getIPFSDataFromContentID(ipfs, cid);
        const json = parseJson(jsonText);
        setText(json.h);
        setIsFetched(true);
        setIsSkillItem(json.t === 3);
        setType(json.t);
      } catch (error) {
        console.error((error as {message: string}).message);
      }
    };

    fetchIPFSData();
  }, [cid, ipfs]);

  // Call the item update function when data is available
  useEffect(() => {
    if (isFetched && onItemUpdate) {
      const updatedItem = { id, cid: cid, validDiplomas };
      onItemUpdate(updatedItem);
    }
  }, [isFetched, cid, validDiplomas, onItemUpdate, id]);

  const textToDisplay = isFetched ? text : defaultValue;

  const getIconName = () => {
    switch (type) {
      case 0: return 'list';
      case 1: return 'graduation-cap';
      case 2: return 'book-open';
      default: return 'question';
    }
  };

  const iconToDisplay = <Icon icon={getIconName()} color='gray' />;

  const icon = <span>{iconToDisplay}&nbsp;</span>;

  const content = isText ?
    <KatexSpan content={textToDisplay} />
    :
    isFetched ?
      <StyledA href={`/#/knowledge?id=${id}`}
        onClick={(e) => {
          if (isSelectable) {
            e.preventDefault();
            handleToggleSelection();
          }
        }}
      >
        {!isSkillItem && icon}
        {isSkillItem && <DiplomaCheck
          id={id}
          cid={cid}
          setValidDiplomas={setValidDiplomas}
        />}
        <KatexSpan content={textToDisplay} />
      </StyledA>
      :
      <StyledSpinnerContainer><Spinner noLabel /></StyledSpinnerContainer>;


  const allowSelection = isReexaminingRequested ? validDiplomas.length > 0 : validDiplomas.length === 0;

  return <StyledDiv isSelectable={isSelectable}>{
    (onToggleSelection !== undefined && isSelectable && <Button
      className='inList'
      icon={wasSelected ? 'check' : 'square'}
      onClick={handleToggleSelection}
      isDisabled={!allowSelection}
    />)}
    {content}</StyledDiv>;
}

const StyledA = styled.a`
   font-size: 16px;
   margin: 7px;
`;

const StyledDiv = styled.div<{ isSelectable: boolean }>`
  display: flex;
  align-items: center;
  justify-content: start;
  ${({ isSelectable }) => isSelectable && 'padding: 10px;'}
  padding: 0px;
`;

export default React.memo(ItemLabel);