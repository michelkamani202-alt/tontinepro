FROM node:22-alpine

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    TONTINE_DB_PATH=/data/tontinepro.sqlite

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --chown=node:node . .
RUN mkdir -p /data /backups && chown -R node:node /data /backups
USER node

EXPOSE 8080
CMD ["node", "serve.mjs"]
