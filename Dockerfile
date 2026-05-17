FROM node:22-alpine

WORKDIR /app

COPY package.json ./

RUN npm install --ignore-scripts

COPY . .

EXPOSE 5173 3001

CMD ["sh", "-c", "node server.js & npm run dev"]
