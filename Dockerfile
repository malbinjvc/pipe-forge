# Stage 1: Install dependencies
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile || bun install

# Stage 2: Build / prepare
FROM oven/bun:1 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Type check
RUN bunx tsc --noEmit

# Stage 3: Production
FROM oven/bun:1 AS production
WORKDIR /app

RUN echo "appuser:x:1001:1001::/app:/bin/sh" >> /etc/passwd && \
    echo "appgroup:x:1001:" >> /etc/group

COPY --from=build /app/src ./src
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/tsconfig.json ./

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["bun", "--eval", "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"]

CMD ["bun", "run", "src/index.ts"]
