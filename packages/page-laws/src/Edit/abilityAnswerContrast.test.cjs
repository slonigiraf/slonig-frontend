// Copyright 2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0
// Run with: node --test abilityAnswerContrast.test.cjs
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const exerciseList = fs.readFileSync(path.join(__dirname, 'ExerciseList.tsx'), 'utf8');
const reviewStyles = fs.readFileSync(path.join(__dirname, '../Generate/features/skills/SkillsStyles.tsx'), 'utf8');

test('Every Ability exercise answer uses a distinct border without a background fill', () => {
  assert.match(exerciseList, /<Answer className=\{isAbilityInfo \? 'abilityAnswer' : undefined\}>/);
  const answerRules = exerciseList.match(/&\.abilityAnswer \{([^}]*)\}/)?.[1] ?? '';

  assert.doesNotMatch(answerRules, /background(?:-color)?\s*:/);
  assert.match(answerRules, /border: 1px solid #A9A9A9;/);
});

test('Review Ability retains the shared answer surface styling', () => {
  assert.match(reviewStyles, /\.abilityReviewContent \.abilityCard \.abilityAnswer \{[^}]*margin-top:[^}]*padding:/);
  assert.doesNotMatch(reviewStyles, /\.abilityReviewContent \.abilityCard \.abilityAnswer \{[^}]*(?:background|border-color):/);
});
