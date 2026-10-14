import React from 'react';
import { styled } from '@polkadot/react-components';
import { FullscreenActivity, RoundProgress } from '@slonigiraf/slonig-components';
import type { OperationStatus } from '@slonigiraf/slonig-components';
import { useTranslation } from '../translate.js';

interface Props {
  status: OperationStatus | null;
}

// Keep the fullscreen restore view but report verified archive and commit progress.
function RestoringProgress({ status }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const progress = status?.total ? Math.max(0, Math.min(100, status.completed / status.total * 100)) : 0;
  const phaseLabel = status?.phase === 'committing'
    ? t('Finishing restore')
    : status?.phase === 'staging'
      ? t('Restoring data')
      : t('Verifying backup');

  return (
    <FullscreenActivity hideHeader backgroundColor={'var(--bg-page)'}>
      <StyledDiv>
        <div
          aria-label={phaseLabel}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.floor(progress)}
          role='progressbar'
        >
          <RoundProgress value={Math.floor(progress)} total={100} />
        </div>
        <p role='status'>{phaseLabel}</p>
      </StyledDiv>
    </FullscreenActivity>
  );
}

const StyledDiv = styled.div`
  flex: 1;
  width: 70%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
  text-align: center;
  justify-content: center;
`;

export default React.memo(RestoringProgress);
