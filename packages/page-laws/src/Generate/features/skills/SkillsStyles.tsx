// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { styled } from '@polkadot/react-components';

export const FixResultsReviewContent = styled.div`
  .fixResultsReviewIntro {
    margin-bottom: 1rem;
  }

  .fixResultsReviewIntro p {
    margin: 0.25rem 0;
  }

  .fixResultsReviewComparison {
    border: 1px solid #dde1eb;
    border-radius: 0.5rem;
    box-sizing: border-box;
    display: grid;
    gap: 0.9rem;
    max-height: min(52vh, 38rem);
    min-height: 10rem;
    overflow: auto;
    padding: 0.75rem;
  }

  .fixResultsReviewItem {
    border-top: 1px solid var(--border-table);
    padding-top: 0.9rem;
  }

  .fixResultsReviewItem:first-child {
    border-top: 0;
    padding-top: 0;
  }

  .fixResultsReviewItem > strong {
    display: block;
    margin-bottom: 0.55rem;
    overflow-wrap: anywhere;
  }

  .fixResultsReviewContext {
    margin: -0.25rem 0 0.6rem;
  }

  .fixResultsReviewRow {
    align-items: stretch;
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .fixResultsReviewCell {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    min-width: 0;
  }

  .fixResultsReviewChangeLabel {
    display: block;
    font-size: 0.82rem;
    font-weight: 600;
    line-height: 1.2;
    margin: 0;
    opacity: 0.72;
    padding-left: 0.1rem;
  }

  .fixResultsReviewCard {
    background: var(--bg-input);
    border: 1px solid #dde1eb;
    border-radius: 0.6rem;
    box-sizing: border-box;
    flex: 1 1 auto;
    min-width: 0;
    padding: 0.8rem 0.9rem;
  }

  .fixResultsReviewCard.isProposed {
    border-color: var(--color-primary, #1682d4);
    box-shadow: inset 3px 0 0 var(--color-primary, #1682d4);
  }

  .fixResultsReviewCard p {
    line-height: 1.5;
    margin: 0.45rem 0 0;
    overflow-wrap: anywhere;
  }

  .fixResultsReviewCard .solution {
    border-left: 0.2rem solid var(--border-table);
    margin: 0.55rem 0 0;
    padding-left: 0.75rem;
  }

  .fixResultsReviewCard pre {
    max-height: 14rem;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .fixResultsReviewHeading {
    align-items: flex-start;
    display: flex;
    gap: 0.75rem;
    justify-content: space-between;
  }

  .fixResultsReviewHeading > strong {
    line-height: 1.35;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .fixResultsReviewMeta {
    align-items: center;
    display: flex;
    flex-shrink: 0;
    gap: 0.35rem;
  }

  .fixResultsReviewId,
  .fixResultsReviewProposed {
    border-radius: 999px;
    font-size: 0.78em;
    line-height: 1.2;
    padding: 0.25rem 0.5rem;
    white-space: nowrap;
  }

  .fixResultsReviewId {
    background: rgba(47, 111, 235, 0.08);
    border: 1px solid rgba(47, 111, 235, 0.18);
  }

  .fixResultsReviewProposed {
    background: rgba(22, 130, 212, 0.12);
    border: 1px solid rgba(22, 130, 212, 0.28);
    font-weight: 600;
  }

  .fixResultsReviewRemoved {
    align-items: center;
    border: 1px dashed #dde1eb;
    border-radius: 0.6rem;
    box-sizing: border-box;
    display: flex;
    flex: 1 1 auto;
    justify-content: center;
    min-height: 4.5rem;
    opacity: 0.65;
    padding: 0.8rem 0.9rem;
    text-align: center;
  }

  .fixResultsDifference {
    border-top: 1px solid #dde1eb;
    margin-top: 1rem;
    padding-top: 1rem;
  }

  .fixResultsDifference h3 {
    margin: 0 0 0.6rem;
  }

  .fixResultsDifference p {
    margin: 0.25rem 0;
  }

  .fixResultsDifference ul,
  .fixResultsDifference ol {
    margin: 0.6rem 0 0;
    padding-left: 1.4rem;
  }

  .fixResultsDifference li + li {
    margin-top: 0.35rem;
  }

  .fixResultsReviewCard .tikzDiagnostics,
  .fixResultsReviewCard .tikzCodeDiff {
    background: var(--bg-input);
    border: 1px solid var(--border-table);
    border-radius: 0.3rem;
    box-sizing: border-box;
    font-size: 0.78rem;
    max-height: 16rem;
    overflow: auto;
    padding: 0.6rem;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .fixResultsReviewCard .tikzDiagnostics {
    color: #9f3a38;
    max-height: 8rem;
  }

  @media (max-width: 760px) {
    .fixResultsReviewRow {
      gap: 0.6rem;
      grid-template-columns: 1fr;
    }

    .fixResultsReviewComparison {
      max-height: 48vh;
    }
  }
`;

export const EditForm = styled.div`
  box-sizing: border-box;
  display: grid;
  gap: 1rem;
  margin: 0 auto;
  max-width: 48rem;
  padding: 0.25rem 0;
  width: 100%;

  > label, fieldset > label {
    color: var(--color-text);
    display: grid;
    font-weight: 600;
    gap: 0.4rem;
    margin: 0;
    text-align: left;
    text-transform: none;
    width: 100%;
  }

  > label > span, fieldset > label > span {
    line-height: 1.25;
    text-transform: none;
  }

  input, textarea {
    background: var(--bg-input, #fff);
    border: 1px solid var(--border-table, #cfd5e1);
    border-radius: 0.45rem;
    box-sizing: border-box;
    color: var(--color-text);
    font: inherit;
    font-weight: 400;
    line-height: 1.45;
    margin: 0;
    outline: none;
    padding: 0.65rem 0.75rem;
    text-align: left;
    text-transform: none;
    width: 100%;
  }

  input {
    min-height: 2.75rem;
  }

  textarea {
    min-height: 5.5rem;
    resize: vertical;
  }

  input:focus, textarea:focus {
    border-color: var(--color-primary, #1682d4);
    box-shadow: 0 0 0 2px rgba(22, 130, 212, 0.12);
  }

  input:disabled, textarea:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }

  fieldset {
    border: 1px solid var(--border-table, #cfd5e1);
    border-radius: 0.55rem;
    box-sizing: border-box;
    display: grid;
    gap: 1.1rem;
    margin: 0;
    min-width: 0;
    padding: 1rem;
    width: 100%;
  }

  legend {
    color: var(--color-text);
    font-weight: 700;
    padding: 0 0.4rem;
    text-transform: none;
  }

  .editActions {
    align-items: center;
    display: flex;
    gap: 0.65rem;
    justify-content: flex-end;
    padding-top: 0.25rem;
  }

  @media only screen and (max-width: 600px) {
    gap: 0.8rem;

    fieldset {
      padding: 0.75rem;
    }

    .editActions {
      flex-wrap: wrap;
    }
  }
`;

export const StyledSkills = styled.div`
  background: var(--bg-page); border-radius: 0.5rem; box-sizing: border-box; min-width: 0; padding: 1rem; position: relative; width: 100%;
  &.pipelineOnly { background: transparent; border-radius: 0; margin-top: 0; padding: 0; }
  .pipeline {
    --pipeline-control-height: 3.125rem;
    align-items: center;
    display: grid;
    gap: 0.65rem;
    grid-template-columns: minmax(0, 1fr) auto;
    margin-bottom: 0.75rem;
    width: 100%;
  }

  .pipelineStageColumn { display: grid; gap: 0.35rem; min-width: 0; }
  .pipelineSkipButton.ui--Button { justify-self: start; margin: 0; max-width: 100%; white-space: normal; }

  /* Keep the run button visually attached to the same Dropdown component used
     elsewhere in the app. This means the opened menu inherits the app's normal
     dropdown styling instead of maintaining a second, custom menu implementation. */
  .pipelineRunGroup {
    align-items: stretch;
    display: grid;
    gap: 0;
    grid-template-columns: var(--pipeline-control-height) minmax(0, 1fr);
    height: var(--pipeline-control-height);
    min-height: var(--pipeline-control-height);
    min-width: 0;
    width: 100%;
  }

  .pipelineRunButton {
    align-items: center;
    align-self: stretch;
    background: var(--color-primary, #f28c00);
    border: 1px solid var(--color-primary, #f28c00);
    border-radius: 0.5rem 0 0 0.5rem;
    color: #fff;
    cursor: pointer;
    display: flex;
    font: inherit;
    height: var(--pipeline-control-height);
    justify-content: center;
    margin: 0;
    min-height: var(--pipeline-control-height);
    min-width: 0;
    padding: 0;
    position: relative;
    z-index: 1;
  }

  .pipelineRunButton span {
    display: block;
    font-size: 1.05rem;
    line-height: 1;
    transform: translateX(0.04rem);
  }

  .pipelineRunButton:hover:not(:disabled) {
    filter: brightness(0.96);
  }

  .pipelineRunButton:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--color-primary, #f28c00) 40%, white);
    outline-offset: -4px;
  }

  .pipelineRunButton:disabled {
    cursor: default;
    opacity: 0.48;
  }

  .pipelineStageDropdown.ui--Dropdown {
    align-self: stretch;
    box-sizing: border-box;
    height: var(--pipeline-control-height);
    margin: 0 !important;
    min-height: var(--pipeline-control-height);
    min-width: 0;
    padding: 0 !important;
    width: 100%;
  }

  /* Keep the app's normal Semantic/Polkadot dropdown menu, but remove the
     Labelled component's empty-label spacing from this toolbar-sized control. */
  .pipelineStageDropdown.ui--Dropdown > .ui.dropdown,
  .pipelineStageDropdown.ui--Dropdown .ui.selection.dropdown {
    align-items: center !important;
    border-bottom-left-radius: 0 !important;
    border-left-width: 0 !important;
    border-top-left-radius: 0 !important;
    box-sizing: border-box;
    display: flex !important;
    height: var(--pipeline-control-height) !important;
    margin: 0 !important;
    min-height: var(--pipeline-control-height) !important;
    min-width: 0 !important;
    max-width: 100%;
    padding: 0 2.35rem 0 0.95rem !important;
    width: 100%;
  }

  .pipelineStageDropdown.ui--Dropdown .ui.selection.dropdown > .text {
    display: block !important;
    line-height: 1.2 !important;
    margin: 0 !important;
    min-height: 0 !important;
    padding: 0 !important;
    position: static !important;
    transform: none !important;
  }

  .pipelineStageDropdown.ui--Dropdown .ui.selection.dropdown > .dropdown.icon {
    margin: 0 !important;
    right: 0.9rem !important;
    top: 50% !important;
    transform: translateY(-50%) !important;
  }

  .pipelineControls {
    align-items: stretch;
    box-sizing: border-box;
    display: flex;
    gap: 0.9rem;
    min-width: max-content;
    padding-left: 0.35rem;
    white-space: nowrap;
  }

  /* Keep pipeline controls on the shared app button treatment. Only normalize
     their sizing here so the normal background/text hover styles still apply. */
  .pipelineControls .ui--Button {
    height: var(--pipeline-control-height);
    margin: 0;
    min-height: var(--pipeline-control-height);
  }

  .pipelineFastForwardButton,
  .pipelinePriceButton,
  .pipelineZoomButton {
    flex: 0 0 auto;
    min-width: 0;
  }

  .pipelineFastForwardButton {
    margin-left: 0.75rem !important;
  }

  .pipelinePriceButton {
    margin-left: 0 !important;
    margin-right: 0.25rem !important;
  }
  @media only screen and (max-width: 650px) {
    .pipeline { grid-template-columns: minmax(0, 1fr); }
    .pipelineControls { flex-wrap: wrap; min-width: 0; padding-left: 0; white-space: normal; }
    .pipelineFastForwardButton { margin-left: 0 !important; }
  }
  .modelSelect { min-width: 11rem; }
  .chapterNavigation { align-items: center; display: grid; gap: 0.5rem; grid-template-columns: auto minmax(14rem, 1fr) auto minmax(8rem, 1fr) auto auto; margin-bottom: 1rem; }
  .exercisesChapterNavigation { background: var(--bg-page); display: flex; gap: 0.75rem; padding: 0.5rem 0; position: sticky; top: 0; z-index: 2; }
  .chapterSelectGroup { align-items: center; display: flex; flex: 1; gap: 0.5rem; min-width: 0; }
  .exercisesChapterNavigation label { align-items: center; display: flex; flex: 1; gap: 0.5rem; min-width: 0; }
  .exercisesChapterNavigation select { background: var(--bg-input); border: 1px solid #dde1eb; border-radius: 0.25rem; color: var(--color-text); flex: 1; min-width: 0; padding: 0.55rem; }
  .exercisesChapterNavigation span { white-space: nowrap; }
  .chapterEditor { display: grid; gap: 1rem; }
  .columns { display: grid; gap: 1rem; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .columns > section, .singlePane { border: 1px solid var(--border-table); border-radius: 0.4rem; min-width: 0; overflow: auto; padding: 1rem; }
  /* Exercises and abilities share the same in-flow action layout. A fixed
     right-side reservation previously pushed exercise cards past mobile viewports. */
  .contentCard { border: 1px solid var(--border-table); border-radius: 0.4rem; box-sizing: border-box; margin-bottom: 0.75rem; min-width: 0; overflow-wrap: anywhere; padding: 0.85rem 1rem 1rem; position: relative; }
  .contentCardActions { align-items: center; display: flex; flex-wrap: wrap; gap: 0.35rem; justify-content: flex-end; margin-bottom: 0.75rem; max-width: 100%; min-width: 0; position: static; }
  .contentCard > strong { display: block; overflow-wrap: anywhere; }
  .fixReviewList { max-height: 60vh; overflow: auto; }
  .fixReviewItem { border-top: 1px solid var(--border-table); padding: 0.75rem 0; }
  .fixReviewItem:first-child { border-top: 0; }
  .fixReviewItem p { margin: 0.35rem 0; }
  .fixReviewItem h5 { margin: 0.75rem 0 0.35rem; }
  .fixReviewItem ul { margin: 0.5rem 0 0; padding-left: 1.4rem; }
  .fixedAbilityPreview { border-left: 3px solid var(--border-table); padding-left: 0.75rem; }
  .duplicateReviewList { max-height: 60vh; overflow: auto; }
  .duplicateReviewItem { border-top: 1px solid var(--border-table); padding: 0.9rem 0; }
  .duplicateReviewItem:first-child { border-top: 0; }
  .duplicatePairComparison { display: grid; gap: 1rem; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 0.6rem; }
  .duplicateAbilitySide { border: 1px solid var(--border-table); border-radius: 0.4rem; min-width: 0; padding: 0.75rem; }
  .duplicateAbilitySide h5 { margin: 0 0 0.5rem; }
  .duplicateAbilitySide p { margin: 0.35rem 0; overflow-wrap: anywhere; }
  .duplicateAbilitySide > strong { display: block; margin: 0.5rem 0; overflow-wrap: anywhere; }
  .duplicateAbilitySide pre { max-height: 12rem; overflow: auto; white-space: pre-wrap; }
  .abilitiesPane { width: 100%; }
  .missingAbilityNavigation { align-items: baseline; display: flex; flex-wrap: wrap; gap: 0.35rem; margin: -0.2rem 0 0.75rem; }
  .missingAbilityLinks button { background: none; border: 0; color: var(--color-primary, #2f6feb); cursor: pointer; font: inherit; padding: 0; text-decoration: underline; }
  .missingAbilityLinks button:hover, .missingAbilityLinks button:focus-visible { text-decoration-thickness: 2px; }
  .abilityExerciseCard { background: var(--bg-input); border: 1px solid #dde1eb; border-radius: 0.7rem; box-shadow: 0 1px 2px rgba(24, 39, 75, 0.04); box-sizing: border-box; margin-bottom: 1rem; padding: 0.95rem 1rem 1rem; }
  .abilityExerciseCard:focus { outline: none; }
  .abilityConceptCard > h4 { margin: 0 0 0.35rem; }
  .abilityConceptCard > p { margin: 0.35rem 0 0.85rem; }
  .abilityConceptCard .matchedAbilities { margin-top: 0.6rem; }
  .matchedAbilities { margin: 0.6rem 0 0.75rem; }
  .matchedAbilities .contentCard { background: var(--bg-input); }
  .matchedAbilities .contentCard:last-child { margin-bottom: 0; }
  .noAbility { color: var(--color-label); margin: 0; padding: 0.75rem 0; }
  .unmatchedAbilities { border-top: 1px solid var(--border-table); margin-top: 1rem; padding-top: 1rem; }
  .contentCard p { margin: 0.35rem 0; }
  .contentCard .solution { border-left: 0.2rem solid var(--border-table); margin: 0.5rem 0; padding-left: 0.75rem; }
  .exerciseImage { border: 1px solid var(--border-table); border-radius: 0.35rem; display: block; max-height: 18rem; max-width: min(100%, 32rem); object-fit: contain; }
  .errorMessage { color: #9f3a38; }
  .noticeMessage { color: var(--color-label); }
  .visualPrompt { border-left: 3px solid var(--border-table); padding-left: 0.65rem; }
  .tikzDiffGrid { display: grid; gap: 1rem; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 0.75rem; }
  .tikzDiffGrid > section { border: 1px solid var(--border-table); border-radius: 0.4rem; min-width: 0; padding: 0.75rem; }
  .tikzDiffGrid > section > h5 { margin-top: 0; }
  .tikzCodeDiff, .tikzDiagnostics { background: var(--bg-input); border: 1px solid var(--border-table); border-radius: 0.3rem; box-sizing: border-box; font-size: 0.78rem; max-height: 16rem; overflow: auto; padding: 0.6rem; white-space: pre-wrap; word-break: break-word; }
  .tikzDiagnostics { color: #9f3a38; max-height: 8rem; }
  @media only screen and (max-width: 900px) { .columns, .duplicatePairComparison, .tikzDiffGrid { grid-template-columns: 1fr; } }
  @media only screen and (max-width: 600px) {
    .contentCard { padding: 0.75rem; }
    .contentCardActions { width: 100%; }
    .chapterNavigation { display: flex; flex-wrap: wrap; min-width: 0; }
    .exercisesChapterNavigation { gap: 0.35rem; }
    .exercisesChapterNavigation .chapterSelectGroup { flex: 1 1 100%; min-width: 0; order: 2; }
    .exercisesChapterNavigation .chapterSelectGroup label { min-width: 0; }
    .exercisesChapterNavigation > span { flex: 1 1 auto; text-align: center; }
    .exercisesChapterNavigation > .ui--Button:last-child { margin-left: auto; }
  }
`;

