import BN from 'bn.js';
import React, { useCallback, useEffect, useState } from 'react';

import { Button, Spinner, styled } from '@polkadot/react-components';
import { useApi } from '@polkadot/react-hooks';
import { getCIDFromBytes, getIPFSDataFromContentID, LawType, parseJson, useIpfsContext } from '@slonigiraf/slonig-components';
import { DEFAULT_KNOWLEDGE_ID } from '@slonigiraf/utils';

interface KnowledgeNode {
  children: string[];
  id: string;
  title: string;
  type: number;
}

interface Props {
  onChange: (knowledgeId: string) => void;
  value: string;
}

function KnowledgeTargetSelector ({ onChange, value }: Props): React.ReactElement {
  const { api } = useApi();
  const { ipfs, isIpfsReady } = useIpfsContext();
  const [currentId, setCurrentId] = useState(DEFAULT_KNOWLEDGE_ID);
  const [history, setHistory] = useState<string[]>([]);
  const [node, setNode] = useState<KnowledgeNode>();
  const [children, setChildren] = useState<KnowledgeNode[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState('');

  const loadNode = useCallback(async (id: string): Promise<KnowledgeNode> => {
    const law = await api.query.laws.laws(id) as unknown as { isSome: boolean; unwrap: () => [Uint8Array, BN] };

    if (!law.isSome) {
      throw new Error('Knowledge item was not found.');
    }

    const cid = await getCIDFromBytes(law.unwrap()[0]);
    const json = parseJson(await getIPFSDataFromContentID(ipfs, cid));

    return {
      children: Array.isArray(json?.e) ? json.e.filter((childId: unknown): childId is string => typeof childId === 'string') : [],
      id,
      title: typeof json?.h === 'string' && json.h ? json.h : id,
      type: typeof json?.t === 'number' ? json.t : -1
    };
  }, [api, ipfs]);

  useEffect(() => {
    let active = true;

    if (!isIpfsReady) {
      return;
    }

    setError('');
    setIsLoading(true);
    setNode(undefined);
    setChildren([]);

    loadNode(currentId)
      .then(async (loadedNode) => {
        const loadedChildren = await Promise.all(loadedNode.children.map(async (id) => {
          try {
            return await loadNode(id);
          } catch {
            return { children: [], id, title: id, type: -1 };
          }
        }));

        if (active) {
          setNode(loadedNode);
          setChildren(loadedChildren.filter(({ type }) => type === LawType.LIST));
        }
      })
      .catch((loadError: unknown) => active && setError(loadError instanceof Error ? loadError.message : 'Unable to load knowledge.'))
      .finally(() => active && setIsLoading(false));

    return () => {
      active = false;
    };
  }, [currentId, isIpfsReady, loadNode]);

  const navigateTo = useCallback((id: string): void => {
    setHistory((previous) => [...previous, currentId]);
    setCurrentId(id);
  }, [currentId]);
  const navigateBack = useCallback((): void => {
    setHistory((previous) => {
      const parentId = previous[previous.length - 1];

      if (parentId) {
        setCurrentId(parentId);
      }

      return previous.slice(0, -1);
    });
  }, []);
  const selectNode = useCallback((selectedNode: KnowledgeNode): void => {
    setSelectedTitle(selectedNode.title);
    onChange(selectedNode.id);
  }, [onChange]);
  const restartSelection = useCallback((): void => {
    onChange('');
    setSelectedTitle('');
    setHistory([]);
    setCurrentId(DEFAULT_KNOWLEDGE_ID);
  }, [onChange]);

  if (value) {
    return <StyledTargetSelector>
      <div className='selectedRow'>
        <div>
          <h4>Selected publishing location</h4>
          <strong>{selectedTitle || value}</strong>
        </div>
        <Button icon='redo' label='Restart selection' onClick={restartSelection} />
      </div>
    </StyledTargetSelector>;
  }

  return <StyledTargetSelector>
    <div className='navigatorHeading'>
      <h4>Choose publishing location</h4>
      {!!history.length && <Button icon='arrow-left' label='Back' onClick={navigateBack} />}
    </div>
    {!isIpfsReady && <p>Connecting to IPFS…</p>}
    {isLoading && <Spinner />}
    {error && <p className='selectorError' role='alert'>{error}</p>}
    {node && <>
      {node.type === LawType.LIST && <div className='listRow currentNode'>
        <strong>{node.title}</strong>
        <Button icon='check' label='Select' onClick={() => selectNode(node)} />
      </div>}
      {!!children.length && <nav aria-label='Knowledge children'>
        {children.map((child) => <div className='listRow' key={child.id}>
          <a
            href={`/#/knowledge?id=${encodeURIComponent(child.id)}`}
            onClick={(event) => {
              event.preventDefault();
              navigateTo(child.id);
            }}
          >{child.title}</a>
          <Button icon='check' label='Select' onClick={() => selectNode(child)} />
        </div>)}
      </nav>}
      {!children.length && <p className='selectionHint'>This list has no child lists.</p>}
    </>}
  </StyledTargetSelector>;
}

const StyledTargetSelector = styled.div`
  border: 1px solid var(--border-table);
  border-radius: 0.5rem;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
  padding: 1rem;
  width: 100%;

  .navigatorHeading { align-items: center; display: grid; gap: 0.75rem; grid-template-columns: minmax(0, 1fr) auto; }
  .navigatorHeading h4 { margin: 0; }
  .selectedRow, .listRow { align-items: center; display: grid; gap: 0.75rem; grid-template-columns: minmax(0, 1fr) auto; width: 100%; }
  .selectedRow h4 { margin: 0 0 0.25rem; }
  .selectedRow > div, .listRow a { min-width: 0; }
  .selectedRow strong, .listRow a { overflow-wrap: anywhere; }
  .currentNode { border-bottom: 1px solid var(--border-table); padding-bottom: 0.65rem; }
  nav { display: flex; flex-direction: column; min-width: 0; width: 100%; }
  nav .listRow { border-bottom: 1px solid var(--border-table); padding: 0.4rem 0; }
  .ui--Button { margin: 0; white-space: nowrap; }
  .selectionHint { margin: 0; }
  .selectorError { color: var(--color-error); margin: 0; }

  @media only screen and (max-width: 500px) {
    .selectedRow { align-items: stretch; grid-template-columns: 1fr; }
  }
`;

export default React.memo(KnowledgeTargetSelector);
