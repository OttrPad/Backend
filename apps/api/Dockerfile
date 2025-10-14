FROM node:18-alpine AS base

# Install pnpm
RUN npm install -g pnpm@10.13.1

FROM base AS dependencies
WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy package.json files for all dependencies
COPY apps/api/package.json ./apps/api/
COPY packages/supabase/package.json ./packages/supabase/

# Install dependencies
RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app

# Copy dependencies
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=dependencies /app/packages/supabase/node_modules ./packages/supabase/node_modules

# Copy source code
COPY . .

# Build packages and service
RUN pnpm --filter=@packages/supabase build
RUN pnpm --filter=api build

FROM base AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Copy node_modules
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=dependencies /app/packages/supabase/node_modules ./packages/supabase/node_modules

# Copy built files
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/supabase/dist ./packages/supabase/dist

# Copy package.json files
COPY apps/api/package.json ./apps/api/
COPY packages/supabase/package.json ./packages/supabase/
COPY package.json pnpm-workspace.yaml ./

EXPOSE 4000

CMD ["node", "apps/api/dist/app.js"]
