import os
import httpx
import random
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
from motor.motor_asyncio import AsyncIOMotorClient

app = FastAPI()

# --- 1. CORS CONFIGURATION ---
# This allows your React frontend (running on a different port) to talk to this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For local development. Restrict this in production!
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 2. DATABASE CONFIGURATION ---
MONGO_URL = os.getenv("MONGO_URL", "mongodb://database:27017")
ML_ENGINE_URL = os.getenv("ML_URL", "http://mlengine:8000")
db_client = None

import math

def clean_nans(obj):
    """Recursively search for and replace float NaNs with None."""
    if isinstance(obj, dict):
        return {k: clean_nans(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_nans(v) for v in obj]
    elif isinstance(obj, float) and math.isnan(obj):
        return None
    return obj

@app.on_event("startup")
async def startup_db_client():
    global db_client
    db_client = AsyncIOMotorClient(MONGO_URL)
    print("✅ Backend connected to MongoDB")

@app.on_event("shutdown")
async def shutdown_db_client():
    db_client.close()

class SelectionRequest(BaseModel):
    movie_ids: List[int]

# --- 4. ROUTES ---

# 1. NEW ROUTE: Get all unique genres from the database
@app.get("/api/genres")
async def get_genres():
    db = db_client.moviesdb
    # This asks MongoDB to find every unique value in the 'genre' field across all movies
    genres = await db.catalog.distinct("genre")
    # Filter out nulls and sort alphabetically
    clean_genres = sorted([g for g in genres if g])
    return {"success": True, "genres": clean_genres}

# 2. UPDATED MODEL: Accept a list of genres
class GameSetupRequest(BaseModel):
    genres: List[str]  # Changed from single string to List
    min_year: int
    max_year: int

# 3. UPDATED ROUTE: Filter by multiple genres
@app.post("/api/start-game")
async def start_game(setup: GameSetupRequest):
    db = db_client.moviesdb

    # Use the $in operator to match ANY of the 3 selected genres
    query = {
        "genre": {"$in": setup.genres},
        "year": {"$gte": setup.min_year, "$lte": setup.max_year}
    }

    cursor = db.catalog.aggregate([
        {"$match": query},
        {"$sample": {"size": 30}},
        {"$project": {"_id": 0}}
    ])

    movies = await cursor.to_list(length=30)

    if len(movies) < 30:
        return {"error": f"Not enough movies match those exact filters ({len(movies)} found). Widen your search!"}

    # ENRICH WITH TMDB (Concurrently for speed)
    enriched_movies = await asyncio.gather(*[enrich_movie_with_tmdb(db, m) for m in movies])

    rounds = [enriched_movies[i:i + 3] for i in range(0, 30, 3)]
    return {"success": True, "rounds": rounds}

@app.post("/api/get-movies")
async def get_movies_pipeline(request: SelectionRequest):
    try:
        print(f"Received 10 anchors from frontend: {request.movie_ids}")

        # 1. Forward the 10 chosen IDs to the ML Engine
        async with httpx.AsyncClient() as client:
            try:
                ml_response = await client.post(
                    f"{ML_ENGINE_URL}/recommend",
                    json={"selected_movie_ids": request.movie_ids},
                    timeout=10.0
                )
                ml_response.raise_for_status()
            except Exception as e:
                print(f"ML Engine Error: {e}")
                raise HTTPException(status_code=500, detail="ML Engine unreachable")

        # 2. Extract the calculated recommendations returned by the ML Engine
        recommended_ids = ml_response.json().get("recommended_ids", [])

        # 3. Query MongoDB to get the full titles, years, and genres for these new IDs
        db = db_client.moviesdb
        cursor = db.catalog.find(
            {"movieId": {"$in": recommended_ids}},
            {"_id": 0}
        )
        unordered_movies = await cursor.to_list(length=10)

        # Map the movies by their ID for quick lookup
        movie_dict = {m.get("movieId"): m for m in unordered_movies}

        # Rebuild the list in the exact order the ML Engine recommended
        final_movies = [movie_dict[mid] for mid in recommended_ids if mid in movie_dict]

        # ENRICH WITH TMDB
        # ENRICH WITH TMDB
        final_movies = await asyncio.gather(*[enrich_movie_with_tmdb(db, m) for m in final_movies])

        # Scrub the MongoDB data for NaNs right before returning!
        return {
            "success": True,
            "recommendations": clean_nans(final_movies)
        }
    except Exception as e:
        import traceback
        traceback.print_exc()

@app.get("/api/search")
async def search_movies(q: str = "", limit: int = 20): # Changed limit to 20 to avoid TMDB rate limits
    db = db_client.moviesdb

    query = {"title": {"$regex": q, "$options": "i"}} if q else {}
    cursor = db.catalog.find(query, {"_id": 0}).limit(limit)
    movies = await cursor.to_list(length=limit)

    # ENRICH WITH TMDB
    movies = await asyncio.gather(*[enrich_movie_with_tmdb(db, m) for m in movies])

    return {"success": True, "movies": movies}


import os
import httpx

TMDB_API_KEY = os.getenv("TMDB_API_KEY", "5fd8ba242aa72bbff9e33b84b60b3f26")

async def enrich_movie_with_tmdb(db, movie):
    """Fetches the tmdbId from the database, then fetches the poster and plot from TMDB."""

    # 1. Find the matching tmdbId in the links collection
    link_data = await db.links.find_one({"movieId": movie["movieId"]})

    if not link_data or "tmdbId" not in link_data:
        return movie # Return as-is if no link exists

    tmdb_id = link_data["tmdbId"]

    # 2. Fetch the movie details from TMDB
    tmdb_url = f"https://api.themoviedb.org/3/movie/{tmdb_id}?api_key={TMDB_API_KEY}&language=en-US"

    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(tmdb_url, timeout=5.0)
            if response.status_code == 200:
                data = response.json()

                # TMDB returns a partial image path. We must prepend their base image URL.
                poster_path = data.get("poster_path")
                if poster_path:
                    movie["poster_url"] = f"https://image.tmdb.org/t/p/w500{poster_path}"
                else:
                    movie["poster_url"] = None

                movie["description"] = data.get("overview", "No description available.")
        except Exception as e:
            print(f"Failed to fetch TMDB data for {movie['title']}: {e}")

    return movie