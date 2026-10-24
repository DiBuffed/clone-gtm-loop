FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-noto-cjk tini && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production GTM_DATA_DIR=/data GTM_FONT_PATH=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc
COPY --from=build --chown=node:node /app ./
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "start"]
