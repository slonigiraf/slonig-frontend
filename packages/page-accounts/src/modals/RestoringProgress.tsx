import React from 'react';
import { Spinner, styled } from '@polkadot/react-components';
import { FullscreenActivity } from '@slonigiraf/slonig-components';

// Match the original fullscreen restore view: show only the spinner while
// the long-lived RestoreService continues its work in the background.
function RestoringProgress(): React.ReactElement {
  return (
    <FullscreenActivity caption={''} backgroundColor={'var(--bg-page)'}>
      <StyledDiv>
        <Spinner noLabel />
      </StyledDiv>
    </FullscreenActivity>
  );
}

const StyledDiv = styled.div`
  flex: 1;
  width: 70%;
  min-height: 0;
  display: flex;
  align-items: center;
  text-align: center;
  justify-content: center;
`;

export default React.memo(RestoringProgress);
