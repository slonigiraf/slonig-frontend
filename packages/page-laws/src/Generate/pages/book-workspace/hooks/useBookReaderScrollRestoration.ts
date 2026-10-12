// Copyright 2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { RefObject } from 'react';
import { useEffect } from 'react';

import type { ReaderPane } from '../../../shared/types/bookWorkspace.js';

// The reader scrolls in the document at normal size, and within these panels
// when maximized or when the PDF/Ability content exceeds their height.
const SCROLL_AREAS = [
  '.skillsArea', '.courseArea', '.pageArea', '.conceptsOutput',
  '.recognizedOutput', '.chaptersPanel .chapterEditor',
  '.embeddingHeatmapScroller', '.detailsArea'
];

export const readerWindowScrollKey = (bookId: number): string => `knowledge-upload-book-${bookId}-window-scroll`;
export const readerPaneScrollKey = (bookId: number, pane: ReaderPane): string => `knowledge-upload-book-${bookId}-${pane}-scroll`;

function storedPositions (key: string): Record<string, number> {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) || '{}');

    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

    return Object.fromEntries(Object.entries(value).filter(([, offset]) =>
      typeof offset === 'number' && Number.isFinite(offset) && offset >= 0
    ));
  } catch {
    return {};
  }
}

/** Keep each book/pane's scroll location across a reload, including late-loading Abilities. */
export function useBookReaderScrollRestoration (
  rootRef: RefObject<HTMLDivElement>, bookId: number, pane: ReaderPane, isMaximized: boolean
): void {
  useEffect(() => {
    const root = rootRef.current;

    if (!root) return;

    const paneKey = readerPaneScrollKey(bookId, pane);
    const windowKey = readerWindowScrollKey(bookId);
    const positions = storedPositions(paneKey);
    const pending = new Map(Object.entries(positions).filter(([, top]) => top > 0));
    let windowTarget = 0;

    try {
      windowTarget = Math.max(0, Number(sessionStorage.getItem(windowKey)) || 0);
    } catch {
      // Session storage may be disabled.
    }

    let pendingWindow = !isMaximized && windowTarget > 0;
    let programmedWindow = 0;
    const programmedPositions = new Map<string, number>();
    let applying = false;
    let frame = 0;
    let disposed = false;
    const watched = new Set<Element>();

    const panels = (): Array<{ key: string; element: HTMLElement }> => SCROLL_AREAS.flatMap((selector) =>
      Array.from(root.querySelectorAll<HTMLElement>(selector), (element, index) => ({ key: `${selector}:${index}`, element }))
    );
    const persistPane = (): void => {
      try { sessionStorage.setItem(paneKey, JSON.stringify(positions)); } catch { /* Privacy mode. */ }
    };
    const persistWindow = (): void => {
      if (!isMaximized && !pendingWindow) {
        try { sessionStorage.setItem(windowKey, String(window.scrollY)); } catch { /* Privacy mode. */ }
      }
    };

    const observer = new MutationObserver(() => scheduleRestore());
    const resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => scheduleRestore());

    function restore (): void {
      frame = 0;
      if (disposed) return;
      applying = true;

      for (const { element, key } of panels()) {
        if (!watched.has(element)) {
          watched.add(element);
          resizeObserver?.observe(element);
          if (element.firstElementChild) resizeObserver?.observe(element.firstElementChild);
        }
        const top = pending.get(key);
        if (top === undefined) continue;
        element.scrollTop = top;
        programmedPositions.set(key, element.scrollTop);
        if (Math.abs(element.scrollTop - top) <= 1) pending.delete(key);
      }

      if (pendingWindow) {
        window.scrollTo(0, windowTarget);
        programmedWindow = window.scrollY;
        if (Math.abs(window.scrollY - windowTarget) <= 1) pendingWindow = false;
      }
      applying = false;
      if (!pending.size && !pendingWindow) {
        observer.disconnect();
        resizeObserver?.disconnect();
      }
    }

    function scheduleRestore (): void {
      if (!frame && !disposed && (pending.size > 0 || pendingWindow)) frame = requestAnimationFrame(restore);
    }

    const onPanelScroll = (event: Event): void => {
      if (applying) return;
      const item = panels().find(({ element }) => element === event.target);

      if (!item) return;
      // Browsers dispatch scroll asynchronously, sometimes with isTrusted=true
      // even for a programmatic scroll. Do not save an incomplete restoration.
      if (pending.has(item.key) && Math.abs(item.element.scrollTop - (programmedPositions.get(item.key) ?? 0)) <= 1) return;
      pending.delete(item.key);
      positions[item.key] = item.element.scrollTop;
      persistPane();
    };
    const onWindowScroll = (): void => {
      if (applying || isMaximized || (pendingWindow && Math.abs(window.scrollY - programmedWindow) <= 1)) return;
      pendingWindow = false;
      persistWindow();
    };
    const onPageHide = (): void => {
      for (const { element, key } of panels()) {
        if (!pending.has(key)) positions[key] = element.scrollTop;
      }
      persistPane();
      persistWindow();
    };

    root.addEventListener('scroll', onPanelScroll, true);
    window.addEventListener('scroll', onWindowScroll, { passive: true });
    window.addEventListener('pagehide', onPageHide);
    if (pending.size || pendingWindow) {
      observer.observe(root, { childList: true, characterData: true, subtree: true });
      resizeObserver?.observe(root);
      resizeObserver?.observe(document.documentElement);
      scheduleRestore();
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver?.disconnect();
      root.removeEventListener('scroll', onPanelScroll, true);
      window.removeEventListener('scroll', onWindowScroll);
      window.removeEventListener('pagehide', onPageHide);
      // Scroll events save positions immediately; don't overwrite them with
      // the new pane's 0px position while switching tabs.
    };
  }, [bookId, isMaximized, pane, rootRef]);
}
