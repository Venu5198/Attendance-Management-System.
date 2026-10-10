# Stage 1: Build React + Vite application
FROM node:20-alpine AS build

WORKDIR /app

# Copy package definitions
COPY package.json package-lock.json ./

# Install dependencies cleanly
RUN npm ci

# Copy application source
COPY . .

# API base URL build argument
ARG VITE_API_BASE_URL=http://localhost:8000/api/v1
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

# Build production distribution
RUN npm run build

# Stage 2: Serve static files with Nginx
FROM nginx:1.27-alpine

# Copy customized Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# Healthcheck
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --spider -q http://127.0.0.1:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
