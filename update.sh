#!/bin/sh
set -e

DIR_NAME="$(basename "$PWD")"

# Decide image name based on directory name
if [ "${DIR_NAME#dev}" != "$DIR_NAME" ]; then
  IMAGE_TAG="dev-app-slonig-org"
  echo "Detected dev directory ($DIR_NAME) → using image: $IMAGE_TAG"
else
  IMAGE_TAG="app-slonig-org"
  echo "Detected production directory ($DIR_NAME) → using image: $IMAGE_TAG"
fi

git checkout master && \
git pull origin master && \
export $(cat .env | xargs) && \
docker build -t "$IMAGE_TAG" -f docker/Dockerfile \
  --build-arg IPFS_SERVER="$IPFS_SERVER" \
  --build-arg PEERJS_SERVER="$PEERJS_SERVER" \
  --build-arg COTURN_SERVER="$COTURN_SERVER" \
  --build-arg COTURN_USER="$COTURN_USER" \
  --build-arg COTURN_PASSWORD="$COTURN_PASSWORD" \
  --build-arg AIRDROP_AUTH_TOKEN="$AIRDROP_AUTH_TOKEN" \
  --build-arg MATOMO_SITE_ID="$MATOMO_SITE_ID" \
  . && \
docker compose up -d