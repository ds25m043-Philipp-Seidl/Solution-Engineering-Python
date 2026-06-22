# Evolution of a Recommendation Engine: From Matrix Factorization to Two-Stage Deep Learning

## Executive Summary
This document outlines the architectural evolution of a production-grade Movie Recommendation Engine trained on the MovieLens 25M dataset. The objective was to build a system capable of delivering highly personalized, session-based recommendations.

Throughout the development cycle, we evaluated three distinct paradigms:
1. **Algebraic Matrix Factorization (Scipy SVD)**
2. **Deep Learning (Neural Collaborative Filtering via PyTorch)**
3. **Explicit Feedback Matrix Factorization (Funk SVD)**

After evaluating the structural limitations of each individual model, the final production deployment utilizes a **Two-Stage Hybrid Architecture** (Candidate Generation + Deep Re-Ranking), mirroring the architecture used by industry leaders like YouTube and Netflix.

---

## Evaluation Metric: The "HitRate@10" Decoy Test
To truly test if a model understands user behavior, we cannot simply ask it to predict star ratings. We must ask it to *rank* items accurately.
We evaluated models using a **Leave-One-Out HitRate@10** test:
1. We hid the absolute last movie a user positively interacted with (Rating >= 3.5).
2. We buried that 1 True Movie inside a pool of **99 "Decoy" Movies** randomly sampled from the Top 2000 most popular movies.
3. The model had to score all 100 movies and rank them. If the True Movie appeared in the Top 10, it counted as a "Hit".

*Note: A completely random guess would yield a baseline HitRate of 10.0%.*

---

## Model 1: Algebraic Matrix Factorization (Scipy SVD)
Our baseline model was a purely linear algebraic approach using Truncated Singular Value Decomposition (SVD).

### How it Works
We constructed a massive sparse matrix `R` where rows represented Users, columns represented Movies, and cells contained a `1.0` if the user liked the movie. SVD mathematically compresses this sparse matrix into two dense, lower-dimensional matrices (User Latent Vectors and Item Latent Vectors). We augmented the item matrix by vertically stacking **1,128 Genome Tags** to inject metadata (movie "vibes") into the calculation.

### Training & Parameters
* **Algorithm:** `scipy.sparse.linalg.svds`
* **Latent Factors (k):** Grid searched (128 vs. 256). `k=128` yielded the best performance.
* **Loss Function:** None (Pure algebraic factorization).

### Results & Challenges
* **HitRate@10:** **~53.6%**
* **The "Popularity Paradox":** When we attempted to penalize blockbusters by dynamically weighting the input matrix, the HitRate dropped to 46%. Because the test set relies on 99 popular decoys, penalizing blockbusters mathematically forced the model to fail the test. We had to run an "Unchained" version (weight = 1.0) to breach 50%.
* **The "Megaphone Effect":** In session-based inference, adding multiple movie vectors together caused massive blockbusters (like *Pulp Fiction*) to completely overpower niche movies due to their larger vector magnitudes.
* **The Fix:** We applied **Cosine Similarity Normalization** (L2 Normalization) to the final exported SVD matrix so every movie vector had a length of exactly `1.0`, allowing obscure movies to have an equal mathematical "vote".

---

## Model 2: Neural Collaborative Filtering (NCF)
To move beyond linear approximations and capture complex, non-linear user tastes, we built a deep learning model using PyTorch.

### How it Works
The NCF architecture utilizes two parallel embedding tracks (Generalized Matrix Factorization and a Multi-Layer Perceptron). The user and item embeddings—along with a dedicated 19-dimension Genre Embedding—are concatenated and passed through deep, non-linear neural layers.

### Training & Parameters
* **Architecture:** Embeddings (`n_factors=64`) -> Dense Layers `[256, 128, 64, 32]` -> 1 Output Node.
* **Loss Function:** `BCEWithLogitsLoss` (Binary Cross-Entropy). The model was trained to predict the *probability of a click*, not a star rating.
* **Negative Sampling:** For every 1 positive interaction, we dynamically generated **7 Hard Negatives** (movies the user did not watch) to teach the neural network the boundary of the user's taste.
* **Batch Size & Optimizer:** `8,192` batch size, Adam Optimizer (`lr=0.003`), `StepLR` (`gamma=0.5`).
* **Speed/Compute:** Utilized PyTorch AMP (`autocast` / `GradScaler`) to run 16-bit precision training on an RTX 4070.

### Results & Challenges
* **HitRate@10:** **~47.6%**
* **The "Weight Vest" Issue:** Early iterations utilized heavy Weight Decay and 20% Dropout. This choked the model, resulting in a flatlined 29% HitRate. Stripping weight decay and lowering dropout to 5% allowed the model to reach 47.6%.
* **The Cold-Start Hallucination:** NCF is highly non-linear. When presented with a "Cold Start" session (averaging 3 random movies to create a synthetic user profile), the coordinates teleported the user into uncharted latent space. The model panicked and hallucinogenically recommended highly obscure indie films (e.g., 1920s Portuguese silent films) instead of logical matches.

---

## Model 3: Explicit Matrix Factorization (Funk SVD)
We attempted to solve the SVD limitations by transitioning from `scipy` to an SGD-trained PyTorch implementation of Matrix Factorization (Funk SVD), famously utilized in the $1 Million Netflix Prize.

### How it Works
Instead of a deep MLP, the model strictly calculates the dot product of the User and Item embeddings, plus specific User Biases and Item Biases. Unlike NCF, this model was trained on *Explicit Feedback* (raw star ratings).

### Training & Parameters
* **Loss Function:** `MSELoss` (Mean Squared Error).
* **Target Data:** Exact ratings from 0.5 to 5.0 stars. No negative sampling was required.
* **Batch Size:** `16,384`.
* **Evaluation:** Implemented `np.clip(0.5, 5.0)` to ensure predictions stayed within the physical bounds of the rating scale before calculating RMSE.

### Results & The Industry Lesson
* **Test RMSE:** **0.8318 Stars** (Phenomenal predictive accuracy).
* **HitRate@10:** **18.4%** (Abysmal ranking accuracy).
* **The Takeaway:** This experiment perfectly replicated the historical reason the streaming industry abandoned RMSE. Predicting that a user will highly rate a 4-hour historical documentary (Aspirational Rating) does not mean the user actually wants to click on it on a Friday night (Implicit Behavior). Optimizing for stars actively destroyed the model's ability to rank clickable content.

---

## The Final Solution: The Two-Stage Recommender
No single model could solve all problems. SVD was fast, safe, and heavily biased toward popularity, but lacked deep personalization. NCF understood complex, non-linear taste (era, demographic, genre intersections), but hallucinated when searching the entire 59,000-movie catalog from scratch.

We implemented a **Two-Stage Pipeline** within the FastAPI backend to combine their strengths:

1. **Stage 1: Candidate Generation (SVD)**
    * The API receives the user's clicked movies.
    * It performs a lightning-fast Cosine Similarity dot-product against the normalized SVD matrix.
    * It extracts a "Safe Pool" of the Top 200 most relevant, logical candidate movies.
    * *Benefit: Bypasses the NCF "Cold Start" hallucination by anchoring the search space.*

2. **Stage 2: Deep Taste Filtering (NCF)**
    * The API feeds *only* those 200 safe candidates into the PyTorch NCF model.
    * The NCF model utilizes its deep dense layers and precise genre/metadata embeddings to mathematically analyze the nuances of the 200 candidates.
    * It re-ranks them based on non-linear user behavior, surfacing the absolute best Top 10.
    * *Benefit: Elevates niche, highly personalized matches above generic blockbusters.*

### Conclusion
By abandoning RMSE for behavioral ranking metrics, utilizing Negative Sampling, and structuring the final inference engine as a Two-Stage Pipeline, this application successfully implements the exact architecture currently driving modern, tier-1 enterprise recommendation systems.