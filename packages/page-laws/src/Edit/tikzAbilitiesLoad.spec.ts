// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

import { getTikzRenderConcurrency } from './tikzConcurrency.js';
import { nextStoredTikzValidity } from './tikzValidation.js';

const require = createRequire(import.meta.url);
const ABILITY_VISUAL_COUNT = 10;
const SIMULATED_LOGICAL_CPUS = 2;
// Keep this in sync with TikzDisplay.tsx. This is intentionally the UI timeout,
// not a relaxed test timeout: the regression we want to catch is a valid render
// being marked erroneous merely because other Ability visuals are compiling too.
const ABILITY_TIKZ_TIMEOUT_MS = 5_000;
const TEST_WATCHDOG_MS = 30_000;

const VALID_TIKZ_SOURCES = Array.from({ length: ABILITY_VISUAL_COUNT }, (_, index) => {
  const n = index + 1;
  const width = 2 + (index % 3);
  const height = 1 + ((index + 1) % 3);

  return `\\begin{tikzpicture}[x=0.8cm,y=0.8cm]
  \\draw[->] (0,0) -- (${width + 1},0);
  \\draw[->] (0,0) -- (0,${height + 1});
  \\draw[thick] (0.25,0.25) rectangle (${width},${height});
  \\draw (${width / 2},0.25) -- (${width / 2},${height});
  \\node at (${width / 2},${height + 0.45}) {Ability ${n}};
\\end{tikzpicture}`;
});

interface BrowserRenderStatus {
  durationMs: number;
  hasError: boolean;
  index: number;
  reason: string;
}

interface BrowserLoadResult {
  maxActiveRenders: number;
  maxWorkers: number;
  statuses: BrowserRenderStatus[];
  submittedInMs: number;
}

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

async function findChromium (): Promise<string | undefined> {
  const configured = [process.env.CHROMIUM_BIN, process.env.CHROME_BIN].filter((value): value is string => Boolean(value));
  const candidates = [
    ...configured,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next known browser location.
    }
  }

  return undefined;
}

function createHarnessHtml (maxWorkers: number): string {
  const sourcesJson = JSON.stringify(VALID_TIKZ_SOURCES).replace(/</g, '\\u003c');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="/tikzjax/fonts.min.css">
  <script>
    window.__tikzLoadHarnessErrors = [];
    window.addEventListener('error', (event) => {
      window.__tikzLoadHarnessErrors.push(event.message || 'Unknown browser error');
    });
    window.addEventListener('unhandledrejection', (event) => {
      window.__tikzLoadHarnessErrors.push(String(event.reason || 'Unhandled promise rejection'));
    });

    window.TikzJaxOptions = {
      assetBaseUrl: location.origin + '/tikzjax',
      maxRetries: 1,
      renderTimeout: ${ABILITY_TIKZ_TIMEOUT_MS},
      restartWorkerOnFail: true,
      workerPool: {
        enabled: true,
        initializationRetries: 1,
        maxWorkers: ${maxWorkers},
        reserveCpuCores: 0,
        useDeviceMemory: false
      }
    };
  </script>
  <script src="/tikzjax/tikzjax.min.js"></script>
</head>
<body>
  <main id="abilities"></main>
  <script>
    const sources = ${sourcesJson};
    const statuses = Array.from({ length: sources.length }, () => undefined);
    const pendingRenders = [];
    const startedAt = performance.now();
    let activeRenders = 0;
    let maxActiveRenders = 0;
    let submittedAt = startedAt;
    let didPost = false;

    function fallbackImage(root) {
      return Array.from(root.querySelectorAll('img')).find((image) =>
        /(?:broken|error|fallback)/i.test(String(image.src) + ' ' + String(image.alt) + ' ' + String(image.title))
      );
    }

    function failHarness(reason) {
      statuses.forEach((status, index) => {
        if (status === undefined) {
          statuses[index] = {
            durationMs: performance.now() - startedAt,
            hasError: true,
            index,
            reason
          };
        }
      });
      postResult();
    }

    function postResult() {
      if (didPost || statuses.some((value) => value === undefined)) {
        return;
      }

      didPost = true;
      fetch('/result', {
        body: JSON.stringify({
          maxActiveRenders,
          maxWorkers: ${maxWorkers},
          statuses,
          submittedInMs: submittedAt - startedAt
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST'
      }).catch(() => undefined);
    }

    function scheduleRender(start) {
      if (activeRenders < ${maxWorkers}) {
        activeRenders += 1;
        maxActiveRenders = Math.max(maxActiveRenders, activeRenders);
        start();
        return;
      }

      pendingRenders.push(start);
    }

    function releaseRenderSlot() {
      activeRenders -= 1;

      const next = pendingRenders.shift();

      if (next) {
        activeRenders += 1;
        maxActiveRenders = Math.max(maxActiveRenders, activeRenders);
        next();
      }
    }

    function mountAbilityVisual(value, index) {
      const host = document.createElement('div');
      host.dataset.abilityVisual = String(index);
      document.querySelector('#abilities').appendChild(host);

      const visualStartedAt = performance.now();
      let compileTimer;
      let didReportCompileState = false;
      let ownsRenderSlot = false;

      const reportCompileState = (hasError, reason) => {
        if (didReportCompileState) {
          return;
        }

        didReportCompileState = true;
        statuses[index] = {
          durationMs: performance.now() - visualStartedAt,
          hasError,
          index,
          reason: reason || ''
        };
        cleanup();

        if (ownsRenderSlot) {
          ownsRenderSlot = false;
          releaseRenderSlot();
        }

        postResult();
      };

      const onFinished = (event) => {
        const target = event.target;

        if (!(target instanceof Element) || !host.contains(target)) {
          return;
        }

        const svg = target.matches('svg') ? target : target.querySelector('svg');

        if (!(svg instanceof SVGElement)) {
          return;
        }

        if (compileTimer) {
          clearTimeout(compileTimer);
          compileTimer = undefined;
        }

        reportCompileState(false, 'tikzjax-load-finished');
      };

      const observer = new MutationObserver(() => {
        const fallback = fallbackImage(host);

        if (!fallback) {
          return;
        }

        if (compileTimer) {
          clearTimeout(compileTimer);
          compileTimer = undefined;
        }

        reportCompileState(true, 'TikZJax fallback image: ' + (fallback.src || fallback.alt || 'render failure'));
      });

      function cleanup() {
        document.removeEventListener('tikzjax-load-finished', onFinished, true);
        observer.disconnect();
      }

      document.addEventListener('tikzjax-load-finished', onFinished, true);
      observer.observe(host, { childList: true, subtree: true });

      scheduleRender(() => {
        ownsRenderSlot = true;

        const script = document.createElement('script');
        script.type = 'text/tikz';
        script.dataset.ariaLabel = 'Ability visual ' + (index + 1);
        // A fresh browser profile is used for every test run, and this also makes
        // the intent explicit: all ten diagrams must really compile in this run.
        script.dataset.disableCache = 'true';
        script.textContent = value;

        // This mirrors TikzDisplay after the regression fix: the compilation
        // deadline starts only when this visual owns one of the application-level
        // slots that match TikZJax's worker-pool capacity. Queue wait is harmless.
        compileTimer = setTimeout(() => {
          host.replaceChildren();
          reportCompileState(true, 'Ability TikZ render timed out after ${ABILITY_TIKZ_TIMEOUT_MS}ms of active rendering');
        }, ${ABILITY_TIKZ_TIMEOUT_MS});
        host.replaceChildren(script);
      });
    }

    if (window.__tikzLoadHarnessErrors.length) {
      failHarness('Browser harness error: ' + window.__tikzLoadHarnessErrors.join(' | '));
    }

    window.addEventListener('error', (event) => failHarness('Browser harness error: ' + (event.message || 'unknown error')));
    window.addEventListener('unhandledrejection', (event) => failHarness('Browser harness rejection: ' + String(event.reason || 'unknown rejection')));

    // Mount synchronously, as React does when an Ability view reveals a batch of
    // visuals in one commit. The application queue then feeds TikZJax at its
    // worker-pool capacity, and completion events may arrive in any order.
    sources.forEach(mountAbilityVisual);
    submittedAt = performance.now();

    setTimeout(() => {
      statuses.forEach((status, index) => {
        if (status === undefined) {
          statuses[index] = {
            durationMs: performance.now() - startedAt,
            hasError: true,
            index,
            reason: 'Test watchdog expired before this render reported a state'
          };
        }
      });
      postResult();
    }, ${TEST_WATCHDOG_MS});
  </script>
</body>
</html>`;
}

async function resolveTikzJaxDist (): Promise<string> {
  let bundlePath: string;

  try {
    bundlePath = require.resolve('@rod2ik/tikzjax/dist/tikzjax.min.js');
  } catch (error) {
    throw new Error(`Unable to resolve the TikZJax browser bundle required by the load test: ${error instanceof Error ? error.message : String(error)}`);
  }

  return dirname(bundlePath);
}

function readRequestBody (request: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];

    request.on('data', (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    request.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    request.on('error', rejectBody);
  });
}

describe('Abilities TikZ parallel rendering load', (): void => {
  it('compiles 10 valid visuals concurrently without marking any image erroneous', { timeout: 45_000 }, async (): Promise<void> => {
    const chromium = await findChromium();

    assert.ok(chromium, 'This integration test requires Chromium/Chrome. Set CHROMIUM_BIN (or CHROME_BIN) in CI.');

    const tikzJaxDist = await resolveTikzJaxDist();
    const maxWorkers = getTikzRenderConcurrency(SIMULATED_LOGICAL_CPUS);
    const html = createHarnessHtml(maxWorkers);
    const browserProfile = await mkdtemp(join(tmpdir(), 'tikz-abilities-load-'));
    let resolveBrowserResult: (result: BrowserLoadResult) => void = () => undefined;
    let rejectBrowserResult: (error: Error) => void = () => undefined;
    const browserResult = new Promise<BrowserLoadResult>((resolveResult, rejectResult) => {
      resolveBrowserResult = resolveResult;
      rejectBrowserResult = rejectResult;
    });

    const server = createServer(async (request, response) => {
      try {
        const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');

        if (request.method === 'POST' && requestUrl.pathname === '/result') {
          const body = await readRequestBody(request);
          const result = JSON.parse(body) as BrowserLoadResult;

          response.writeHead(204).end();
          resolveBrowserResult(result);
          return;
        }

        if (requestUrl.pathname === '/') {
          response.writeHead(200, { 'content-type': MIME_TYPES['.html'] }).end(html);
          return;
        }

        if (requestUrl.pathname.startsWith('/tikzjax/')) {
          const relativePath = decodeURIComponent(requestUrl.pathname.slice('/tikzjax/'.length));
          const filePath = resolve(tikzJaxDist, relativePath);
          const distPrefix = tikzJaxDist.endsWith(sep) ? tikzJaxDist : `${tikzJaxDist}${sep}`;

          if (!filePath.startsWith(distPrefix)) {
            response.writeHead(403).end('Forbidden');
            return;
          }

          const info = await stat(filePath);

          if (!info.isFile()) {
            response.writeHead(404).end('Not found');
            return;
          }

          const file = await readFile(filePath);

          response.writeHead(200, {
            'cache-control': 'no-store',
            'content-type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream'
          }).end(file);
          return;
        }

        response.writeHead(404).end('Not found');
      } catch (error) {
        response.writeHead(500).end(error instanceof Error ? error.message : String(error));
      }
    });

    let browser: ReturnType<typeof spawn> | undefined;
    let isServerListening = false;
    let stderr = '';

    try {
      await new Promise<void>((resolveListen, rejectListen) => {
        server.once('error', rejectListen);
        server.listen(0, '127.0.0.1', () => {
          isServerListening = true;
          resolveListen();
        });
      });

      const address = server.address();

      assert.ok(address && typeof address !== 'string');

      browser = spawn(chromium, [
        '--headless',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-background-networking',
        '--disable-extensions',
        `--user-data-dir=${browserProfile}`,
        `http://127.0.0.1:${address.port}/`
      ], { stdio: ['ignore', 'ignore', 'pipe'] });

      browser.stderr?.on('data', (chunk: Buffer) => {
        stderr = `${stderr}${chunk.toString('utf8')}`.slice(-20_000);
      });
      browser.once('error', (error) => rejectBrowserResult(error));
      browser.once('exit', (code, signal) => {
        if (code !== null && code !== 0) {
          rejectBrowserResult(new Error(`Chromium exited before the TikZ load test completed (code ${code}, signal ${signal ?? 'none'}).\n${stderr}`));
        }
      });

      const watchdog = setTimeout(() => {
        rejectBrowserResult(new Error(`No result received from the browser within ${TEST_WATCHDOG_MS + 5_000}ms.\n${stderr}`));
      }, TEST_WATCHDOG_MS + 5_000);
      const result = await browserResult.finally(() => clearTimeout(watchdog));

      assert.equal(result.maxWorkers, maxWorkers);
      assert.equal(result.maxActiveRenders, maxWorkers, 'Expected the load burst to saturate the configured TikZ render slots.');
      assert.equal(result.statuses.length, ABILITY_VISUAL_COUNT);
      assert.ok(result.submittedInMs < 250, `Expected all Ability visuals to be submitted as one load burst, but submission took ${result.submittedInMs.toFixed(1)}ms.`);

      const statuses = [...result.statuses].sort((a, b) => a.index - b.index);
      const failures = statuses.filter(({ hasError }) => hasError);

      assert.deepEqual(
        failures,
        [],
        `Valid TikZ visuals were marked erroneous under parallel Ability load:\n${failures.map(({ durationMs, index, reason }) => `#${index + 1} after ${durationMs.toFixed(0)}ms: ${reason}`).join('\n')}\nChromium stderr:\n${stderr}`
      );

      // Exercise the same persistence decision used by AbilityInfo.saveVisualError:
      // every successful current source must end up valid:true, never valid:false.
      statuses.forEach((status, index) => {
        const source = VALID_TIKZ_SOURCES[index];
        const nextValid = nextStoredTikzValidity(source, undefined, source, status.hasError);

        assert.equal(nextValid, true, `Ability visual #${index + 1} would be persisted as erroneous.`);
      });
    } finally {
      if (browser && browser.exitCode === null) {
        browser.kill('SIGTERM');

        await Promise.race([
          new Promise<void>((resolveExit) => browser?.once('exit', () => resolveExit())),
          new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 2_000))
        ]);

        if (browser.exitCode === null) {
          browser.kill('SIGKILL');
        }
      }

      if (isServerListening) {
        (server as typeof server & { closeAllConnections?: () => void }).closeAllConnections?.();
        await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
      }

      await rm(browserProfile, { force: true, recursive: true });
    }
  });
});
