import os
import pandas as pd
from pymongo import MongoClient

MONGO_URI = "mongodb://database:27017"
DB_NAME = "moviesdb"
DATA_DIR = "/app/data"

def migrate_csvs_to_mongo():
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]
    print(f"🔗 Connected to MongoDB at {MONGO_URI}")

    # --- 1. SPECIAL HANDLING FOR MOVIES.CSV ---
    movies_path = os.path.join(DATA_DIR, "movies.csv")
    if os.path.exists(movies_path):
        print("🎬 Processing movies.csv with data cleaning...")
        df = pd.read_csv(movies_path)

        # Extract the year from the title (e.g., "Inception (2010)" -> 2010)
        df['year'] = df['title'].str.extract(r'\((\d{4})\)')
        df['year'] = pd.to_numeric(df['year'], errors='coerce') # Convert to float/int

        # Clean the title by removing the year text
        df['title'] = df['title'].str.replace(r'\s*\(\d{4}\)', '', regex=True)

        # Convert "Action|Sci-Fi" into an actual array ["Action", "Sci-Fi"]
        # and rename the column from 'genres' to 'genre' to match our backend
        df['genre'] = df['genres'].str.split('|')
        df = df.drop(columns=['genres'])

        # Fix Pandas NaN values for MongoDB
        df = df.where(pd.notnull(df), None)

        # Drop old collection and insert clean data
        db.catalog.drop()
        records = df.to_dict(orient="records")
        db.catalog.insert_many(records)
        print(f"✅ Inserted {len(records)} clean records into the 'catalog' collection.\n")

    # --- 2. STANDARD HANDLING FOR ALL OTHER CSVS (ratings, tags, etc.) ---
    for filename in os.listdir(DATA_DIR):
        if filename.endswith(".csv") and filename != "movies.csv":
            collection_name = filename.replace(".csv", "")
            file_path = os.path.join(DATA_DIR, filename)

            print(f"📄 Reading {filename}...")
            df = pd.read_csv(file_path)
            df = df.where(pd.notnull(df), None)

            records = df.to_dict(orient="records")
            if records:
                db[collection_name].drop()
                db[collection_name].insert_many(records)
                print(f"✅ Inserted {len(records)} records into '{collection_name}'.\n")

    print("🎉 All CSVs successfully migrated to MongoDB!")

if __name__ == "__main__":
    migrate_csvs_to_mongo()