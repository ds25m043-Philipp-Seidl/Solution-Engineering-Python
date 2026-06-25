import pickle
import numpy as np
import torch
import torch.nn as nn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List

# ==========================================
# 1. ARCHITECTURE
# ==========================================
class NeuralCF(nn.Module):
    def __init__(self, n_users, n_movies, n_genres=19, n_genome=1128, n_factors=128, dropout_rate=0.2):
        super().__init__()
        self.u_gmf = nn.Embedding(n_users, n_factors)
        self.m_gmf = nn.Embedding(n_movies, n_factors)
        self.u_mlp = nn.Embedding(n_users, n_factors)
        self.m_mlp = nn.Embedding(n_movies, n_factors)
        self.u_bias = nn.Embedding(n_users, 1)
        self.m_bias = nn.Embedding(n_movies, 1)
        self.genre_proj = nn.Linear(n_genres, n_factors, bias=False)
        self.genome_proj = nn.Linear(n_genome, n_factors, bias=False)

        input_dim = (2 * n_factors) + n_genres + n_genome
        self.mlp = nn.Sequential(
            nn.Linear(input_dim, 256), nn.ReLU(), nn.Dropout(dropout_rate),
            nn.Linear(256, 128), nn.ReLU(), nn.Dropout(dropout_rate),
            nn.Linear(128, 64), nn.ReLU()
        )
        self.output_layer = nn.Linear(n_factors + 64, 1)

    def forward(self, u, m, g, gen):
        gmf_out = self.u_gmf(u) * (self.m_gmf(m) + self.genre_proj(g) + (self.genome_proj(gen) * 2.0))
        mlp_out = self.mlp(torch.cat([self.u_mlp(u), self.m_mlp(m), g, gen], dim=1))
        logits = self.output_layer(torch.cat([gmf_out, mlp_out], dim=1))
        return (logits + self.u_bias(u) + self.m_bias(m)).squeeze(1)

app = FastAPI()
DEVICE = torch.device("cpu")

# ==========================================
# 2. LOAD ARTIFACTS ON STARTUP
# ==========================================
print("Loading Metadata...")
with open("ncf_metadata.pkl", "rb") as f:
    meta = pickle.load(f)

# --- SVD ADDED BACK ---
print("Loading SVD Matrix...")
raw_svd_matrix = np.load("svd_item_matrix.npy")
norms = np.linalg.norm(raw_svd_matrix, axis=0)
norms[norms == 0] = 1e-9
svd_matrix = raw_svd_matrix / norms

print("Loading NCF Model...")
model_ncf = NeuralCF(
    n_users=meta["N_USERS"],
    n_movies=meta["N_MOVIES"],
    n_genres=meta["N_GENRES"],
    n_genome=meta.get("N_GENOME", 1128),
    n_factors=128
).to(DEVICE)

model_ncf.load_state_dict(torch.load("ncf_weights.pth", map_location=DEVICE, weights_only=True))
model_ncf.eval()

# ==========================================
# 3. FASTAPI ENDPOINT
# ==========================================
class UserPreferences(BaseModel):
    selected_movie_ids: List[int]

@app.post("/recommend")
def get_showdown_recommendations(prefs: UserPreferences):
    try:
        valid_idxs = [meta["movie_to_idx"][mid] for mid in prefs.selected_movie_ids if mid in meta["movie_to_idx"]]
        if not valid_idxs:
            raise HTTPException(status_code=400, detail="No valid movies found in database.")

        # ==============================
        # MODEL 1: SVD BASELINE
        # ==============================
        svd_user_vec = np.sum(svd_matrix[:, valid_idxs], axis=1)
        svd_scores = np.dot(svd_user_vec, svd_matrix)
        svd_scores[valid_idxs] = -np.inf
        top_10_svd_idx = np.argsort(svd_scores)[::-1][:10]
        svd_ids = [int(meta["idx_to_movie"][idx]) for idx in top_10_svd_idx]

        # ==============================
        # MODEL 2: NCF GENOME-MATCHMAKER
        # ==============================
        liked_tensor = torch.tensor(valid_idxs, dtype=torch.long, device=DEVICE)

        with torch.no_grad():
            # 1. Genome-Matchmaker: Aesthetic DNA
            liked_genome_avg = meta["genome_tensor_all"][liked_tensor].mean(dim=0).unsqueeze(0)
            proj_liked = model_ncf.genome_proj(liked_genome_avg)
            proj_all = model_ncf.genome_proj(meta["genome_tensor_all"])

            # Semantic Similarity
            genome_sim = torch.matmul(proj_liked, proj_all.t()).squeeze()

            # 2. Quality & Popularity
            quality_score = model_ncf.m_bias.weight.squeeze() + (0.4 * meta["norm_ratings"])

            # Combine: 60% Genome Fit + 40% Quality
            ncf_scores = (0.6 * genome_sim) + (0.4 * quality_score)

            # Popularity Penalty (Discovery bias)
            ncf_scores = ncf_scores - (0.3 * meta["log_pop"])

            # Mask liked items
            ncf_scores[valid_idxs] = -np.inf

            # Get Top 10
            top_10_ncf_idx = torch.argsort(ncf_scores, descending=True)[:10]
            ncf_ids = [int(meta["idx_to_movie"][idx]) for idx in top_10_ncf_idx.tolist()]

        # Return both arrays!
        return {
            "svd_recommended_ids": svd_ids,
            "ncf_recommended_ids": ncf_ids,
            "metadata": {"model_version": "genome-matchmaker-v2"}
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))