FROM node:18-alpine AS base

# Install pnpm
RUN npm install -g pnpm@10.13.1

FROM base AS dependencies
WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy package.json files for all dependencies
COPY apps/vcs/package.json ./apps/vcs/
COPY packages/supabase/package.json ./packages/supabase/
COPY packages/logger/package.json ./packages/logger/

# Install dependencies
RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app

# Copy dependencies
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/apps/vcs/node_modules ./apps/vcs/node_modules
COPY --from=dependencies /app/packages/supabase/node_modules ./packages/supabase/node_modules
COPY --from=dependencies /app/packages/logger/node_modules ./packages/logger/node_modules

# Copy source code
COPY . .

# Build packages and service
RUN pnpm --filter=@ottrpad/logger build
RUN pnpm --filter=@packages/supabase build
RUN pnpm --filter=vcs build

FROM base AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Copy node_modules
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/apps/vcs/node_modules ./apps/vcs/node_modules
COPY --from=dependencies /app/packages/supabase/node_modules ./packages/supabase/node_modules
COPY --from=dependencies /app/packages/logger/node_modules ./packages/logger/node_modules

# Copy built files
COPY --from=build /app/apps/vcs/dist ./apps/vcs/dist
COPY --from=build /app/packages/supabase/dist ./packages/supabase/dist
COPY --from=build /app/packages/logger/dist ./packages/logger/dist

# Copy package.json files
COPY apps/vcs/package.json ./apps/vcs/
COPY packages/supabase/package.json ./packages/supabase/
COPY packages/logger/package.json ./packages/logger/
COPY package.json pnpm-workspace.yaml ./

# Create data directory for git repos
RUN mkdir -p /app/apps/vcs/data

WORKDIR /app/apps/vcs

EXPOSE 5000

CMD ["node", "dist/app.js"]
