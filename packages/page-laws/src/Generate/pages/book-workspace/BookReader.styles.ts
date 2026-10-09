// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { styled } from '@polkadot/react-components';

export const StyledReader = styled.div`
  position: relative;
  &.isMaximized {
    background: var(--bg-page);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
    inset: 0;
    overflow: hidden;
    padding: 1rem;
    position: fixed;
    width: 100vw;
    z-index: 1000;
  }

  &.isMaximized .readerColumns {
    flex: 1;
    grid-template-rows: auto minmax(0, 1fr);
    height: auto;
    min-height: 0;
  }

  &.isMaximized .readerColumns.conceptColumns,
  &.isMaximized .readerColumns.courseColumns {
    grid-template-rows: minmax(0, 1fr);
  }

  &.isMaximized .conceptPaneColumn {
    height: 100%;
    min-height: 0;
  }

  &.isMaximized .detailsArea,
  &.isMaximized .pageArea,
  &.isMaximized .skillsArea,
  &.isMaximized .courseArea {
    height: 100%;
    min-height: 0;
  }

  &.isMaximized .courseArea {
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .pageNavigation {
    align-items: center;
    display: grid;
    gap: 0.75rem;
    grid-template-columns: auto auto auto minmax(10rem, 1fr);
    margin-bottom: 1rem;
    grid-column: 1 / -1;
  }

  .chapterNavigation {
    align-items: center;
    display: flex;
    gap: 0.75rem;
    grid-column: 1 / -1;
    margin-bottom: 1rem;
  }

  .conceptPaneColumn {
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
  }

  .conceptPaneColumn > .detailsArea {
    flex: 1;
  }

  .conceptPaneColumn > .pageArea {
    flex: 1;
    min-height: 0;
  }

  .conceptPaneNavigation {
    grid-column: auto;
  }

  .compactPageNavigation {
    grid-template-columns: auto auto auto;
  }

  .chapterSelectGroup {
    align-items: center;
    display: flex;
    flex: 1;
    gap: 0.5rem;
    min-width: 0;
  }

  .chapterNavigation label {
    align-items: center;
    display: flex;
    flex: 1;
    gap: 0.5rem;
    min-width: 0;
  }

  .chapterNavigation select {
    background: var(--bg-input);
    border: 1px solid #dde1eb;
    border-radius: 0.25rem;
    color: var(--color-text);
    flex: 1;
    min-width: 0;
    padding: 0.55rem;
  }

  .chapterNavigation span {
    white-space: nowrap;
  }

  .languageDetails { height: auto; min-height: 0; }
  .languagePanel { min-height: 0; }
  .languageActions { align-items: flex-start; display: flex; flex-direction: column; gap: 1rem; padding: 0.25rem 0; }
  .languageButtonGrid { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .languageButtonGrid button { background: var(--bg-input); border: 1px solid #dde1eb; border-radius: 0.35rem; color: var(--color-text); cursor: pointer; padding: 0.55rem 0.75rem; }
  .languageButtonGrid button:hover:not(:disabled), .languageButtonGrid button.selected { border-color: var(--color-primary, #2f6feb); }
  .languageButtonGrid button.selected { font-weight: 600; }
  .languageButtonGrid button:disabled { cursor: default; opacity: 0.5; }
  .ageManualEditor { align-items: end; display: flex; flex-wrap: wrap; gap: 0.75rem; }
  .ageManualEditor label { display: grid; font-weight: 600; gap: 0.35rem; }
  .ageManualEditor input { background: var(--bg-input); border: 1px solid #dde1eb; border-radius: 0.35rem; box-sizing: border-box; color: var(--color-text); font: inherit; min-width: 8rem; padding: 0.6rem 0.7rem; width: 8rem; }
  .ageManualEditor input:focus { border-color: var(--color-primary, #2f6feb); outline: none; }
  .ageSampleNote { margin: 0; max-width: 50rem; opacity: 0.8; }

  .chaptersPanel .chapterEditor { display: flex; flex-direction: column; gap: 1rem; }
  &.isMaximized .chaptersPanel .chapterEditor { flex: 1; min-height: 0; overflow-y: auto; padding-right: 0.25rem; }
  .chaptersPanel .chapterEditor > h3, .chaptersPanel .chapterEditor > p { margin: 0; }
  .chaptersPanel .chapterEditor label { display: flex; flex-direction: column; gap: 0.4rem; }
  .chaptersPanel .chapterEditor select { background: var(--bg-input); border: 1px solid #dde1eb; border-radius: 0.25rem; color: var(--color-text); padding: 0.55rem; width: 100%; }
  .chapterEditRow { align-items: flex-end; display: grid; gap: 0.5rem; grid-template-columns: minmax(0, 1fr) auto; }
  .headingEvidence, .chapterList { border-top: 1px solid #dde1eb; padding-top: 0.75rem; }
  .headingEvidence h4 { margin: 0 0 0.5rem; }
  .chapterList h4 { margin: 0; }
  .headingEvidence ul { margin: 0; padding-left: 1.4rem; }
  .chapterListHeader { align-items: center; display: flex; gap: 0.75rem; justify-content: space-between; margin-bottom: 0.35rem; }
  .chapterListHint { margin: 0 0 0.65rem; opacity: 0.75; }
  .chapterRows { display: flex; flex-direction: column; gap: 0.35rem; }
  .chapterListRow { align-items: center; display: flex; gap: 0.5rem; min-height: 2rem; }
  .chapterListRow .inList { flex: 0 0 auto; margin: 0; }
  .chapterNumber { flex: 0 0 auto; font-variant-numeric: tabular-nums; text-align: right; width: 1.75rem; }
  .chapterList .chapterLink { background: none; border: 0; color: var(--color-link, #2f6feb); cursor: pointer; padding: 0; text-align: left; }


  .pageNavigation label {
    align-items: center;
    display: flex;
    gap: 0.5rem;
    white-space: nowrap;
  }

  .pageNavigation input[type='number'] {
    background: var(--bg-input);
    border: 1px solid #dde1eb;
    border-radius: 0.25rem;
    color: var(--color-text);
    padding: 0.55rem;
    width: 5rem;
  }

  .unrecognizedPages {
    background: var(--bg-input);
    border: 1px solid #dde1eb;
    border-radius: 0.25rem;
    color: var(--color-text);
    grid-column: 4;
    grid-row: 2;
    justify-self: start;
    max-width: 14rem;
    padding: 0.55rem;
  }

  .rerecognizePage {
    display: flex;
    justify-content: flex-start;
    padding-top: 0.75rem;
  }

  .pageScroller {
    cursor: pointer;
    grid-column: 4;
    grid-row: 1;
    min-width: 0;
    width: 100%;
  }

  .readerColumns {
    align-items: stretch;
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(0, 1fr) minmax(18rem, 1fr);
  }

  .detailsArea {
    background: var(--bg-input);
    border: 1px solid #dde1eb;
    border-radius: 0.5rem;
    box-sizing: border-box;
    height: var(--page-height, auto);
    min-width: 0;
    overflow: hidden;
  }

  .fullWidthDetails, .fullWidthPage {
    grid-column: 1 / -1;
  }

  .pageArea {
    box-sizing: border-box;
    min-width: 0;
    overflow: auto;
    text-align: center;
  }

  .skillsArea {
    grid-column: 1 / -1;
    height: var(--page-height, auto);
    min-width: 0;
    overflow: auto;
  }

  .courseArea {
    grid-column: 1 / -1;
    min-width: 0;
  }

  .pageArea canvas {
    background: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
    display: inline-block;
    height: auto;
    max-width: 100%;
  }

  .detailsArea {
    display: flex;
    flex-direction: column;
  }

  .readerTabs {
    align-items: center;
    border-bottom: 1px solid #dde1eb;
    display: flex;
    flex-wrap: wrap;
    row-gap: 0;
  }

  .readerTabs button {
    background: transparent;
    border: 0;
    border-bottom: 2px solid transparent;
    color: #8b8b8b;
    cursor: pointer;
    font: inherit;
    padding: 0.9rem 1.25rem;
    white-space: nowrap;
  }

  .readerTabs button.active {
    border-bottom-color: var(--color-text);
    color: var(--color-text);
    font-weight: 600;
  }

  .tabPanel {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    padding: 1rem;
  }

  .detailsHeader {
    align-items: center;
    display: flex;
    justify-content: space-between;
    font-weight: 600;
    margin-bottom: 0.75rem;
  }

  .missingExerciseNavigation {
    align-items: baseline;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin: -0.2rem 0 0.75rem;
  }

  .missingExerciseLinks button {
    background: none;
    border: 0;
    color: var(--color-primary, #2f6feb);
    cursor: pointer;
    font: inherit;
    padding: 0;
    text-decoration: underline;
  }

  .missingExerciseLinks button:hover, .missingExerciseLinks button:focus-visible {
    text-decoration-thickness: 2px;
  }

  .exerciseConceptCard {
    background: var(--bg-input);
    border: 1px solid #dde1eb;
    border-radius: 0.7rem;
    box-shadow: 0 1px 2px rgba(24, 39, 75, 0.04);
    box-sizing: border-box;
    margin-bottom: 1rem;
    padding: 0.95rem 1rem 1rem;
  }

  .exerciseConceptCard:focus {
    outline: none;
  }

  .conceptExerciseRank {
    font-variant-numeric: tabular-nums;
  }

  .generationControls, .recognitionControls {
    align-items: center;
    display: flex;
    gap: 0.5rem;
  }

  .generationControls .modelSelect {
    min-width: 11rem;
  }

  .conceptsOutput {
    border: 1px solid #dde1eb;
    border-radius: 0.25rem;
    box-sizing: border-box;
    color: var(--color-text);
    flex: 1;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    padding: 1rem;
    width: 100%;
  }

  .conceptsOutput h3 {
    margin-top: 0;
  }

  .standardsPanel .detailsHeader {
    gap: 1rem;
  }

  .standardsPanel .generationControls {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .standardsFramework + .standardsFramework {
    border-top: 1px solid #dde1eb;
    margin-top: 1rem;
    padding-top: 1rem;
  }

  .standardsFramework h4 {
    margin: 0 0 0.5rem;
  }

  .standardsFramework ul {
    margin: 0;
    padding-left: 1.4rem;
  }

  .standardsFramework code {
    font-size: 0.95em;
  }

  .standardHeading {
    align-items: baseline;
    display: flex;
    gap: 0.55rem;
  }

  .standardDistance {
    border: 1px solid #d5d9e3;
    border-radius: 0.35rem;
    font-family: monospace;
    font-size: 0.82em;
    line-height: 1.25;
    padding: 0.08rem 0.28rem;
    white-space: nowrap;
  }

  .standardsSpend {
    margin-top: 0.6rem;
    opacity: 0.8;
  }

  .embeddingsPanel {
    overflow: hidden;
  }

  .embeddingScopeTabs {
    border: 1px solid #d5d9e3;
    border-radius: 0.4rem;
    display: inline-flex;
    overflow: hidden;
  }

  .embeddingScopeTabs button {
    background: transparent;
    border: 0;
    color: var(--color-text);
    cursor: pointer;
    font: inherit;
    padding: 0.38rem 0.65rem;
  }

  .embeddingScopeTabs button + button {
    border-left: 1px solid #d5d9e3;
  }

  .embeddingScopeTabs button.active {
    background: rgba(47, 111, 235, 0.14);
    font-weight: 600;
  }

  .embeddingHeatmapIntro {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1rem;
    margin-bottom: 0.75rem;
  }

  .embeddingHeatmapIntro > strong {
    flex-basis: 100%;
  }

  .embeddingHeatmapIntro > span {
    opacity: 0.8;
  }

  .embeddingHeatmapIntro .embeddingCacheWarning {
    color: #9a6700;
    font-weight: 600;
    opacity: 1;
  }

  .embeddingHeatmapScroller {
    border: 1px solid #dde1eb;
    border-radius: 0.35rem;
    flex: 1;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
  }

  .embeddingHeatmap {
    border-collapse: separate;
    border-spacing: 1px;
    font-size: 0.74rem;
    min-width: max-content;
  }

  .embeddingHeatmap th, .embeddingHeatmap td {
    box-sizing: border-box;
    height: 2.15rem;
  }

  .embeddingHeatmap thead th {
    background: var(--bg-input);
    min-width: 3.15rem;
    position: sticky;
    text-align: center;
    top: 0;
    z-index: 2;
  }

  .embeddingHeatmap tbody th, .embeddingHeatmapCorner {
    background: var(--bg-input);
    left: 0;
    max-width: 18rem;
    min-width: 13rem;
    overflow: hidden;
    padding: 0 0.5rem;
    position: sticky;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
    z-index: 1;
  }

  .embeddingHeatmap .embeddingHeatmapCorner {
    z-index: 3;
  }

  .embeddingHeatmap tbody th span {
    display: inline-block;
    font-variant-numeric: tabular-nums;
    opacity: 0.65;
    text-align: right;
    width: 2rem;
  }

  .embeddingHeatmap td {
    font-family: monospace;
    font-variant-numeric: tabular-nums;
    min-width: 3.15rem;
    padding: 0.25rem;
    text-align: center;
  }

  .conceptsOutput li + li {
    margin-top: 1rem;
  }

  .conceptsOutput p {
    margin: 0.25rem 0 0;
  }

  .exerciseList {
    list-style: none;
    margin: 0.8rem 0 0;
    padding: 0;
  }

  .conceptList {
    display: grid;
    gap: 0.8rem;
    list-style: none;
    margin: 0.8rem 0 0;
    padding: 0;
  }

  .conceptList > li + li {
    margin-top: 0;
  }

  .conceptsOutput.conceptDragging {
    cursor: grabbing;
    user-select: none;
  }

  .conceptsOutput .exerciseImage {
    border: 1px solid var(--border-table);
    border-radius: 0.35rem;
    display: block;
    margin-top: 0.5rem;
    max-height: 18rem;
    max-width: min(100%, 32rem);
    object-fit: contain;
  }

  .recognizedOutput {
    border: 1px solid #dde1eb;
    border-radius: 0.25rem;
    box-sizing: border-box;
    color: var(--color-text);
    flex: none;
    height: 31rem;
    margin: 0;
    min-height: 0;
    overflow-x: auto;
    overflow-y: auto;
    padding: 1rem;
    word-break: break-word;
  }

  .detailsArea.hasPageHeight .recognizedOutput {
    flex: 1;
    height: auto;
  }

  &.isMaximized .recognizedOutput {
    flex: 1;
    height: auto;
  }

  .recognizedOutput img, .recognizedOutput svg {
    height: auto;
    max-width: 100%;
  }

  .emptyOutput, .recognitionHint {
    color: #777;
  }

  .recognitionHint {
    margin-top: 0;
  }

  .readerError {
    color: #9f3a38;
  }

  @media only screen and (max-width: 800px) {
    .pageNavigation {
      grid-template-columns: auto 1fr auto;
    }

    .pageScroller {
      grid-column: 1 / -1;
      grid-row: auto;
    }

    .unrecognizedPages {
      grid-column: 1 / -1;
      grid-row: auto;
    }

    .readerColumns {
      grid-template-columns: 1fr;
      height: auto;
    }

    .detailsArea {
      height: auto;
    }

    .pageArea {
      height: auto;
    }

    .conceptsOutput {
      min-height: 20rem;
    }

    .recognizedOutput {
      height: 19rem;
    }

    &.isMaximized .recognizedOutput {
      height: auto;
      min-height: 20rem;
    }
  }
`;
