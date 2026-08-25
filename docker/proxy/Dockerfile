# Combined CORS/git/LFS proxy for self-hosted elab2arc - bundles what the
# maintainer's personal wb-e.com infrastructure does in production, so a
# self-hosted deployment has no dependency on it. See ../TODOs.md.
FROM python:3.11-slim

WORKDIR /srv

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
 && useradd -r -s /sbin/nologin proxyuser

COPY vendor/cors_proxy ./cors_proxy
COPY generic_proxy.py entrypoint.sh ./
RUN chmod +x entrypoint.sh

ENV PYTHONUNBUFFERED=1
USER proxyuser
# 9999 = git-proxy role (cors-proxy-py, unmodified, its own default port)
# 9998 = generic CORS+LFS API proxy role (this repo's generic_proxy.py)
EXPOSE 9999 9998
CMD ["./entrypoint.sh"]
