FROM node:20-alpine

# Security: non-root user
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

# Install deps first (cached layer)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy source
COPY src/ ./src/

# Non-root
USER app

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["node", "src/index.js"]
