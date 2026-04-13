# ---- base: pnpm + deps ----
FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ packages/
COPY apps/bff/package.json apps/bff/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

# ---- bff ----
FROM base AS bff
COPY lib/ lib/
COPY tsconfig.base.json tsconfig.base.json
COPY apps/bff/ apps/bff/
EXPOSE 3001
CMD ["pnpm", "exec", "tsx", "watch", "apps/bff/src/index.ts"]

# ---- web-build ----
FROM base AS web-build
COPY tsconfig.base.json tsconfig.base.json
COPY apps/web/ apps/web/
ENV VITE_API_BASE=""
RUN pnpm --filter @docwise/web build

# ---- web (nginx) ----
FROM nginx:alpine AS web
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
