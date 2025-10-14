FROM node:18-alpine AS base

# Install pnpm
RUN npm install -g pnpm@10.13.1

FROM base AS dependencies
WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy package.json files for all dependencies
COPY apps/exe/package.json ./apps/exe/
COPY packages/logger/package.json ./packages/logger/

# Install dependencies
RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app

# Copy dependencies
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/apps/exe/node_modules ./apps/exe/node_modules
COPY --from=dependencies /app/packages/logger/node_modules ./packages/logger/node_modules

# Copy source code
COPY . .

# Build packages and service
RUN pnpm --filter=@ottrpad/logger build
RUN pnpm --filter=exe build

FROM base AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Install Docker CLI for Docker-in-Docker capability
RUN apk add --no-cache docker-cli

# Copy node_modules
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/apps/exe/node_modules ./apps/exe/node_modules
COPY --from=dependencies /app/packages/logger/node_modules ./packages/logger/node_modules

# Copy built files
COPY --from=build /app/apps/exe/dist ./apps/exe/dist
COPY --from=build /app/packages/logger/dist ./packages/logger/dist

# Copy package.json files
COPY apps/exe/package.json ./apps/exe/
COPY packages/logger/package.json ./packages/logger/
COPY package.json pnpm-workspace.yaml ./

EXPOSE 4004

CMD ["node", "apps/exe/dist/app.js"]
