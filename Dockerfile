FROM node:25-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY server.js .

ENV PORT=9000
EXPOSE $PORT

CMD ["node", "server.js"]