#!/bin/sh

DIR_NAME="$(basename "$PWD")"

if [ "${DIR_NAME#dev}" != "$DIR_NAME" ]; then
  echo "Detected dev directory ($DIR_NAME) → running dev-update.sh"
  ./dev-update.sh
else
  echo "Detected production directory ($DIR_NAME) → running update.sh"
  ./update.sh
fi