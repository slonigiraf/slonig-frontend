// Copyright 2021-2022 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useEffect, useState } from 'react';
import { useApi } from '@polkadot/react-hooks';
import { KatexSpan, getCIDFromBytes, getIPFSDataFromContentID, parseJson } from '@slonigiraf/app-slonig-components';
import { useIpfsContext } from '@slonigiraf/app-slonig-components';
import { Button, Icon, Label, Spinner, styled } from '@polkadot/react-components';
import DiplomaCheck from './DiplomaCheck.js';
import { Letter } from '@slonigiraf/app-recommendations';
import { ItemWithCID } from '../types.js';

interface Props {
  className?: string;
  id: string;
  isText?: boolean;
  defaultValue?: string;
  isSelected?: boolean;
  isSelectable?: boolean;
  isReexaminingRequested?: boolean;
  onToggleSelection?: (item: ItemWithCID) => void;
}

function ItemLabel({ className = '', id, isText = false, defaultValue = '...', isSelected = false, isSelectable = false, isReexaminingRequested=false, onToggleSelection }: Props): React.ReactElement<Props> {
  const { ipfs, isIpfsReady, ipfsInitError } = useIpfsContext();
  const { api } = useApi();
  const [cidString, setCidString] = useState<string>("");
  const [text, setText] = useState<string>(id);
  const [isFetched, setIsFetched] = useState(false);
  const [isSkillItem, setIsSkillItem] = useState(false);
  const [type, setType] = useState(-1);
  const [loading, setLoading] = useState<boolean>(true);
  const [validDiplomas, setValidDiplomas] = useState<Letter[]>([]);

  // Disable button based on validDiplomas size and toggle selection if necessary
  useEffect(() => {
    const allowSelection = isReexaminingRequested? validDiplomas.length > 0 : validDiplomas.length === 0;
    if (!allowSelection && isSelected && onToggleSelection) {
      onToggleSelection({'id': id, 'cid': cidString}); // Deselect if no valid diplomas
    }
  }, [validDiplomas, isSelected, onToggleSelection, id, cidString]);

  useEffect(() => {
    fetchLaw(id);
  }, [id]);

  useEffect(() => {
    const fetchIPFSData = async () => {
      if (!isIpfsReady || cidString.length < 2) {
        return;
      }

      try {
        const jsonText = await getIPFSDataFromContentID(ipfs, cidString);
        const json = parseJson(jsonText);
        setText(json.h);
        setIsFetched(true);
        setIsSkillItem(json.t === 3);
        setType(json.t);
      } catch (error) {
        console.error(error.message);
      }
    };

    fetchIPFSData();
  }, [cidString, ipfs]);


  async function fetchLaw(key: string) {
    const law = await api.query.laws.laws(key);
    if (law.isSome) {
      const tuple = law.unwrap();
      const byteArray = tuple[0]; // This should give you the [u8; 32]
      const bigIntValue = tuple[1]; // This should give you the u128
      const cid = await getCIDFromBytes(byteArray);
      setCidString(cid);
    }
  }

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
      <StyledA href={`/#/knowledge?id=${id}`}>{!isSkillItem && icon}{isSkillItem && <DiplomaCheck id={id} cid={cidString} setValidDiplomas={setValidDiplomas} onLoad={() => setLoading(false)}/>}<KatexSpan content={textToDisplay} /></StyledA>
      :
      <StyledSpinner><Spinner noLabel /></StyledSpinner>;


  const allowSelection = isReexaminingRequested? validDiplomas.length > 0 : validDiplomas.length === 0;

  return <StyledDiv isSelectable={isSelectable}>{
    (onToggleSelection !== undefined && isSelectable && <Button
      icon={isSelected ? 'check' : 'square'}
      onClick={() => onToggleSelection({'id': id, 'cid': cidString})}
      isDisabled={!allowSelection}
    />)}
    {content}</StyledDiv>;
}

const StyledA = styled.a`
   font-size: 16px;
   margin: 7px;
`;
const StyledSpinner = styled.div`
  .ui--Spinner{
    width: 50px;
    margin-left: 0px;
    margin-right: 25px;
  }
`;

const StyledDiv = styled.div<{ isSelectable: boolean }>`
  display: flex;
  align-items: center;
  justify-content: start;
  ${({ isSelectable }) => isSelectable && 'padding: 10px;'}
  padding-left: 6px;
`;

export default React.memo(ItemLabel);