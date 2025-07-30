import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  const [firstIndex, setFirstIndex] = useState(0);
  const [lastIndex, setLastIndex] = useState(itemsWithCID.length ? itemsWithCID.length - 1 : 0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [pageToSlice, setPageToSlice] = useState<Map<number, Slice>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  // 1) Keep an array of refs for the visible items on the current page
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]); // <= itemRef[]
  itemRefs.current = []; // clear before setting via callbacks on each render

  // 2) Store sizes parallel to itemRefs.current
  const [itemSizes, setItemSizes] = useState<Array<{ width: number; height: number }>>([]);

  console.log("itemSizes: ", itemSizes)

  // --- your existing sizing for itemsPerPage using a hidden measure ---
  const measureRef = useRef<HTMLDivElement>(null);


  // TODO: calculate here firstIndex and lastIndex for all pages
  useEffect(() => {
    if (true) {
      const container = containerRef.current;
      if (container) {
        const slices: Map<number, Slice> = new Map();
        let previousPageLastIndex = 0;
        let currentPageLength = 0;
        let currentPageNumber = 0;

        for (let i = 0; i < itemSizes.length; i++) {
          console.log("----")
          console.log("i: ", i)
          console.log("currentPageLength + itemSizes[i].height: ", currentPageLength + itemSizes[i].height)
          console.log("container.offsetHeight: ", container.offsetHeight)
          if (currentPageLength + itemSizes[i].height > container.offsetHeight) {
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

  console.log("pageToSlice: ", pageToSlice)

  // const paginatedItems = pageToSlice.size? itemsWithCID.slice(pageToSlice.get(page)?.from, pageToSlice.get(page)?.to) : itemsWithCID;
  const paginatedItems = itemsWithCID;
  console.log("page: ", page)
  console.log("paginatedItems: ", paginatedItems)
  // 3) Observe every visible item <div> to keep itemSizes in sync
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
      if(sizes.length && sizes[0].height){
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
  }, [itemsWithCID]); // re-run when the page changes or count changes

  return (
    <StyledWrapper ref={containerRef} className={className} data-testid="preview">

      <StyledDiv>
        {paginatedItems.map((item, i) => (
          <div
            key={item.cid}
            ref={(el) => {
              // 4) Store each node in itemRefs.current[i]
              itemRefs.current[i] = el;
            }}
            style={{ breakInside: 'avoid', marginBottom: '1rem' }}
          >
            <ItemPreview item={item} />
          </div>
        ))}
      </StyledDiv>

      {/* Example: you can read itemSizes anywhere you need */}
      {/* console.log or use it in layout logic */}
      {/* console.log('itemRefs:', itemRefs.current, 'itemSizes:', itemSizes) */}

      {(
        <NavButtons>
          <button
            data-testid="nav-prev"
            onClick={() => setPage((p) => Math.max(p - 1, 0))}
            disabled={firstIndex === 0}
          >
            ←
          </button>
          <button
            data-testid="nav-next"
            onClick={() => setPage((p) => p + 1)}
            disabled={lastIndex === itemsWithCID.length}
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
    background-color: white;
    color: blue;
    border-radius: 4px;
    cursor: pointer;

    &:disabled {
      background-color: white;
      cursor: default;
    }
  }
`;

export default React.memo(ModulePreview);