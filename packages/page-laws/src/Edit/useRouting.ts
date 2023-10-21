// useRouting.ts
import { useLocation, useNavigate } from 'react-router-dom';

export function useRouting(defaultTextHexId: string) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  
  const setQueryParam = (key: string, value: any) => {
    queryParams.set(key, value);
    navigate({...location, search: queryParams.toString()});
  };

  const textHexId = queryParams.get("id") || defaultTextHexId;

  return {
    textHexId,
    setQueryParam
  };
}