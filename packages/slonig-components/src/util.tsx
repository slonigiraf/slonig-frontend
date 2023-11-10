// Copyright 2017-2023 @polkadot/app-slonig-components authors & contributors
// SPDX-License-Identifier: Apache-2.0

export function parseJson (input: string): any | null {
  try {
    const result = JSON.parse(input);
    return result;
  } catch (e) {
    console.error("Error parsing JSON: ", e.message);
    return null;
  }
}
