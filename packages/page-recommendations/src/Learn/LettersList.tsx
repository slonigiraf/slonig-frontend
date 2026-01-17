import BadgeInfo from './../Assess/BadgeInfo.js';
import React, { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { deleteLetter, Badge, getLetters, Letter } from '@slonigiraf/db';
import { Button, Toggle, Tag } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';
import { useLocation, useNavigate } from 'react-router-dom';
import SignLettersUseRight from './SignLettersUseRight.js';
import type { KeyringPair } from '@polkadot/keyring/types';
import { Confirmation, DaysRangePicker, SelectableList, StyledContentCloseButton, ToggleContainer, UrlParams, useInfo } from '@slonigiraf/slonig-components';
import { useApi, useToggle } from '@polkadot/react-hooks';
import PersonSelector from '../PersonSelector.js';
import { EXAMPLE_SKILL_KNOWLEDGE_ID } from '@slonigiraf/utils';

interface Props {
  className?: string;
  worker: string;
  currentPair: KeyringPair;
  startDate: Date;
  endDate: Date;
  onDaysRangeChange: (start: Date, end: Date) => void;
}

enum ToggleState {
  NO_SELECTION = 0,
  JUST_SELECTION = 1,
  GETTING_BONUSES = 2,
}

function LettersList({ className = '', worker, currentPair, startDate, endDate, onDaysRangeChange }: Props): React.ReactElement<Props> {
  const MAX_SELECTED = 93;
  const { t } = useTranslation();
  const location = useLocation();
  const { isApiConnected } = useApi();
  const queryParams = new URLSearchParams(location.search);
  const webRTCPeerId = queryParams.get(UrlParams.WEBRTC_PEER_ID);
  const employer = queryParams.get('employer') || '';
  const { showInfo } = useInfo();
  const navigate = useNavigate();
  const [reloadCount, setReloadCount] = useState<number>(0);
  const [toggleState, setToggleState] = useState<ToggleState>(employer !== '' ? ToggleState.GETTING_BONUSES : ToggleState.NO_SELECTION);
  const [isDeleteConfirmOpen, toggleDeleteConfirm] = useToggle();

  useEffect(() => {
    setToggleState(employer !== '' ? ToggleState.GETTING_BONUSES : ToggleState.NO_SELECTION)
  }, [employer]);

  const lettersRaw = useLiveQuery<Letter[]>(
    () => getLetters(worker, startDate.getTime(), endDate.getTime()),
    [worker, startDate, endDate]
  );

  const letters = toggleState
    ? (lettersRaw ?? []).filter((letter: Letter) => letter.knowledgeId !== EXAMPLE_SKILL_KNOWLEDGE_ID)
    : (lettersRaw ?? []);

  const [selectedLetters, setSelectedLetters] = useState<Letter[]>([]);

  const handleSelectionChange = (newSelectedLetters: Badge[]) => {
    const letters = newSelectedLetters as Letter[];
    if (letters.length > MAX_SELECTED) {
      showInfo(`${t('You can select no more than:')} ${MAX_SELECTED}`);
      return;
    }
    setSelectedLetters(letters);
  };

  const handleSelectionToggle = useCallback((checked: boolean): void => {
    if (checked && toggleState === ToggleState.NO_SELECTION) {
      setToggleState(ToggleState.JUST_SELECTION);
    } else {
      setToggleState(ToggleState.NO_SELECTION);
    }
  }, [toggleState]);

  const handleGetBonusToggle = useCallback((checked: boolean): void => {
    if (checked) {
      setToggleState(ToggleState.GETTING_BONUSES);
    } else {
      setToggleState(ToggleState.NO_SELECTION);
    }
  }, [toggleState]);

  useEffect(() => {
    if (!isApiConnected && toggleState === ToggleState.GETTING_BONUSES) {
      setToggleState(ToggleState.NO_SELECTION);
    }
  }, [isApiConnected]);

  const deleteDiplomas = async () => {
    const idsToDelete = selectedLetters.map((letter) => letter.pubSign);
    try {
      for (const id of idsToDelete) {
        if (id) {
          await deleteLetter(id);
        }
      }
      showInfo(t('Deleted'));
      setSelectedLetters([]);
    } catch (error) {
      console.error('Error deleting selected badges:', error);
      showInfo(t('Deletion failed'));
    } finally {
      toggleDeleteConfirm();
    }
  };

  const deleteSelectedButton =
    toggleState !== ToggleState.GETTING_BONUSES && selectedLetters.length > 0 && (
      <Button icon="trash" label={t('Delete')} onClick={toggleDeleteConfirm} />
    );

  const close = () => {
    setSelectedLetters([]);
    setToggleState(ToggleState.NO_SELECTION);
    setReloadCount(reloadCount + 1);
    navigate('', { replace: true });
  }

  const handleEmployerSelect = async (selectedKey: string) => {
    if (selectedKey) {
      navigate(`?employer=${encodeURIComponent(selectedKey)}`, { replace: true });
    }
  };

  const canSignLetters = employer !== '' && selectedLetters && selectedLetters.length > 0;

  return !letters ? (
    <div></div>
  ) : (
    <div>
      {!canSignLetters && <h2>{t('My badges')}</h2>}
      {
        toggleState === ToggleState.GETTING_BONUSES &&
        <StyledContentCloseButton onClick={close}
          icon='close'
        />
      }
      {canSignLetters && (
        <SignLettersUseRight
          letters={selectedLetters}
          worker={worker}
          employer={employer}
          currentPair={currentPair}
          onDataSent={close}
        />
      )}
      <div className="ui--row">
        <DaysRangePicker
          startDate={startDate ? new Date(startDate) : null}
          endDate={endDate ? new Date(endDate) : null}
          onChange={onDaysRangeChange}
        />
      </div>
      {employer === '' && <ToggleContainer>
        <Toggle
          label={t('Select')}
          onChange={handleSelectionToggle}
          value={toggleState !== ToggleState.NO_SELECTION}
        />
        {isApiConnected && <>
          <Toggle
            label={t('Get bonus')}
            onChange={handleGetBonusToggle}
            value={toggleState === ToggleState.GETTING_BONUSES}
          />
          <Tag
            key={'get-bonus-help'}
            label={'?'}
            size='large'
            isHelp={true}
            hover={t('Earn bonuses from teachers, parents, or employers—anyone who benefits from your learning. In return, they will be able to assess your badges and receive Slons from tutors if you forget your skills.')}
          />
        </>
        }
      </ToggleContainer>}
      {(toggleState === ToggleState.GETTING_BONUSES && employer === '') && <PersonSelector
        label={t('select teacher / parent / employer')}
        onChange={handleEmployerSelect}
      />}
      <SelectableList<Badge>
        allSelected={toggleState !== ToggleState.NO_SELECTION}
        items={letters}
        renderItem={(letter, isSelected, isSelectionAllowed, onToggleSelection) => (
          <BadgeInfo
            badge={letter}
            isSelected={isSelected}
            onToggleSelection={onToggleSelection}
            isSelectionAllowed={isSelectionAllowed}
          />
        )}
        onSelectionChange={handleSelectionChange}
        maxSelectableItems={MAX_SELECTED}
        additionalControls={deleteSelectedButton}
        keyExtractor={(letter) => letter.pubSign}
        key={worker + reloadCount}
        isSelectionAllowed={toggleState !== ToggleState.NO_SELECTION}
      />
      {isDeleteConfirmOpen && (
        <Confirmation question={t('Are you sure you want to delete it?')} onClose={toggleDeleteConfirm} onConfirm={deleteDiplomas} />
      )}
    </div>
  );
}

export default React.memo(LettersList);