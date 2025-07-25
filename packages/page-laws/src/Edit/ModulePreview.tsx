import React, { useEffect, useRef, useState } from 'react';
import { styled } from '@polkadot/react-components';
import { ItemWithCID } from '../types.js';
import ItemPreview from './ItemPreview.js';

interface Props {
  className?: string;
  itemsWithCID: ItemWithCID[];
}

function ModulePreview({ className = '', itemsWithCID }: Props): React.ReactElement<Props> {
  const [page, setPage] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const item = measureRef.current;
    if (!container || !item) return;

    const resizeObserver = new ResizeObserver(() => {
      const itemWidth = item.offsetWidth;
      const itemHeight = item.offsetHeight;

      if (itemWidth === 0 || itemHeight === 0) return;

      const containerWidth = container.offsetWidth;
      const containerHeight = container.offsetHeight;

      const cols = Math.floor(containerWidth / itemWidth);
      const rows = Math.floor(containerHeight / itemHeight);
      const count = cols * rows;

      if (count > 0) {
        setItemsPerPage(count);
        setPage(0);
      }
    });

    resizeObserver.observe(item);
    window.addEventListener('resize', () => resizeObserver.observe(item));

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', () => resizeObserver.observe(item));
    };
  }, [itemsWithCID]);

  const start = page * itemsPerPage;
  const paginatedItems = itemsPerPage > 0 ? itemsWithCID.slice(start, start + itemsPerPage) : [];
  const totalPages = itemsPerPage > 0 ? Math.ceil(itemsWithCID.length / itemsPerPage) : 0;

  return (
    <StyledWrapper ref={containerRef} className={className}>
      {itemsWithCID.length > 0 && (
        <HiddenMeasure ref={measureRef}>
          <ItemPreview item={itemsWithCID[0]} />
        </HiddenMeasure>
      )}

      <StyledDiv>
        {paginatedItems.map((item) => (
          <div key={item.cid} style={{ breakInside: 'avoid', marginBottom: '1rem' }}>
            <ItemPreview item={item} />
          </div>
        ))}
      </StyledDiv>

      {totalPages > 1 && (
        <NavButtons>
          <button
            data-testid="nav-prev"
            onClick={() => setPage((p) => Math.max(p - 1, 0))} disabled={page === 0}>
            ←
          </button>
          <button
            data-testid="nav-next"
            onClick={() => setPage((p) => Math.min(p + 1, totalPages - 1))}
            disabled={page >= totalPages - 1}
          >
            →
          </button>
        </NavButtons>
      )}
    </StyledWrapper>
  );
}

const StyledWrapper = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 9999;
  background: white;
`;

const StyledDiv = styled.div`
  column-width: 300px;
  column-gap: 1rem;
  padding: 1rem;
  height: 100%;
  overflow: hidden;
`;

const HiddenMeasure = styled.div`
  visibility: hidden;
  position: absolute;
  top: -9999px;
  left: -9999px;
  pointer-events: none;
`;

const NavButtons = styled.div`
  position: absolute;
  bottom: 1rem;
  right: 1rem;
  display: flex;
  gap: 0.5rem;

  button {
    padding: 0.5rem 1rem;
    font-size: 1.2rem;
    border: none;
    background-color:white;
    color: white;
    border-radius: 4px;
    cursor: pointer;

    &:disabled {
      background-color: white;
      cursor: default;
    }
  }
`;

export default React.memo(ModulePreview);