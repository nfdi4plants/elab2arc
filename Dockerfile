# elab2ARC is a static single-page app (vanilla JS/HTML/CSS) - no build step.
# This image serves the repo root over HTTP, plus (via docker/web/nginx.conf)
# reverse-proxies the bundled CORS/git proxy service defined in
# docker-compose.yml - see docker/TODOs.md for why. Standalone `docker run`
# (no compose) still serves the static site fine, just without a working proxy
# backend for the two /_corsproxy//_gitproxy locations - self-hosting the full
# working app needs `docker compose up`, not this image alone.
# See .dockerignore for what's excluded from the build context (git metadata,
# js/node_modules, docs, loose .md files, docker/proxy's own source).
FROM nginx:alpine

COPY . /usr/share/nginx/html
COPY docker/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
