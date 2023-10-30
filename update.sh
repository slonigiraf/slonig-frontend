#!/bin/sh
git pull origin slonig && \
docker build -t ui-slonigiraf-org -f docker/Dockerfile . && \
docker compose up -d