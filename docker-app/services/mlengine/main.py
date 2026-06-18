import pickle
import torch
import torch.nn as nn
import torch.nn.functional as F
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List

# 1. Redefine the exact architecture from the notebook
class NeuralCF(nn.Module):
    def __init__(self, n_users, n_movies, n_factors_gmf=32, n_factors_mlp=32, mlp_hidden=(128, 64, 32), n_genres=19):
        super().__init__()
        self.u_gmf = nn.Embedding(n_users, n_factors_gmf)
        self.m_gmf = nn.Embedding(n_movies, n_factors_gmf)
        self.u_mlp = nn.Embedding(n_users, n_factors_mlp)
        self.m_mlp = nn.Embedding(n_movies, n_factors_mlp)
        self.genre_proj_gmf = nn.Linear(n_genres, n_factors_gmf, bias=False)
        dims = [2 * n_factors_mlp + n_genres, *mlp_hidden]
        self.mlp = nn.Sequential(*[
            layer for in_d, out_d in zip(dims, dims[1:])
            for layer in (nn.Linear(in_d, out_d), nn.ReLU())
        ])
        self.output_layer = nn.Linear(n_factors_gmf + mlp_hidden[-1], 1)

app = FastAPI()

# 2. Load Artifacts on Startup
print("Loading NCF Model and Metadata...")
with open("ncf_metadata.pkl", "rb") as f:
    meta = pickle.load(f)

DEVICE = torch.device("cpu")
model = NeuralCF(meta["N_USERS"], meta["N_MOVIES"], n_genres=meta["N_GENRES"]).to(DEVICE)
model.load_state_dict(torch.load("ncf_weights.pth", map_location=DEVICE))
model.eval()

# Pre-compute a combined embedding for all movies (GMF path + MLP path)
# This gives us a rich, latent representation of every movie in the catalog
with torch.no_grad():
    all_movie_idxs = torch.arange(meta["N_MOVIES"]).to(DEVICE)
    # Concatenate the two learned representations for a fuller picture
    all_embeddings = torch.cat([model.m_gmf(all_movie_idxs), model.m_mlp(all_movie_idxs)], dim=1)
    # Normalize for cosine similarity
    all_embeddings_norm = F.normalize(all_embeddings, p=2, dim=1)

class UserPreferences(BaseModel):
    selected_movie_ids: List[int]

@app.post("/recommend")
def get_recommendations(prefs: UserPreferences):
    print(f"Received anchor movies: {prefs.selected_movie_ids}")
    try:
        # Map raw database IDs to the model's internal matrix indices
        valid_idxs = []
        for mid in prefs.selected_movie_ids:
            if mid in meta["movie_to_idx"]:
                valid_idxs.append(meta["movie_to_idx"][mid])

        if not valid_idxs:
            raise HTTPException(status_code=400, detail="None of the selected movies exist in the model's vocabulary.")

        # Convert to tensor and fetch embeddings for the selected movies
        idx_tensor = torch.tensor(valid_idxs, dtype=torch.long).to(DEVICE)
        selected_embs = all_embeddings_norm[idx_tensor]

        # Create an "average user profile" from their selections
        user_profile = torch.mean(selected_embs, dim=0, keepdim=True)
        user_profile = F.normalize(user_profile, p=2, dim=1)

        # Calculate Cosine Similarity against the entire catalog
        similarities = torch.mm(user_profile, all_embeddings_norm.T).squeeze(0)

        # Get the top 20 matches
        top_k = 20
        top_scores, top_indices = torch.topk(similarities, top_k)

        # Convert back to raw database IDs, filtering out the ones they already selected
        recommended_ids = []
        selected_set = set(prefs.selected_movie_ids)

        for idx in top_indices.tolist():
            raw_id = meta["idx_to_movie"][idx]
            if raw_id not in selected_set:
                # CAST TO INT HERE
                recommended_ids.append(int(raw_id))
                if len(recommended_ids) == 10:
                    break

        return {"recommended_ids": recommended_ids}
    except:
        import traceback
        traceback.print_exc()
        return {"recommended_ids": []}