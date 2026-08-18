# elab2ARC is a static single-page app (vanilla JS/HTML/CSS) - no build step,
# no backend beyond the externally-hosted CORS proxy it already talks to.
# This image just serves the repo root over HTTP.
# See .dockerignore for what's excluded from the build context (git metadata,
# js/node_modules, docs, loose .md files).
FROM nginx:alpine

COPY . /usr/share/nginx/html

EXPOSE 80
