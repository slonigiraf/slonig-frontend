import { createNamedHook } from '@polkadot/react-hooks';
import { parseJson, receiveWebRTCData, useInfo } from '@slonigiraf/app-slonig-components';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from './translate.js';
import { ErrorType } from '@polkadot/react-params';
import { useEffect, useState } from 'react';

const MAX_LOADING_SEC = 60;

function useFetchWebRTCImpl<T>(
  webRTCPeerId: string | null,
  handleData: (data: T) => Promise<void>
) {
  const { t } = useTranslation();
  const { showInfo, hideInfo } = useInfo();
  const navigate = useNavigate();
  const [triedToFetchData, setTriedToFetchData] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (webRTCPeerId) {
        showInfo('Loading', 'info', MAX_LOADING_SEC);
        try {
          const webRTCData = await receiveWebRTCData(webRTCPeerId, MAX_LOADING_SEC * 1000);
          hideInfo();
          const parsedData = parseJson(webRTCData); // Ensure type-safe parsing
          await handleData(parsedData);
        } catch (e) {
          const errorMessage = (e as Error).message === ErrorType.PEER_INITIALIZATION_ERROR
            ? t('No internet connection. Check your connection and try again.')
            : t('Ask the sender to refresh the QR page and keep it open while sending data.');

          showInfo(errorMessage, 'error');
          navigate('', { replace: true });
        }
      }
    };

    if (webRTCPeerId && !triedToFetchData) {
      setTriedToFetchData(true);
      void fetchData();
    }
  }, [
    webRTCPeerId,
    triedToFetchData,
    handleData,
    t,
    showInfo,
    hideInfo,
    navigate,
  ]);
}

// Explicitly type `createNamedHook` to include the generic
export default createNamedHook('useFetchWebRTC', useFetchWebRTCImpl) as <T>(
  webRTCPeerId: string | null,
  handleData: (data: T) => Promise<void>
) => void;