ARG NODE_BUILDER_IMAGE=docker.m.daocloud.io/library/node:22-bullseye
ARG NODE_RUNTIME_IMAGE=docker.m.daocloud.io/library/node:22-bullseye-slim

FROM ${NODE_BUILDER_IMAGE} AS builder

ARG NPM_REGISTRY=https://registry.npmmirror.com
ENV npm_config_registry=${NPM_REGISTRY} \
  npm_config_fetch_retries=5 \
  npm_config_fetch_retry_mintimeout=20000 \
  npm_config_fetch_retry_maxtimeout=120000

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --registry=${NPM_REGISTRY}

COPY . .
RUN npm run build

FROM ${NODE_RUNTIME_IMAGE}

ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG APT_MIRROR=
ENV npm_config_registry=${NPM_REGISTRY} \
  npm_config_fetch_retries=5 \
  npm_config_fetch_retry_mintimeout=20000 \
  npm_config_fetch_retry_maxtimeout=120000 \
  PIP_BREAK_SYSTEM_PACKAGES=1

WORKDIR /app

RUN set -eux; \
    if [ -n "$APT_MIRROR" ]; then \
      case "$APT_MIRROR" in \
        https://*) \
          apt-get update; \
          apt-get install -y --no-install-recommends ca-certificates; \
          rm -rf /var/lib/apt/lists/*; \
          ;; \
      esac; \
      APT_MIRROR_BASE="${APT_MIRROR%/}"; \
      sed -i "s|http://deb.debian.org/debian|${APT_MIRROR_BASE}|g; s|http://security.debian.org/debian-security|${APT_MIRROR_BASE}-security|g" /etc/apt/sources.list; \
    fi \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    libreoffice \
    poppler-utils \
    python3 \
    python3-pip \
  && rm -rf /var/lib/apt/lists/*

RUN python3 -m pip install --no-cache-dir \
    Pillow \
    defusedxml \
    lxml \
    "markitdown[pptx]"

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --registry=${NPM_REGISTRY}

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/server ./server
COPY --from=builder /app/src ./src
COPY --from=builder /app/public ./public
COPY --from=builder /app/index.html ./index.html
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/tsconfig.server.json ./tsconfig.server.json

RUN mkdir -p /data/ppt/runtime/sandboxes /data/ppt/runtime/artifacts /data/ppt/runtime/uploads \
  && chown -R node:node /app /data/ppt/runtime

EXPOSE 8787

USER node

CMD ["npm", "start"]
