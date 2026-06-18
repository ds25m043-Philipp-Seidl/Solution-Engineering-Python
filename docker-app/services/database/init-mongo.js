// services/database/init-mongo.js
db = db.getSiblingDB('moviesdb');

// Create a collection and insert initial seed data
// (We just need an empty collection to exist so the Python seed script doesn't crash)
db.createCollection("catalog");

print("✅ MongoDB successfully initialized.");