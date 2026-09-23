// Copyright 2021-2026 @slonigiraf/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import { createImage, deleteAbilities, getAbilities, getImage, getImages, hydrateAbilityContent, putImage, storeAbility } from './index.js';

describe('Ability images', (): void => {
  const moduleId = 'ability-images-spec';

  afterEach(async (): Promise<void> => {
    await deleteAbilities(moduleId);
    await deleteAbilities(`${moduleId}-other`);
  });

  it('stores Ability visuals as Image ids and hydrates prompt/data/valid for consumers', async (): Promise<void> => {
    const prompt = 'Draw two labeled points.';
    const tikzPrompt = 'Draw a one-unit horizontal segment.';
    const tikz = '\\begin{tikzpicture}\\draw (0,0)--(1,0);\\end{tikzpicture}';
    const content = JSON.stringify({
      h: 'Read a diagram',
      i: '',
      q: [
        { a: 'A', h: 'Question A', i: '', p: prompt },
        { a: 'B', h: 'Question B', i: tikz, iError: false, iPrompt: tikzPrompt, p: '' }
      ],
      t: 3
    });

    await storeAbility(moduleId, content);
    const [stored] = await getAbilities(moduleId);
    const parsed = JSON.parse(stored.content) as { q: Array<Record<string, unknown>> };

    assert.equal(typeof parsed.q[0].p, 'number');
    assert.equal(parsed.q[0].i, null);
    assert.equal(parsed.q[1].p, null);
    assert.equal(typeof parsed.q[1].i, 'number');
    assert.equal('iError' in parsed.q[1], false);
    assert.equal('iPrompt' in parsed.q[1], false);

    const imageIds = [parsed.q[0].p, parsed.q[1].i] as number[];
    const images = await getImages(imageIds);
    const promptImage = images.find(({ id }) => id === parsed.q[0].p);
    const tikzImage = images.find(({ id }) => id === parsed.q[1].i);

    assert.equal(promptImage?.type, 'prompt');
    assert.equal(promptImage?.prompt, prompt);
    assert.equal(promptImage?.data, null);
    assert.equal(tikzImage?.type, 'tikz');
    assert.equal(tikzImage?.prompt, tikzPrompt);
    assert.equal(tikzImage?.data, tikz);
    assert.equal(tikzImage?.valid, true);
    assert.equal('svg' in (tikzImage ?? {}), false);

    const hydrated = JSON.parse(await hydrateAbilityContent(stored.content)) as { q: Array<Record<string, unknown>> };

    assert.equal(hydrated.q[0].p, '');
    assert.equal(hydrated.q[0].i, '');
    assert.equal(hydrated.q[0].pPrompt, prompt);
    assert.equal(hydrated.q[1].p, '');
    assert.equal(hydrated.q[1].i, tikz);
    assert.equal(hydrated.q[1].iPrompt, tikzPrompt);
    assert.equal(hydrated.q[1].iError, false);
  });

  it('hydrates a new text-only Ability with nullable image references into the runtime string shape', async (): Promise<void> => {
    await storeAbility(moduleId, JSON.stringify({
      h: 'Text-only ability',
      i: '',
      q: [
        { a: '1', h: 'First question', i: '', p: '' },
        { a: '2', h: 'Second question', i: '', p: '' }
      ],
      t: 3
    }));

    const [stored] = await getAbilities(moduleId);
    const normalized = JSON.parse(stored.content) as { q: Array<Record<string, unknown>> };

    assert.equal(normalized.q[0].p, null);
    assert.equal(normalized.q[0].i, null);
    assert.equal(normalized.q[1].p, null);
    assert.equal(normalized.q[1].i, null);

    const hydrated = JSON.parse(await hydrateAbilityContent(stored.content)) as { q: Array<Record<string, unknown>> };

    assert.equal(hydrated.q[0].p, '');
    assert.equal(hydrated.q[0].i, '');
    assert.equal(hydrated.q[1].p, '');
    assert.equal(hydrated.q[1].i, '');
  });

  it('preserves the Image id and original prompt through generation and fixing', async (): Promise<void> => {
    const originalPrompt = 'Show three apples in a row, with no answer labels.';
    const abilityId = await storeAbility(moduleId, JSON.stringify({
      h: 'Count apples',
      i: '',
      q: [
        { a: '3', h: 'How many apples?', i: '', p: originalPrompt },
        { a: '3', h: 'Confirm the count.', i: '', p: '' }
      ],
      t: 3
    }));
    const stored = (await getAbilities(moduleId)).find(({ id }) => id === abilityId);

    assert.ok(stored);
    const normalized = JSON.parse(stored.content) as { q: Array<{ p: number | null }> };
    const imageId = normalized.q[0].p as number;
    const promptImage = await getImage(imageId);

    assert.equal(promptImage?.type, 'prompt');
    assert.equal(promptImage?.prompt, originalPrompt);
    assert.equal(promptImage?.data, null);

    const generatedTikz = '\\begin{tikzpicture}\\node at (0,0) {apple apple apple};\\end{tikzpicture}';

    // The Images stage updates the referenced Image in place. Ability.p keeps
    // the same foreign key and Image.prompt remains the semantic source.
    assert.ok(promptImage);
    await putImage({ ...promptImage, data: generatedTikz, prompt: originalPrompt, type: 'tikz', valid: undefined });

    const afterGeneration = (await getAbilities(moduleId)).find(({ id }) => id === abilityId);
    const generatedImage = await getImage(imageId);
    const generatedHydrated = JSON.parse(await hydrateAbilityContent(afterGeneration!.content)) as { q: Array<Record<string, unknown>> };

    assert.equal((JSON.parse(afterGeneration!.content) as { q: Array<{ p: number | null }> }).q[0].p, imageId);
    assert.equal(generatedImage?.type, 'tikz');
    assert.equal(generatedImage?.prompt, originalPrompt);
    assert.equal(generatedImage?.data, generatedTikz);
    assert.equal(generatedHydrated.q[0].p, generatedTikz);
    assert.equal(generatedHydrated.q[0].pPrompt, originalPrompt);

    const fixedTikz = '\\begin{tikzpicture}\\node at (0,0) {apple};\\node at (1,0) {apple};\\node at (2,0) {apple};\\end{tikzpicture}';

    // Apply Fix images also updates the same row and marks the pre-rendered
    // correction valid without losing the generation prompt.
    assert.ok(generatedImage);
    await putImage({ ...generatedImage, data: fixedTikz, type: 'tikz', valid: true });

    const fixedImage = await getImage(imageId);
    const fixedHydrated = JSON.parse(await hydrateAbilityContent(afterGeneration!.content)) as { q: Array<Record<string, unknown>> };

    assert.equal(fixedImage?.prompt, originalPrompt);
    assert.equal(fixedImage?.data, fixedTikz);
    assert.equal(fixedImage?.valid, true);
    assert.equal(fixedHydrated.q[0].p, fixedTikz);
    assert.equal(fixedHydrated.q[0].pPrompt, originalPrompt);
    assert.equal(fixedHydrated.q[0].pError, false);
  });

  it('deletes owned Image rows when the Ability is deleted', async (): Promise<void> => {
    await storeAbility(moduleId, JSON.stringify({
      h: 'Visual ability',
      i: '',
      q: [
        { a: '1', h: 'One', i: '', p: 'Prompt one' },
        { a: '2', h: 'Two', i: '', p: '' }
      ],
      t: 3
    }));
    const [stored] = await getAbilities(moduleId);
    const imageId = (JSON.parse(stored.content) as { q: Array<{ p: number | null }> }).q[0].p as number;

    assert.ok(await getImage(imageId));
    await deleteAbilities(moduleId);
    assert.equal(await getImage(imageId), undefined);
  });

  it('keeps a shared Image until the last referencing Ability is deleted', async (): Promise<void> => {
    const otherModuleId = `${moduleId}-other`;
    const imageId = await createImage({ data: null, prompt: 'Shared visual prompt', type: 'prompt', valid: undefined });
    const ability = JSON.stringify({
      h: 'Shared image A',
      i: '',
      q: [
        { a: '1', h: 'One', i: null, p: imageId },
        { a: '2', h: 'Two', i: null, p: null }
      ],
      t: 3
    });

    await storeAbility(moduleId, ability);
    await storeAbility(otherModuleId, ability.replace('Shared image A', 'Shared image B'));
    await deleteAbilities(moduleId);
    assert.ok(await getImage(imageId));
    await deleteAbilities(otherModuleId);
    assert.equal(await getImage(imageId), undefined);
  });
});
