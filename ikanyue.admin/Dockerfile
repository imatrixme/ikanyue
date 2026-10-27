FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_OPS_API_BASE=/ops
ARG VITE_OPS_API_MOCK=false
ENV VITE_OPS_API_BASE=$VITE_OPS_API_BASE
ENV VITE_OPS_API_MOCK=$VITE_OPS_API_MOCK

RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
