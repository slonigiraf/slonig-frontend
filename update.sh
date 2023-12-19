#!/bin/sh
git pull origin slonig && \
docker build -t app-slonig-org -f docker/Dockerfile . && \
docker compose up -d