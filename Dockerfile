FROM node:22-slim

# Install build dependencies for sqlite3 native compilation
RUN apt-get update && apt-get install -y \
    python3 \
    python3-distutils \
    make \
    g++ \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install --production

# Copy source code
COPY . .

# Create data and uploads directories
RUN mkdir -p /data/uploads

# Ensure proper Node.js environment
ENV NODE_ENV=production
ENV PORT=3456
ENV DATA_DIR=/data

EXPOSE 3456

CMD ["node", "server.js"]
