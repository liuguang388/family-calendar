FROM node:20-slim

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
