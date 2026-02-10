# ========== 阶段一：构建 ==========
FROM node:20-alpine AS builder

WORKDIR /app

# 启用 pnpm（Alpine 下推荐显式安装）
RUN corepack enable && corepack prepare pnpm@latest --activate

# 先只复制依赖声明，利用层缓存
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN pnpm install --frozen-lockfile

# 再复制源码并构建
COPY . .
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
RUN pnpm build

# ========== 阶段二：运行（standalone 输出，无需 node_modules） ==========
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 只拷贝 standalone 产物（内含最小 node 依赖），不再安装 pnpm/node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
