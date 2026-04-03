FROM node:20-alpine
WORKDIR /app

ARG NEXT_PUBLIC_API_BASE=http://localhost:8001
ENV NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE}

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]