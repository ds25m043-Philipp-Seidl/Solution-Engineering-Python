FROM node:20-alpine
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
# use npm ci for strictly reproducible builds in Docker
RUN npm ci

# Copy the actual backend source code
COPY . .

# Expose the port your API runs on (e.g., 3000)
EXPOSE 3000

# Start the Node server
CMD ["npm", "start"]