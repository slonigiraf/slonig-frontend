#!/bin/sh
git pull origin slonig && \
export $(cat .env | xargs) && \
docker build -t dev-app-slonig-org -f docker/Dockerfile \
  --build-arg IPFS_SERVER=$IPFS_SERVER \
  --build-arg PEERJS_SERVER=$PEERJS_SERVER \
  --build-arg COTURN_SERVER=$COTURN_SERVER \
  --build-arg COTURN_USER=$COTURN_USER \
  --build-arg COTURN_PASSWORD=$COTURN_PASSWORD \
  --build-arg AIRDROP_AUTH_TOKEN=$AIRDROP_AUTH_TOKEN \
  --build-arg MATOMO_SITE_ID=$MATOMO_SITE_ID \
  . && \
docker compose up -d