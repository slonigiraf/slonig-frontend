#!/bin/sh
git pull && \
docker build -t ui-slonigiraf-org -f docker/Dockerfile . && \
docker compose up -d