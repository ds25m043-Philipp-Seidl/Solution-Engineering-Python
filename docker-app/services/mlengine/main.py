import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List

app = FastAPI()

# --- MOCK PRE-TRAINED DATA ---
# In a real app, you load this from a .pkl file!
# Imagine your catalog has 10,000 movies, each with 50 latent factors.
NUM_MOVIES = 10000
NUM_FACTORS = 50
# Generating a fake pre-trained Item Matrix for demonstration
item_matrix = np.random.rand(NUM_MOVIES, NUM_FACTORS)

class UserPreferences(BaseModel):
    selected_movie_ids: List[int]

@app.post("/recommend")
def get_recommendations(prefs: UserPreferences):
    movie_ids = prefs.selected_movie_ids

    # 1. THE FOLDING-IN MATH (Least Squares)
    # Grab the pre-trained 50-number vectors for the 10 movies the user picked
    # (Assuming movie_ids map directly to array indices for simplicity)
    selected_item_vectors = item_matrix[movie_ids]

    # We assume the user "rates" the ones they picked a perfect 5.0
    assumed_ratings = np.array([5.0] * len(movie_ids))

    # Solve for the User Vector: "What user vector, when multiplied by these 10 item vectors, equals 5.0?"
    # np.linalg.lstsq returns a tuple; the first element [0] is the solved vector.
    user_vector = np.linalg.lstsq(selected_item_vectors, assumed_ratings, rcond=None)[0]

    # 2. GENERATE RECOMMENDATIONS
    # Now multiply this brand new user_vector against the ENTIRE catalog of 10,000 movies
    # This generates a predicted rating for every movie in the database
    predicted_all_ratings = np.dot(item_matrix, user_vector)

    # 3. SORT AND RETURN
    # Get the indices (Movie IDs) of the highest predicted ratings
    # argsort sorts lowest-to-highest, so we take the last 15 and reverse them [::-1]
    top_indices = np.argsort(predicted_all_ratings)[-15:][::-1]

    # Filter out the 10 movies they already picked so we don't recommend them again!
    final_recs = [int(idx) for idx in top_indices if idx not in movie_ids]

    return {"recommended_ids": final_recs[:5]} # Return the top 5