import { useLocation, useNavigate } from 'react-router-dom';

export function useRouting(defaultTextHexId: string) {
  const location = useLocation();
  const navigate = useNavigate();

  const setQueryKnowledgeId = (value: any) => {
    const newQueryParams = new URLSearchParams();
    newQueryParams.set("id", value);
    navigate({...location, search: newQueryParams.toString()});
  };

  const queryParams = new URLSearchParams(location.search);
  const textHexId = queryParams.get("id") || defaultTextHexId;

  return {
    textHexId,
    setQueryKnowledgeId
  };
}