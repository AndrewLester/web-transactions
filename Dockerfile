FROM node:18-slim
COPY . /app
WORKDIR /app

RUN npm ci
RUN npm run build

ENV NODE_ENV=production

ENV PORT 8080
EXPOSE 8080
CMD [ "node build" ]
