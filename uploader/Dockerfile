# final production image
FROM node:24-trixie-slim
EXPOSE 8080
WORKDIR /usr/src
RUN apt-get update && apt-get install -y git
COPY package.json package-lock.json ./
COPY uploader/package.json uploader/package.json
ENV NODE_ENV=production
RUN npm ci --omit=dev --workspace workadventureuploader
COPY uploader uploader

WORKDIR /usr/src/uploader
USER node
# No curl in the slim image: Node's fetch answers the healthcheck (deploy.sh waits for "healthy").
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=10 \
  CMD ["node", "-e", "fetch('http://localhost:8080/ping').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["npm", "run", "start"]
