import { access } from 'node:fs/promises';
export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@slonigiraf/db' && context.parentURL?.endsWith('/backup/status.ts')) {
    return { url: new URL('./test-db-stub.mjs', context.parentURL).href, shortCircuit: true };
  }
  if (specifier.startsWith('./') && specifier.endsWith('.js') && context.parentURL?.includes('/backup/')) {
    const url = new URL(specifier.replace(/\.js$/, '.ts'), context.parentURL);
    try { await access(url); return { url: url.href, shortCircuit: true }; } catch { /* normal resolution */ }
  }
  return nextResolve(specifier, context);
}
