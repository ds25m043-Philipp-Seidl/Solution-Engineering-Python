# Comprehensive Architecture Log: Multi-Objective Deep Ranking & Hybrid SVD Engine

## Executive Summary
This document registers the complete structural design, hyperparameters, data-split boundaries, optimization pipelines, and production serving configurations for a movie recommendation engine built on the MovieLens 25M dataset.

The architecture moves away from legacy rating-prediction models (e.g., Funk SVD optimizing for Root Mean Squared Error) to deploy a live side-by-side **Recommendation Showdown**. This engine pits a normalized **Unchained Hybrid SVD Matrix** against a deep **Multi-Objective Neural Collaborative Filtering (NeuralCF) Genome-Matchmaker**.

---

## 1. Data Pipeline, Splitting, & Preprocessing

### Leave-One-Out Temporal Train-Test Split[cite: 7]
To evaluate ranking performance without data leakage, we implemented a precise chronological split:
* **Interaction Sorting**: Interaction histories are grouped by individual users and explicitly sorted by their unix timestamps (`timestamp`)[cite: 7].
* **Thresholding Satisfaction**: Ratings are split on a hard satisfaction boundary[cite: 7]:
   * **Positives ("Likes")**: Ratings $\ge 3.5$ are mapped to a target value of `1.0`[cite: 7].
   * **Hard Negatives ("Dislikes")**: Observed interactions with a rating $< 3.5$ are retained and mapped to a target of `0.0`[cite: 7]. This forces the network to learn explicit boundaries for watched but rejected media rather than relying solely on unseen items[cite: 7].
* **The Test Target**: The absolute last (most recent) positive interaction for each user is extracted to form the positive evaluation set (`df_test_pos`)[cite: 7].
* **The Training Target**: All preceding positive interactions are assigned to the training loop (`df_train_pos`)[cite: 7].

### Dynamic Popularity Frequency Weighting[cite: 7]
To counter the global system bias toward blockbusters, inverse-frequency sample weighting is injected during model ingestion[cite: 7]:
* **Formula**: For every item $m$, its raw count $C_m$ in the positive training set is computed[cite: 7]. The raw sample weight $W_m$ is derived as:
  $$W_m = \frac{1}{\sqrt{C_m}}$$
* **Normalization**: Raw weights are normalized by dividing by the mean of all weights, creating a relative scaling vector mapped directly to the items via a lookup dictionary[cite: 7].
* **Application**: This mapping is appended to both positive interactions and explicit hard negatives, ensuring popular items carry less gradient weight per interaction during structural optimization[cite: 7].

---

## 2. Model 1: Unchained Hybrid Singular Value Decomposition (SVD)

### Architectural Stacking & Enrichment[cite: 7]
The SVD baseline uses a dual-source item-enrichment framework[cite: 7]:
* **The Interaction Matrix ($R$)**: A sparse compressed sparse row (`csr_matrix`) representation where indices match the integer-encoded user and movie spaces[cite: 7]. Cells are populated with unweighted binary indicator values (`np.ones`) to maximize the model's structural awareness of item popularity during testing[cite: 7].
* **The Genome Matrix Addition**: A matrix of shape $13,816 \times 1,128$ representing pivoted, `float32` genome relevance scores[cite: 7].
* **The Hybrid Stack**: To enforce strong semantic constraints, the item-tag relevance matrix is scaled by a factor of $\beta$ and vertically concatenated directly underneath the sparse interaction matrix $R$[cite: 7]:
  $$R_{\text{augmented}} = \begin{bmatrix} R \\ \beta \cdot \text{Genome}^T \end{bmatrix}$$

### Hyperparameters & Grid Search Results[cite: 7]
* **Latent Dimensions ($K_{grid}$)**: Evaluated at $[128, 256]$[cite: 7].
* **Genome Weight ($\beta_{grid}$)**: Evaluated at $[0.1, 0.5]$[cite: 7].
* **Optimal Selection**: $k=128, \beta=0.5$, yielding a hard **HitRate@10 of 50.52%**[cite: 12]. Setting $k=256$ resulted in severe overfitting, dropping ranking accuracy to ~43.7%[cite: 7].

### Production Optimization: L2 Cosine Normalization[cite: 2]
During item vector extraction, raw latent item matrices ($V^T$) suffer from vector length inflation; heavily interacted items expand in magnitude, drowning out niche options during dot-product user averaging[cite: 2].
* **The Fix**: Live inference runs on a fully L2-normalized item space[cite: 2].
* **Implementation**:
  $$\text{norms} = \max(\parallel V^T \parallel_2, \, 10^{-9})$$
  $$V^T_{\text{normalized}} = \frac{V^T}{\text{norms}}$$

---

## 3. Model 2: Deep Multi-Objective NeuralCF

### Complete Layer Specification[cite: 7, 13]
The deep network uses a split-embedding track designed to handle collaborative signals alongside rich tag metadata[cite: 7]:
* **Generalized Matrix Factorization (GMF) Track**:
   * `u_gmf`: User embedding layer mapping $162,541 \rightarrow 128$ latent factors[cite: 7].
   * `m_gmf`: Movie embedding layer mapping $59,047 \rightarrow 128$ latent factors[cite: 7].
* **Multi-Layer Perceptron (MLP) Track**:
   * `u_mlp`: User embedding layer mapping $162,541 \rightarrow 128$ latent factors[cite: 7].
   * `m_mlp`: Movie embedding layer mapping $59,047 \rightarrow 128$ latent factors[cite: 7].
* **Explicit Bias Tracking**:
   * `u_bias`: Base user bias embedding mapping $162,541 \rightarrow 1$[cite: 7].
   * `m_bias`: Base movie bias embedding mapping $59,047 \rightarrow 1$[cite: 7].
* **Metadata Projection Layers**:
   * `genre_proj`: Linear layer projecting the 19-dimension one-hot genre vector directly to the 128 dense factor space without bias (`bias=False`)[cite: 7].
   * `genome_proj`: Linear layer projecting the 1,128 wide continuous genome relevance vector to the 128 factor space without bias (`bias=False`)[cite: 7].
* **Deep Neural Blocks (`self.mlp`)**:
   * **Input Layer Concatenation**: Consumes user MLP, movie MLP, genre indicators, and raw genome scores[cite: 7]. Total input width calculation: $128 \text{ (user)} + 128 \text{ (movie)} + 19 \text{ (genres)} + 1128 \text{ (genome)} = 1403$ units[cite: 2, 7].
   * **Dense Sequential Chain**[cite: 7]:
      * `Linear(1403, 256)` $\rightarrow$ `ReLU()` $\rightarrow$ `Dropout(p=0.2)`
      * `Linear(256, 128)` $\rightarrow$ `ReLU()` $\rightarrow$ `Dropout(p=0.2)`
      * `Linear(128, 64)` $\rightarrow$ `ReLU()`
* **The Fusion Output Layer**:
   * Consumes the combined element-wise GMF output and the final layer of the MLP block[cite: 7].
   * Total incoming width: $128 \text{ (GMF Factors)} + 64 \text{ (MLP Out)} = 192$ units[cite: 2, 7].
   * `Linear(192, 1)` to generate raw user preference logits[cite: 2, 7].

### Training Mechanics & Custom GPU Batching[cite: 7]
* **Negative Sampling Ratio**: Set to an aggressive **1:7 ratio** (1 positive target vs 7 unobserved negatives generated dynamically every epoch per user interaction)[cite: 7].
* **The "Hard Decoy" Pool**: To prevent the model from easily distinguishing positives from highly obscure films, negative sampling draws **80% of its targets directly from the Top 2000 globally popular movies**, forcing the network to optimize for fine-grained differences within popular titles[cite: 7].
* **Loss Function**: Optimized using Bayesian Personalized Ranking (**BPR Loss**), minimizing the relative log-sigmoid distance between positive target logits and hard negative decoy logits[cite: 7]:
  $$\mathcal{L}_{\text{BPR}} = -\frac{1}{N}\sum \log(\sigma(\text{logits}_{\text{pos}} - \text{logits}_{\text{neg}}))$$
* **Optimization Parameters**: Adam Optimizer[cite: 7] with an initial learning rate of `0.003`[cite: 7], decayed smoothly using a step scheduler (`StepLR`) dropping by $\gamma = 0.5$ every 6 epochs[cite: 7].
* **Mixed-Precision Training**: Leveraged `torch.amp.autocast('cuda')` combined with a floating-point `GradScaler` to scale gradients dynamically and prevent underflow errors during 16-bit precision training runs[cite: 7].

---

## 4. Live Production Inference Logic

When serving requests via FastAPI, the raw feed-forward step (`forward()`) is bypassed[cite: 13]. Scoring the complete catalog sequentially through the deep MLP block is too computationally intensive for a sub-50ms service SLA. Instead, the runtime relies on an optimized vector-algebra representation[cite: 13]:

### The Multi-Objective Fusion Equation[cite: 13]
The final ranking value for every movie index $i$ is calculated using a three-objective algebraic equation:
$$\text{Score}_i = (0.6 \cdot \text{GenomeSim}_i) + (0.4 \cdot \text{QualityScore}_i) - (0.3 \cdot \text{PopularityPenalty}_i)$$

### Component-by-Component Execution[cite: 13]

#### 1. Genome Similarity Calculation ($\text{GenomeSim}_i$)[cite: 13]
* **User Aesthetic Profile**: When user profile IDs are received, their genome matrices are looked up and collapsed into a centralized target user profile via dimensional averaging[cite: 13]:
  $$\bar{G}_{\text{user}} = \frac{1}{|M_{\text{liked}}|} \sum_{m \in M_{\text{liked}}} \text{GenomeMatrix}[m]$$
* **Latent Mapping**: This profile vector is projected into the 128-dimensional latent space using the model's learned weights[cite: 13]:
  $$\vec{P}_{\text{user}} = \text{model.genome\_proj}(\bar{G}_{\text{user}})$$
* **Global Dot Product**: A single BLAS gemm matrix multiplication compares this user vector across all mapped item projections[cite: 13]:
  $$\text{GenomeSim} = \vec{P}_{\text{user}} \cdot (\text{model.genome\_proj}(\text{GlobalGenomeTensor}))^T$$

#### 2. Quality Estimation ($\text{QualityScore}_i$)[cite: 13]
* **Learned Inherent Quality**: Extracts the movie embedding weight biases directly from the PyTorch model parameter dictionary (`model.m_bias.weight`)[cite: 13].
* **Explicit Signal Extraction**: Average community ratings are pulled from startup lookups, mapping missing catalogs safely to a default floor value of 3.0 stars[cite: 13].
* **Min-Max Normalization Scaling**: Star metrics are normalized to fit a uniform 0-1 scale, ensuring ratings do not mathematically overpower latent dot products[cite: 13]:
  $$\text{NormRatings}_i = \frac{\text{Rating}_i - 0.5}{4.5}$$
* **Combination**:
  $$\text{QualityScore}_i = \text{LearnedBias}_i + (0.4 \cdot \text{NormRatings}_i)$$

#### 3. Logarithmic Discovery Bias Correction ($\text{PopularityPenalty}_i$)[cite: 13]
* **Log-Scaling**: Global counts are extracted from historical positive transaction arrays[cite: 13]. To dampen the exponential curve between standard blockbusters and cult films, the values are scaled logarithmically[cite: 13]:
  $$\text{LogPop}_i = \ln(\text{Count}_i + 1)$$
* **Application**: Scaled by a multiplier of `0.3` and subtracted from the score to penalize over-exposed mainstream titles, boosting long-tail discovery[cite: 13].

---

## 5. Summary Matrix of Engine Settings

| Architectural Component | Hyperparameter / Setting Value | Engineering Purpose |
| :--- | :--- | :--- |
| **Latent Embedding Dimensions (`n_factors`)** | `128`[cite: 13] | Capacity threshold for storing item interactions and text concepts[cite: 7]. |
| **Total MLP Input Width** | `1403`[cite: 2, 7] | Complete vector concatenation boundary for user, movie, genres, and text tags[cite: 7]. |
| **Negative Sampling Ratio & Type** | `1:7` with `80% Hard Decoys`[cite: 7] | Sharpens item classification boundaries among globally competitive titles[cite: 7]. |
| **Loss Formulation** | `BPR Loss` (Bayesian Personalized Ranking)[cite: 7] | Optimizes relative pairwise listing order over raw click probability[cite: 7]. |
| **SVD Normalization Method** | `L2 Norm Cosine Scaling`[cite: 2] | Stabilizes vector magnitudes to prevent blockbusters from skewing similarity scores. |
| **Live Scoring Weights** | `0.6 Genome` / `0.4 Quality`[cite: 13] | Balances precise visual/thematic alignment with collective crowd wisdom[cite: 13]. |
| **Mainstream Penalty Coefficient** | `-0.3 * ln(Count + 1)`[cite: 13] | Suppresses over-represented titles to expose high-quality niche films[cite: 13]. |