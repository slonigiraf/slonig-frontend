// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/** Serialize title edits so a slower earlier write cannot overwrite a newer edit. */
export class TitleSaveQueue {
  private persistedTitle: string;
  private pending: Promise<void> = Promise.resolve();

  constructor (initialTitle: string) {
    this.persistedTitle = initialTitle;
  }

  get savedTitle (): string {
    return this.persistedTitle;
  }

  adoptSavedTitle (title: string): void {
    this.persistedTitle = title;
  }

  wait (): Promise<void> {
    return this.pending;
  }

  enqueue (title: string, save: (title: string) => Promise<void>, onError: (error: unknown) => void): Promise<void> {
    const write = async (): Promise<void> => {
      if (!title.trim() || title === this.persistedTitle) {
        return;
      }

      try {
        await save(title);
        this.persistedTitle = title;
      } catch (error) {
        onError(error);
      }
    };

    // A failed write must not block later edits from saving.
    this.pending = this.pending.then(write, write);

    return this.pending;
  }
}
