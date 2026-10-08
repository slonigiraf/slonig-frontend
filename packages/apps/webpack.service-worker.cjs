// Copyright 2017-2026 @polkadot/apps authors & contributors
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable camelcase */

const path = require('path');
const webpack = require('webpack');

const findPackages = require('../../scripts/findPackages.cjs');

function createServiceWorkerWebpack (context, mode = 'production') {
  const alias = findPackages().reduce((alias, { dir, name }) => {
    alias[name] = path.resolve(context, `../${dir}/src`);

    return alias;
  }, {});

  return {
    context,
    devtool: false,
    entry: path.resolve(context, '../page-laws/src/Generate/book/application/worker/bookProcessing.serviceWorker.ts'),
    mode,
    module: {
      rules: [
        {
          scheme: 'data',
          type: 'asset/resource'
        },
        {
          exclude: /(node_modules)/,
          test: /\.(ts|tsx)$/,
          use: [
            {
              loader: require.resolve('ts-loader'),
              options: {
                configFile: 'tsconfig.webpack.json',
                transpileOnly: true
              }
            }
          ]
        }
      ]
    },
    node: {
      __dirname: true,
      __filename: false
    },
    optimization: {
      concatenateModules: true,
      minimize: mode === 'production',
      runtimeChunk: false,
      splitChunks: false
    },
    output: {
      chunkFilename: 'book-processing-service-worker.[contenthash].js',
      filename: 'book-processing-service-worker.js',
      globalObject: 'self',
      hashFunction: 'xxhash64',
      path: path.join(context, 'build'),
      // The service-worker entry is served from the app root in development.
      // The compiler is forced to one JS chunk below, so runtime imports never
      // need a separate service-worker chunk URL.
      publicPath: mode === 'development' ? '/' : ''
    },
    plugins: [
      // Service workers may call importScripts() only while their initial
      // script is being evaluated. Webpack normally turns dynamic import()
      // expressions (pdf-lib/pdfjs) into on-demand chunks, which would make a
      // running service worker call importScripts() after installation and fail
      // with InvalidStateError. Merge every async split point back into the
      // entry chunk so book-processing-service-worker.js is self-contained.
      new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
      new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
        process: 'process/browser.js'
      }),
      new webpack.IgnorePlugin({
        contextRegExp: /moment$/,
        resourceRegExp: /^\.[\\/]locale$/
      }),
      new webpack.DefinePlugin({
        'process.env': {
          NODE_ENV: JSON.stringify(mode),
          WS_URL: JSON.stringify(process.env.WS_URL),
          IPFS_SERVER: JSON.stringify(process.env.IPFS_SERVER),
          PEERJS_SERVER: JSON.stringify(process.env.PEERJS_SERVER),
          COTURN_SERVER: JSON.stringify(process.env.COTURN_SERVER),
          COTURN_USER: JSON.stringify(process.env.COTURN_USER),
          COTURN_PASSWORD: JSON.stringify(process.env.COTURN_PASSWORD),
          AIRDROP_AUTH_TOKEN: JSON.stringify(process.env.AIRDROP_AUTH_TOKEN),
          MATOMO_SITE_ID: JSON.stringify(process.env.MATOMO_SITE_ID)
        }
      })
    ],
    resolve: {
      alias,
      extensionAlias: {
        '.js': ['.js', '.ts', '.tsx']
      },
      extensions: ['.js', '.jsx', '.mjs', '.ts', '.tsx'],
      fallback: {
        assert: require.resolve('assert/'),
        crypto: require.resolve('crypto-browserify'),
        fs: false,
        http: require.resolve('stream-http'),
        https: require.resolve('https-browserify'),
        os: require.resolve('os-browserify/browser'),
        path: require.resolve('path-browserify'),
        stream: require.resolve('stream-browserify')
      }
    },
    target: 'webworker'
  };
}

module.exports = createServiceWorkerWebpack;
