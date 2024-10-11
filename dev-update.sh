#!/bin/sh
git pull origin slonig && \
docker build -t dev-app-slonig-org -f docker/Dockerfile . && \
docker compose up -d