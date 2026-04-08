# ---------- Build stage ----------
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---------- Serve stage ----------
FROM nginx:alpine

# Copy built static files
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx config template (uses ${PORT})
COPY nginx.conf /etc/nginx/templates/default.conf.template

# nginx:alpine has an entrypoint that runs envsubst on /etc/nginx/templates/*.template
# and writes them to /etc/nginx/conf.d/, then starts nginx.
# This makes ${PORT} get replaced at container start with whatever Cloud Run injects.

ENV PORT=8080
EXPOSE 8080