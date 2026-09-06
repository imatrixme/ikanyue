FROM oven/bun:1.4.1 AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.4.1
WORKDIR /app
ENV NODE_ENV=production PAY_HOST=0.0.0.0 PAY_PORT=1340
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
USER bun
EXPOSE 1340
CMD ["bun", "src/index.ts"]
