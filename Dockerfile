FROM node:24-alpine

WORKDIR /app

COPY package.json README.md DEPLOYMENT.md ./
COPY client ./client
COPY server ./server
COPY shared ./shared
COPY tests ./tests

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=10000

EXPOSE 10000

CMD ["node", "server/index.mjs"]
