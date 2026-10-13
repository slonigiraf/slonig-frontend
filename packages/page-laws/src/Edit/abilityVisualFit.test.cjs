// Copyright 2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0
// Run with: node --test abilityVisualFit.test.cjs
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const exerciseList = fs.readFileSync(path.join(__dirname, 'ExerciseList.tsx'), 'utf8');
const image = fs.readFileSync(path.join(__dirname, 'KnowledgeResizableImage.tsx'), 'utf8');
const tikz = fs.readFileSync(path.join(__dirname, 'TikzDisplay.tsx'), 'utf8');
const review = fs.readFileSync(path.join(__dirname, '../Generate/features/skills/SkillsStyles.tsx'), 'utf8');

const fittedWidth = (containerWidth, maxHeight, imageWidth, imageHeight) => Math.min(containerWidth, maxHeight * imageWidth / imageHeight);

test('Landscape images use the available width and preserve their proportions', () => {
  const width = fittedWidth(500, 350, 1200, 300);
  assert.equal(width, 500);
  assert.equal(width / (1200 / 300), 125);
});

test('Portrait images use the allowed height without exceeding the card width', () => {
  const width = fittedWidth(500, 350, 300, 1200);
  assert.equal(width, 87.5);
  assert.equal(width / (300 / 1200), 350);
});

test('Raster and SVG Ability previews supply their intrinsic aspect ratios', () => {
  assert.match(image, /onLoad=\{\(event\) =>/);
  assert.match(image, /naturalWidth \/ image\.naturalHeight/);
  assert.match(image, /setProperty\('--ability-visual-ratio'/);
  assert.match(tikz, /getAttribute\('viewBox'\)/);
  assert.match(tikz, /host\.style\.setProperty\('--ability-visual-ratio'/);
});

test('Ability cards fit images to width or screen height rather than the original 150px thumbnail', () => {
  assert.match(exerciseList, /--ability-visual-max-height: min\(40dvh, 26rem\)/);
  assert.match(exerciseList, /width: min\(100%, calc\(var\(--ability-visual-max-height\) \* var\(--ability-visual-ratio, 1\)\)\)/);
  assert.match(exerciseList, /\.exercise-header \.tikzDisplay--thumbnail,[\s\S]*?height: auto/);
  assert.match(exerciseList, /align-items: start/);
  assert.match(exerciseList, /\.abilityAnswer \{\s*margin-top: 0\.75rem/);
});

test('Review mode uses its dynamically calculated visual height as a maximum, not a fixed box', () => {
  assert.match(review, /--ability-visual-max-height: var\(--review-visual-height\)/);
  assert.match(review, /\.abilityReviewContent \.abilityCard \.exercise-header img,[\s\S]*?height: auto/);
  assert.match(review, /width: min\(100%, calc\(var\(--review-visual-height\) \* var\(--ability-visual-ratio, 1\)\)\)/);
  assert.match(review, /\.abilityReviewContent \.abilityCard \.tikzDisplay--thumbnail \{[\s\S]*?height: auto/);
});

test('Raster image zoom and TikZ preview click-to-open still work', () => {
  assert.match(image, /onClick=\{\(\) => setIsBig\(true\)\}/);
  const tikzVisual = fs.readFileSync(path.join(__dirname, 'TikzVisual.tsx'), 'utf8');
  assert.match(tikzVisual, /onClick=\{\(\) => setIsPreviewBig\(true\)\}/);
});
