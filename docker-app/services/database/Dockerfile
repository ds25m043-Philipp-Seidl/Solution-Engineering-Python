# services/database/Dockerfile
FROM mongo:6.0

# Copy the initialization script
# Mongo executes scripts in this folder in alphabetical order on first boot
COPY init-mongo.js /docker-entrypoint-initdb.d/

EXPOSE 27017