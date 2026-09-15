// Copyright 2017-2026 @polkadot/slonig-components authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book } from '@slonigiraf/db';

import { arrayBufferToBase64, base64ToArrayBuffer } from './utils.js';

const BOOKS_DIRECTORY = 'books';

export interface BookPdfBackup {
  data: string;
  name: string;
}

async function getBooksDirectory (): Promise<FileSystemDirectoryHandle> {
  if (!navigator.storage?.getDirectory) {
    throw new Error('OPFS is not supported by this browser');
  }

  const root = await navigator.storage.getDirectory();

  return root.getDirectoryHandle(BOOKS_DIRECTORY, { create: true });
}

export async function exportBookPdfs (books: Book[]): Promise<BookPdfBackup[]> {
  if (!books.length) {
    return [];
  }

  const directory = await getBooksDirectory();

  return Promise.all(books.map(async ({ opfsName }) => {
    const handle = await directory.getFileHandle(opfsName);
    const file = await handle.getFile();

    return {
      data: arrayBufferToBase64(await file.arrayBuffer()),
      name: opfsName
    };
  }));
}

export async function importBookPdfs (books: Book[], files: unknown): Promise<void> {
  if (!Array.isArray(files)) {
    throw new Error('No valid book PDF data found in the file.');
  }

  if (!files.length) {
    return;
  }

  const expectedNames = new Set(books.map(({ opfsName }) => opfsName));

  if (files.some((file): boolean => {
    if (!file || typeof file !== 'object') {
      return true;
    }

    const { data, name } = file as Partial<BookPdfBackup>;

    return typeof data !== 'string' || typeof name !== 'string' || !expectedNames.has(name);
  })) {
    throw new Error('Backup contains invalid book PDF data.');
  }

  const directory = await getBooksDirectory();

  await Promise.all((files as BookPdfBackup[]).map(async ({ data, name }) => {
    const handle = await directory.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();

    await writable.write(base64ToArrayBuffer(data));
    await writable.close();
  }));
}
