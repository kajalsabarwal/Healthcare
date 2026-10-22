FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY backend ./backend
COPY frontend ./frontend
USER node
EXPOSE 3000
CMD ["node","backend/server.js"]
