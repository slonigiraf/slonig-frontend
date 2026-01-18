// Copyright 2021-2022 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useEffect, useState } from 'react';
import {
  KatexSpan,
  ProgressData,
  StyledSpinnerContainer,
  getIPFSDataFromContentID,
  parseJson,
  progressValue
} from '@slonigiraf/slonig-components';
import { useIpfsContext } from '@slonigiraf/slonig-components';
import { Button, Icon, styled, Spinner, Progress } from '@polkadot/react-components';
import BadgeCheck from './BadgeCheck.js';
import { ItemWithCID } from '../types.js';

interface Props {
  className?: string;
  item: ItemWithCID;
  isText?: boolean;
  defaultValue?: string;
  isSelected?: boolean;
  isSelectable?: boolean;
  isReexaminingRequested?: boolean;
  onToggleSelection?: (item: ItemWithCID) => void;
  onItemUpdate?: (item: ItemWithCID) => void;
  progressData?: ProgressData
}

function ItemLabel({
  className = '',
  item,
  isText = false,
  defaultValue = '...',
  isSelected = false,
  isSelectable = false,
  isReexaminingRequested = false,
  onToggleSelection,
  progressData
}: Props): React.ReactElement<Props> {
  const { ipfs, isIpfsReady } = useIpfsContext();
  const [text, setText] = useState<string>(item.id);
  const [isFetched, setIsFetched] = useState(false);
  const [isSkillItem, setIsSkillItem] = useState(false);
  const [type, setType] = useState(-1);
  const [wasSelected, setWasSelected] = useState(isSelected);

  useEffect(() => {
    setWasSelected(isSelected);
  }, [isSelected]);

  useEffect(() => {
    const fetchIPFSData = async () => {
      if (!isIpfsReady || item.cid.length < 2) {
        return;
      }

      try {
        const jsonText = await getIPFSDataFromContentID(ipfs, item.cid);
        const json = parseJson(jsonText);

        setText(json.h);
        setIsFetched(true);
        setIsSkillItem(json.t === 3);
        setType(json.t);
      } catch (error) {
        console.error((error as { message: string }).message);
      }
    };

    fetchIPFSData();
  }, [item, ipfs, isIpfsReady]);

  const textToDisplay = isFetched ? text : defaultValue;
  const href = `/#/knowledge?id=${item.id}`;

  const allowSelection = isReexaminingRequested
    ? (item.validDiplomas?.length ?? 0) > 0
    : (item.validDiplomas?.length ?? 0) === 0 && !item.isBlockedForLearning;

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

  const handleToggleSelection = () => {
    if (!allowSelection) {
      return;
    }

    if (onToggleSelection) {
      setWasSelected(true);
      onToggleSelection(item);
    }
  };

  const handleContainerClick = (e: React.MouseEvent<HTMLElement>) => {
    if (!isFetched || isText) {
      return;
    }

    // If click came from the button, ignore (button has its own handler)
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }

    // When selectable, behave like old preventDefault + toggle selection
    if (isSelectable) {
      e.preventDefault();

      if (allowSelection) {
        handleToggleSelection();
      }

      return;
    }

    // Non-selectable: behave like href click
    window.location.href = href;
  };

  const content = isText
    ? (
      <KatexSpan content={textToDisplay} />
    )
    : isFetched
      ? (<StyledA href={href}>
        {!isSkillItem && !progressData && icon}
        {isSkillItem && <BadgeCheck
          item={item}
        />}
        <KatexSpan content={textToDisplay} />
      </StyledA>)
      : (
        <StyledSpinnerContainer>
          <Spinner noLabel />
        </StyledSpinnerContainer>
      );

  return (
    <StyledDiv
      className={className}
      isSelectable={isSelectable}
      onClick={handleContainerClick}
      role={!isText && isFetched ? 'link' : undefined}
    >
      {onToggleSelection !== undefined && isSelectable && (
        <Button
          className='inList'
          icon={wasSelected ? 'check' : 'square'}
          isDisabled={!allowSelection}
          onClick={handleToggleSelection}
        />
      )}

      {progressData && (
        <ProgressWrap>
          <Progress
            value={progressValue(progressData)}
            total={progressData.skills}
          />
        </ProgressWrap>
      )}

      <ContentWrap>
        {content}
      </ContentWrap>
    </StyledDiv>
  );
}

const StyledA = styled.a`
  font-size: 16px;
  margin: 7px;

  /* allow wrapping */
  white-space: normal;
  word-break: break-word;

  /* key for flex: allow this item to shrink */
  min-width: 0;
`;

const StyledDiv = styled.div<{ isSelectable: boolean }>`
  display: flex;
  align-items: center;
  justify-content: start;
  ${({ isSelectable }) => isSelectable && 'padding: 10px;'}
  padding-left: 0px;
  padding-top: 7px;
  padding-bottom: 7px;
  cursor: pointer;

  /* prevent children from overflowing/cropping weirdly */
  width: 100%;
`;

/* Add wrappers so we can control flex behavior */
const ProgressWrap = styled.div`
  flex: 0 0 auto;     /* don't shrink */
  margin-right: 8px;  /* optional spacing */
`;

const ContentWrap = styled.div`
  flex: 1 1 auto;     /* take remaining space */
  min-width: 0;       /* IMPORTANT: allow wrapping without pushing siblings off */
`;

export default React.memo(ItemLabel);