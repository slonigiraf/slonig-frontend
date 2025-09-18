import React, { useEffect, useRef, useState } from 'react';
import { styled } from '@polkadot/react-components';
import { ItemWithCID } from '../types.js';
import ItemPreview from './ItemPreview.js';

interface Props {
  className?: string;
  itemsWithCID: ItemWithCID[];
}

interface Slice {
  from: number;
  to: number;
}

function ModulePreview({ className = '', itemsWithCID }: Props): React.ReactElement<Props> {
  const [page, setPage] = useState(0);
  const [pageToSlice, setPageToSlice] = useState<Map<number, Slice>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  itemRefs.current = [];
  const [itemSizes, setItemSizes] = useState<Array<{ width: number; height: number }>>([]);

  useEffect(() => {
    if (itemSizes[0]?.width) {
      const container = containerRef.current;
      if (container) {
        const slices: Map<number, Slice> = new Map();
        let previousPageLastIndex = 0;
        let currentPageLength = 0;
        let currentPageNumber = 0;
        const columns = Math.floor(container.offsetWidth / itemSizes[0].width);

        for (let i = 0; i < itemSizes.length; i++) {
          if (currentPageLength + itemSizes[i].height > columns * container.offsetHeight) {
            slices.set(currentPageNumber, { from: previousPageLastIndex, to: i });
            previousPageLastIndex = i;
            currentPageNumber++;
            currentPageLength = 0;
          } else {
            currentPageLength = currentPageLength + itemSizes[i].height;
          }
        }
        slices.set(currentPageNumber, { from: previousPageLastIndex, to: itemSizes.length });
        setPageToSlice(slices);
      }
    }
  }, [JSON.stringify(itemSizes)]);

  const paginatedItems = pageToSlice.size ? itemsWithCID.slice(pageToSlice.get(page)?.from, pageToSlice.get(page)?.to) : itemsWithCID;

  useEffect(() => {
    if (itemRefs.current.length === 0) {
      setItemSizes([]);
      return;
    }

    const ro = new ResizeObserver(() => {
      const sizes = itemRefs.current.map((el) => ({
        width: el?.offsetWidth ?? 0,
        height: el?.offsetHeight ?? 0
      }));
      if (sizes.length && sizes[0].height) {
        setItemSizes(sizes);
      }
    });

    itemRefs.current.forEach((el) => el && ro.observe(el));

    // Initial measure (in case no resize is fired immediately)
    const initial = itemRefs.current.map((el) => ({
      width: el?.offsetWidth ?? 0,
      height: el?.offsetHeight ?? 0
    }));
    setItemSizes(initial);

    return () => ro.disconnect();
  }, [itemsWithCID]);

  return (
    <>
      <MeasureWrapper className={className} >
        <StyledDiv>
          {itemsWithCID.map((item, i) => (
            <div
              key={item.cid}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              style={{ breakInside: 'avoid', marginBottom: '1rem' }}
            >
              <ItemPreview item={item} />
            </div>
          ))}
        </StyledDiv>
      </MeasureWrapper>
      <StyledWrapper ref={containerRef} className={className} data-testid="preview">
        <StyledDiv>
          {paginatedItems.map((item) => (
            <div key={item.cid}>
              <ItemPreview item={item} />
            </div>
          ))}
        </StyledDiv>
        {(
          <NavButtons>
            <button
              data-testid="nav-prev"
              onClick={() => setPage((p) => Math.max(p - 1, 0))}
              disabled={pageToSlice.get(page)?.from === 0}
            >
              ←
            </button>
            <button
              data-testid="nav-next"
              onClick={() => setPage((p) => p + 1)}
              disabled={pageToSlice.get(page)?.to === itemsWithCID.length}
            >
              →
            </button>
          </NavButtons>
        )}
      </StyledWrapper>
    </>
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

const MeasureWrapper = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 9998;
  background: white;
`;

const StyledDiv = styled.div`
  /* CSS Columns */
  column-width: 300px;
  column-gap: 1rem;
  column-fill: auto;                 /* ← critical: fill first column, then next */

  /* WebKit prefixes (Safari/Chrome) */
  -webkit-column-width: 300px;
  -webkit-column-gap: 1rem;
  -webkit-column-fill: auto;

  /* Box + scrolling */
  padding: 1rem;
  height: 100%;
  overflow: auto;                    /* ← don't hide; allow scroll */

  /* Child items */
  > div {
    /* prevent breaking items across columns */
    break-inside: avoid-column;      /* modern syntax */
    -webkit-column-break-inside: avoid;
    page-break-inside: avoid;

    margin-bottom: 1rem;
    display: inline-block;           /* helps some engines treat each as a blocky unit */
    width: 100%;                     /* spans the column width */
  }
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
    background-color: white;
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