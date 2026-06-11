import os
import pandas as pd
from pymongo import MongoClient

# Because your Docker container exposes port 27017, we can hit it from localhost
MONGO_URI = "mongodb://database:27017"
DB_NAME = "moviesdb"
DATA_DIR = "/app/data"

def migrate_csvs_to_mongo():
    # Connect to your running Docker database
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]

    print(f"🔗 Connected to MongoDB at {MONGO_URI}")

    # Loop through every file in your data directory
    for filename in os.listdir(DATA_DIR):
        if filename.endswith(".csv"):
            # The collection name becomes the filename (e.g., 'movies.csv' -> 'movies')
            collection_name = filename.replace(".csv", "")
            file_path = os.path.join(DATA_DIR, filename)

            print(f"📄 Reading {filename}...")
            df = pd.read_csv(file_path)

            # PyMongo hates Pandas 'NaN' values. This converts them to standard Python 'None' (null)
            df = df.where(pd.notnull(df), None)

            # Convert the Pandas DataFrame into a list of Python dictionaries
            records = df.to_dict(orient="records")

            if records:
                # Drop the collection if it already exists so we don't duplicate data
                db[collection_name].drop()

                # Insert all rows into MongoDB
                db[collection_name].insert_many(records)
                print(f"✅ Inserted {len(records)} records into the '{collection_name}' collection.\n")

    print("🎉 All CSVs successfully migrated to MongoDB!")

if __name__ == "__main__":
    migrate_csvs_to_mongo()