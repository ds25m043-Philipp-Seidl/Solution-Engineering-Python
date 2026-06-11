# Stage 1: Build the UI
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies first (caches this step if package.json doesn't change)
COPY package*.json ./
RUN npm install

# Copy the rest of the code and build
COPY . .
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine
# Copy the built assets from Stage 1 into Nginx's serving directory
# Note: change /app/dist to /app/build if you are using Create React App
COPY --from=build /app/dist /usr/share/nginx/html

# Expose the standard web port
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]