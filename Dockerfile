FROM node:20-slim

# Install build dependencies for sqlite3 native module
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for better caching
COPY package.json ./
RUN npm install --production

# Copy app source
COPY . .

# Create data directories
RUN mkdir -p /data/uploads

# Railway sets PORT env var automatically
EXPOSE 8080
EXPOSE 3456

ENV DATA_DIR=/data

CMD ["node", "server.js"]
