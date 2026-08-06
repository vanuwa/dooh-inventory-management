FROM node:24-alpine AS builder
WORKDIR /app
COPY frontend/package.json ./
RUN npm install
COPY frontend/ .
RUN rm -f ./public/CHANGELOG.md
COPY CHANGELOG.md ./public/CHANGELOG.md
ARG GIT_COMMIT=unknown
ARG GIT_BRANCH=main
ARG GOOGLE_MAPS_API_KEY=
ARG GOOGLE_MAPS_MAP_ID=
ENV VITE_GIT_COMMIT=$GIT_COMMIT
ENV VITE_GIT_BRANCH=$GIT_BRANCH
# Write the Maps vars only when actually supplied. Setting them as ENV
# unconditionally would export an EMPTY value, and Vite gives pre-existing env
# vars priority over .env files — silently shadowing a frontend/.env that a
# developer supplied for local dev and copied in with the build context.
RUN if [ -n "$GOOGLE_MAPS_API_KEY" ]; then echo "VITE_GOOGLE_MAPS_API_KEY=$GOOGLE_MAPS_API_KEY" >> .env.production.local; fi && \
    if [ -n "$GOOGLE_MAPS_MAP_ID" ]; then echo "VITE_GOOGLE_MAPS_MAP_ID=$GOOGLE_MAPS_MAP_ID" >> .env.production.local; fi
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
