# Stage 1: build the React frontend
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/index.html web/vite.config.ts web/tsconfig.json web/tailwind.config.js web/postcss.config.js ./
COPY web/public ./public
COPY web/src ./src
RUN npx vite build

# Stage 2: API server that also serves the built frontend
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev
COPY server/ ./
COPY --from=web /web/dist ./public
ENV STATIC_DIR=/app/public PORT=8080
EXPOSE 8080
CMD ["node", "index.js"]
