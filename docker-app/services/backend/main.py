from fastapi import Query
import random

# Add this new request model
class GameSetupRequest(BaseModel):
    genre: str
    min_year: int
    max_year: int

@app.post("/api/start-game")
async def start_game(setup: GameSetupRequest):
    db = db_client.moviesdb

    # 1. Build the MongoDB query based on user preferences
    query = {
        "genre": setup.genre,
        "year": {"$gte": setup.min_year, "$lte": setup.max_year}
    }

    # 2. Use MongoDB's $sample to pull 30 random movies matching the criteria
    cursor = db.catalog.aggregate([
        {"$match": query},
        {"$sample": {"size": 30}},
        {"$project": {"_id": 0}}
    ])

    movies = await cursor.to_list(length=30)

    # Optional fallback: If the database doesn't have 30 exact matches,
    # you might need to drop the year filter and try again!
    if len(movies) < 30:
        return {"error": "Not enough movies match those exact filters. Widen your search!"}

    # 3. Chunk the 30 movies into 10 rounds of 3
    rounds = [movies[i:i + 3] for i in range(0, 30, 3)]

    return {"success": True, "rounds": rounds}