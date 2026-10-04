// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { styled } from '@polkadot/react-components';

const FixConceptsReviewContentContainer = styled.div`
  .fixConceptsReviewIntro {
    align-items: flex-end;
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .fixConceptsReviewIntro > p {
    flex: 1 1 28rem;
    margin: 0;
  }

  .fixConceptsReviewIntro > label {
    align-items: center;
    display: flex;
    gap: 0.5rem;
    white-space: nowrap;
  }

  .fixConceptsReviewIntro select {
    background: var(--bg-input);
    border: 1px solid #dde1eb;
    border-radius: 0.25rem;
    color: var(--color-text);
    font: inherit;
    max-width: 24rem;
    padding: 0.5rem;
  }

  .fixConceptsReviewComparison {
    min-width: 0;
  }

  .fixConceptsReviewRow {
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .fixConceptsReviewRow.isUnchanged {
    grid-template-columns: minmax(0, 1fr);
  }

  .fixConceptsReviewChangeLabel {
    display: block;
    font-size: 0.82rem;
    font-weight: 600;
    line-height: 1.2;
    margin: 0;
    opacity: 0.72;
    padding-left: 0.1rem;
  }

  .fixConceptsDifference h3 {
    margin: 0 0 0.6rem;
  }

  .fixConceptsDifference h4 {
    margin: 0.8rem 0 0.2rem;
  }

  .fixConceptsReviewConcepts {
    border: 1px solid #dde1eb;
    border-radius: 0.5rem;
    box-sizing: border-box;
    display: grid;
    gap: 0.7rem;
    max-height: min(48vh, 36rem);
    min-height: 14rem;
    overflow: auto;
    padding: 0.75rem;
  }

  .fixConceptsReviewRow {
    align-items: stretch;
  }

  .fixConceptsReviewCell {
    min-width: 0;
  }

  .fixConceptsReviewCell.isBefore,
  .fixConceptsReviewCell.isAfter {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .fixConceptsReviewCell.isBefore > .fixConceptsReviewCard,
  .fixConceptsReviewCell.isAfter > .fixConceptsReviewCard,
  .fixConceptsReviewCell.isBefore > .fixConceptsReviewMissingBefore,
  .fixConceptsReviewCell.isAfter > .fixConceptsReviewMissingBefore {
    flex: 1 1 auto;
  }

  .fixConceptsReviewCard {
    background: var(--bg-input);
    border: 1px solid #dde1eb;
    border-radius: 0.6rem;
    box-sizing: border-box;
    padding: 0.8rem 0.9rem;
  }

  .fixConceptsReviewCard.isProposed {
    border-color: var(--color-primary, #1682d4);
    box-shadow: inset 3px 0 0 var(--color-primary, #1682d4);
  }

  .fixConceptsReviewCard p {
    line-height: 1.5;
    margin: 0.45rem 0 0;
  }

  .fixConceptsReviewMissingBefore {
    align-items: center;
    border: 1px dashed #dde1eb;
    border-radius: 0.6rem;
    box-sizing: border-box;
    display: flex;
    justify-content: center;
    min-height: 4.5rem;
    opacity: 0.65;
    padding: 0.8rem 0.9rem;
    text-align: center;
  }

  .fixConceptsReviewRemovedAfter {
    align-items: center;
    border: 1px dashed rgba(180, 70, 70, 0.45);
    border-radius: 0.6rem;
    box-sizing: border-box;
    display: flex;
    gap: 0.75rem;
    justify-content: space-between;
    min-height: 4.5rem;
    padding: 0.8rem 0.9rem;
  }

  .fixConceptsReviewRemovedAfter > span:first-child {
    font-weight: 600;
    opacity: 0.75;
  }

  .fixConceptsReviewConceptHeading {
    align-items: flex-start;
    display: flex;
    gap: 0.75rem;
    justify-content: space-between;
  }

  .fixConceptsReviewConceptHeading > strong {
    line-height: 1.35;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .fixConceptsReviewMeta {
    align-items: center;
    display: flex;
    flex-shrink: 0;
    gap: 0.35rem;
  }

  .fixConceptsReviewPage,
  .fixConceptsReviewProposed {
    border-radius: 999px;
    font-size: 0.78em;
    line-height: 1.2;
    padding: 0.25rem 0.5rem;
    white-space: nowrap;
  }

  .fixConceptsReviewPage {
    background: rgba(47, 111, 235, 0.08);
    border: 1px solid rgba(47, 111, 235, 0.18);
  }

  .fixConceptsReviewProposed {
    background: rgba(22, 130, 212, 0.12);
    border: 1px solid rgba(22, 130, 212, 0.28);
    font-weight: 600;
  }

  .fixConceptsReviewEmpty {
    margin: 0;
    opacity: 0.7;
  }

  .fixConceptsDifference {
    border-top: 1px solid #dde1eb;
    margin-top: 1rem;
    padding-top: 1rem;
  }

  .fixConceptsDifference p {
    margin: 0.25rem 0;
  }

  .fixConceptsDifference ul {
    margin: 0.6rem 0 0;
    padding-left: 1.4rem;
  }

  .fixConceptsReviewWarning {
    border: 1px solid rgba(180, 120, 20, 0.35);
    border-radius: 0.5rem;
    margin: 1rem 0 0;
    padding: 0.7rem 0.8rem;
  }

  @media (max-width: 760px) {
    .fixConceptsReviewRow {
      gap: 0.6rem;
      grid-template-columns: 1fr;
    }

    .fixConceptsReviewConcepts {
      max-height: 44vh;
    }

    .fixConceptsReviewIntro > label {
      align-items: stretch;
      flex: 1 1 100%;
      flex-wrap: wrap;
      white-space: normal;
    }

    .fixConceptsReviewIntro select {
      flex: 1;
      max-width: none;
      min-width: 12rem;
    }
  }

`;

export { FixConceptsReviewContentContainer };
