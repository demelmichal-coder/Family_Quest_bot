# Build stage
FROM node:20-alpine AS build-stage

WORKDIR /app


COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Runtime stage
FROM nginx:stable-alpine

COPY --from=build-stage /app/dist /usr/share/nginx/html
RUN echo 'server { \
  listen 80; \
  root /usr/share/nginx/html; \
  index index.html; \
  location = /favicon.ico { access_log off; log_not_found off; return 204; } \
  location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; try_files $uri =404; } \
  location = /index.html { add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"; try_files $uri =404; } \
  location /api/ { proxy_pass https://family-quest-backend-6ottu5l2da-ew.a.run.app/api/; proxy_set_header Host family-quest-backend-6ottu5l2da-ew.a.run.app; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; proxy_ssl_verify off; } \
  location / { add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"; try_files $uri $uri/ /index.html; } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
