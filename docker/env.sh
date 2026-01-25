#!/bin/bash
# Copyright 2017-2023 @polkadot/apps authors & contributors
# SPDX-License-Identifier: Apache-2.0

# This script is used when the docker container starts and does the magic to
# bring the ENV variables to the generated static UI.

TARGET=./env-config.js

# Recreate config file
echo -n > $TARGET

declare -a vars=(
  "WS_URL"
  "SAMPLE"
  "IPFS_SERVER"
  "PEERJS_SERVER"
  "COTURN_SERVER"
  "COTURN_USER"
  "COTURN_PASSWORD"
  "AIRDROP_AUTH_TOKEN"
  "MATOMO_SITE_ID"
)

echo "window.process_env = {" >> $TARGET
for VAR in ${vars[@]}; do
  echo "  $VAR: \"${!VAR}\"," >> $TARGET
done
echo "}" >> $TARGET

# update version
HTML_DIR="/usr/share/nginx/html"
VERSION_JSON_PATH="${HTML_DIR}/version.json"
NOW="$(date -u +%s)"

cat > "${VERSION_JSON_PATH}" <<EOF
{ "version": "${NOW}" }
EOF