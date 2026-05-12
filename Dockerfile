FROM node:20-bookworm-slim
WORKDIR /app
COPY . .
ENV NODE_ENV=production
CMD ["node", "daily-clean.js", "--scheduled"]

