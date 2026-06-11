FROM postgres:15-alpine

# Set default environment variables (Override these in your compose file!)
ENV POSTGRES_USER=myuser
ENV POSTGRES_PASSWORD=mypassword
ENV POSTGRES_DB=moviesdb

# Copy your initial database schema or movie catalog seed script
# This file will automatically execute when the container starts for the first time
COPY init.sql /docker-entrypoint-initdb.d/

EXPOSE 5432