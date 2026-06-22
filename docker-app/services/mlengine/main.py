import pickle
import numpy as np
import torch
import torch.nn as nn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List

# ==========================================
# 1. ARCHITECTURES
# ==========================================
class NeuralCF(nn.Module):
    def __init__(self, n_users, n_movies, n_genres=19, n_factors=64, dropout_rate=0.05):
        super().__init__()
        self.u_gmf = nn.Embedding(n_users, n_factors)
        self.m_gmf = nn.Embedding(n_movies, n_factors)
        self.u_mlp = nn.Embedding(n_users, n_factors)
        self.m_mlp = nn.Embedding(n_movies, n_factors)
        self.genre_proj = nn.Linear(n_genres, n_factors, bias=False)
        dims = [2 * n_factors + n_genres, 256, 128, 64, 32]
        self.mlp = nn.Sequential(*[
            layer for in_d, out_d in zip(dims, dims[1:])
            for layer in (nn.Linear(in_d, out_d), nn.ReLU(), nn.Dropout(dropout_rate))
        ])
        self.output_layer = nn.Linear(n_factors + dims[-1], 1)

class MatrixFactorization(nn.Module):
    def __init__(self, n_users, n_movies, n_factors=128):
        super().__init__()
        self.u_emb = nn.Embedding(n_users, n_factors)
        self.m_emb = nn.Embedding(n_movies, n_factors)
        self.u_bias = nn.Embedding(n_users, 1)
        self.m_bias = nn.Embedding(n_movies, 1)
        self.global_bias = nn.Parameter(torch.zeros(1))

    def forward(self, u, m):
        dot = (self.u_emb(u) * self.m_emb(m)).sum(dim=1)
        return dot + self.u_bias(u).squeeze() + self.m_bias(m).squeeze() + self.global_bias

app = FastAPI()
DEVICE = torch.device("cpu")

# ==========================================
# 2. LOAD ARTIFACTS ON STARTUP
# ==========================================
print("Loading Metadata...")
with open("ncf_metadata.pkl", "rb") as f:
    meta = pickle.load(f)

print("Loading SVD Matrix...")
raw_svd_matrix = np.load("svd_item_matrix.npy")
norms = np.linalg.norm(raw_svd_matrix, axis=0)
norms[norms == 0] = 1e-9
svd_matrix = raw_svd_matrix / norms

print("Loading NCF Model...")
model_ncf = NeuralCF(meta["N_USERS"], meta["N_MOVIES"], n_genres=meta["N_GENRES"]).to(DEVICE)
model_ncf.load_state_dict(torch.load("ncf_weights.pth", map_location=DEVICE, weights_only=True))
model_ncf.eval()
all_genres_tensor = meta["all_genres_tensor"].to(DEVICE)

print("Loading Funk SVD (RMSE) Model...")
model_funk = MatrixFactorization(meta["N_USERS"], meta["N_MOVIES"]).to(DEVICE)
model_funk.load_state_dict(torch.load("funk_svd_weights.pth", map_location=DEVICE, weights_only=True))
model_funk.eval()

class UserPreferences(BaseModel):
    selected_movie_ids: List[int]

# ==========================================
# 3. THE 3-WAY SHOWDOWN ENDPOINT
# ==========================================
@app.post("/recommend")
def get_showdown_recommendations(prefs: UserPreferences):
    try:
        valid_idxs = [meta["movie_to_idx"][mid] for mid in prefs.selected_movie_ids if mid in meta["movie_to_idx"]]
        if not valid_idxs:
            raise HTTPException(status_code=400, detail="No valid movies.")

        idx_tensor = torch.tensor(valid_idxs, dtype=torch.long, device=DEVICE)

        # -----------------------------------
        # 1. PURE SVD (Cosine Similarity)
        # -----------------------------------
        svd_user_vec = np.mean(svd_matrix[:, valid_idxs], axis=1)
        svd_scores = np.dot(svd_user_vec, svd_matrix)
        svd_scores[valid_idxs] = -np.inf
        top_10_svd_idx = np.argsort(svd_scores)[::-1][:10]
        svd_ids = [int(meta["idx_to_movie"][idx]) for idx in top_10_svd_idx]

        # -----------------------------------
        # 2. NeuralCF (Two-Stage Pipeline)
        # -----------------------------------
        top_200_svd_idx = np.argsort(svd_scores)[::-1][:200]
        candidate_tensor = torch.tensor(top_200_svd_idx.copy(), dtype=torch.long, device=DEVICE)

        with torch.no_grad():
            synth_u_gmf = torch.mean(model_ncf.m_gmf(idx_tensor), dim=0, keepdim=True)
            synth_u_mlp = torch.mean(model_ncf.m_mlp(idx_tensor), dim=0, keepdim=True)

            u_gmf_expanded = synth_u_gmf.expand(200, -1)
            u_mlp_expanded = synth_u_mlp.expand(200, -1)

            m_gmf_batch = model_ncf.m_gmf(candidate_tensor)
            m_mlp_batch = model_ncf.m_mlp(candidate_tensor)
            g_batch = all_genres_tensor[candidate_tensor]

            gmf_out = u_gmf_expanded * (m_gmf_batch + model_ncf.genre_proj(g_batch))
            mlp_in = torch.cat([u_mlp_expanded, m_mlp_batch, g_batch], dim=1)
            mlp_out = model_ncf.mlp(mlp_in)

            ncf_scores = model_ncf.output_layer(torch.cat([gmf_out, mlp_out], dim=1)).squeeze(1)
            top_10_local_idx = torch.argsort(ncf_scores, descending=True)[:10]
            ncf_ids = [int(meta["idx_to_movie"][idx]) for idx in candidate_tensor[top_10_local_idx].tolist()]

        # -----------------------------------
        # 3. Funk SVD (RMSE Optimized)
        # -----------------------------------
        with torch.no_grad():
            # Create synthetic user by averaging item embeddings
            synth_u_emb = torch.mean(model_funk.m_emb(idx_tensor), dim=0, keepdim=True)

            all_m = torch.arange(meta["N_MOVIES"], device=DEVICE)
            m_emb = model_funk.m_emb(all_m)
            m_bias = model_funk.m_bias(all_m).squeeze()

            # Predict stars for every single movie in the catalog!
            funk_scores = (synth_u_emb.expand(meta["N_MOVIES"], -1) * m_emb).sum(dim=1) + m_bias + model_funk.global_bias
            funk_scores_np = funk_scores.cpu().numpy()
            funk_scores_np[valid_idxs] = -np.inf

            top_10_funk_idx = np.argsort(funk_scores_np)[::-1][:10]
            funk_ids = [int(meta["idx_to_movie"][idx]) for idx in top_10_funk_idx]

        return {
            "svd_recommended_ids": svd_ids,
            "ncf_recommended_ids": ncf_ids,
            "funk_svd_recommended_ids": funk_ids
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))