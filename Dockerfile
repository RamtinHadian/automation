# Stage 1: build the React frontend
FROM node:22-alpine AS web
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json tailwind.config.js postcss.config.js ./
COPY src ./src
RUN npx vite build

# Stage 2: API server that also serves the built frontend
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev
COPY server/ ./
COPY --from=web /web/dist ./public
ENV STATIC_DIR=/app/public UPLOAD_DIR=/app/uploads PORT=8080
VOLUME /app/uploads
EXPOSE 8080
CMD ["node", "index.js"]
