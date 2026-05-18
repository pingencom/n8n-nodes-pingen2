ARG N8N_VERSION=1.123.37

FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run check && npm run build

FROM n8nio/n8n:${N8N_VERSION}

USER root
RUN mkdir -p /opt/custom-nodes/node_modules/n8n-nodes-pingen2
COPY --from=builder --chown=node:node /app/dist/ /opt/custom-nodes/node_modules/n8n-nodes-pingen2/dist/
COPY --from=builder --chown=node:node /app/package.json /opt/custom-nodes/node_modules/n8n-nodes-pingen2/package.json
COPY --from=builder --chown=node:node /app/LICENSE /opt/custom-nodes/node_modules/n8n-nodes-pingen2/LICENSE
RUN chmod -R 755 /opt/custom-nodes
USER node

ENV N8N_CUSTOM_EXTENSIONS=/opt/custom-nodes
