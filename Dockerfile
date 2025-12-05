# ====== Stage 1: build ======
FROM node:lts AS build
WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y \
    make \
    g++ \
    bash

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .
RUN yarn run build

# ====== Stage 2: production runtime ======
FROM node:lts-slim AS production
WORKDIR /usr/src/app

# 建立非 root 使用者（安全性）
RUN useradd --user-group --create-home --shell /bin/false appuser

ARG NODE_ENV='development'
ENV NODE_ENV=${NODE_ENV}

COPY package.json yarn.lock ./
RUN yarn install --production --frozen-lockfile

COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/public ./public

# 切換到非 root 使用者
USER appuser

EXPOSE 3001
CMD ["node", "dist/server.js"]