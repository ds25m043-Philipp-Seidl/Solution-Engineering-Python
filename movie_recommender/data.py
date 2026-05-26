import re

import numpy as np
import pandas as pd


def _extract_release_year(title: str) -> float:
    match = re.search(r"\((\d{4})\)\s*$", title)
    if not match:
        return pd.NA
    return int(match.group(1))


def prepare_movielens_frames(
    movies: pd.DataFrame,
    ratings: pd.DataFrame,
    tags: pd.DataFrame,
    links: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    ratings_prepared = ratings.copy()
    tags_prepared = tags.copy()

    if "datetime" not in ratings_prepared.columns:
        ratings_prepared["datetime"] = pd.to_datetime(ratings_prepared["timestamp"], unit="s")
    if "year" not in ratings_prepared.columns:
        ratings_prepared["year"] = ratings_prepared["datetime"].dt.year
    if "datetime" not in tags_prepared.columns:
        tags_prepared["datetime"] = pd.to_datetime(tags_prepared["timestamp"], unit="s")

    rating_summary = (
        ratings_prepared.groupby("movieId")["rating"]
        .agg(num_ratings="count", avg_rating="mean", median_rating="median")
        .reset_index()
    )

    rating_dates = (
        ratings_prepared.groupby("movieId")["datetime"]
        .agg(first_rating_at="min", last_rating_at="max")
        .reset_index()
    )

    tag_counts = (
        tags_prepared.assign(tag=tags_prepared["tag"].fillna("").str.strip())
        .query("tag != ''")
        .groupby("movieId")
        .agg(tag_count=("tag", "count"), unique_tag_count=("tag", "nunique"))
        .reset_index()
    )

    top_tags = (
        tags_prepared.assign(tag=tags_prepared["tag"].fillna("").str.strip())
        .query("tag != ''")
        .groupby(["movieId", "tag"])
        .size()
        .reset_index(name="uses")
        .sort_values(["movieId", "uses", "tag"], ascending=[True, False, True])
    )
    top_tags = (
        top_tags.groupby("movieId")
        .head(5)
        .groupby("movieId")
        .apply(lambda group: ", ".join(group["tag"].tolist()), include_groups=False)
        .reset_index(name="top_tags")
    )

    movie_catalog = (
        movies.copy()
        .assign(release_year=movies["title"].map(_extract_release_year))
        .merge(links, on="movieId", how="left")
        .merge(rating_summary, on="movieId", how="left")
        .merge(rating_dates, on="movieId", how="left")
        .merge(tag_counts, on="movieId", how="left")
        .merge(top_tags, on="movieId", how="left")
    )

    movie_catalog["num_ratings"] = movie_catalog["num_ratings"].fillna(0).astype(int)
    movie_catalog["tag_count"] = movie_catalog["tag_count"].fillna(0).astype(int)
    movie_catalog["unique_tag_count"] = movie_catalog["unique_tag_count"].fillna(0).astype(int)
    movie_catalog["avg_rating"] = movie_catalog["avg_rating"].round(2)
    movie_catalog["median_rating"] = movie_catalog["median_rating"].round(2)
    movie_catalog["top_tags"] = movie_catalog["top_tags"].fillna("")

    return ratings_prepared, tags_prepared, movie_catalog


def build_catalog_eda_frames(
    movie_catalog: pd.DataFrame,
    minimum_votes_quantile: float = 0.9,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    enriched_catalog = movie_catalog.copy()

    enriched_catalog["release_year"] = enriched_catalog["release_year"].astype("Int64")
    enriched_catalog["release_decade"] = (
        (enriched_catalog["release_year"] // 10) * 10
    ).astype("Int64")
    enriched_catalog["release_decade_label"] = enriched_catalog["release_decade"].map(
        lambda value: f"{int(value)}s" if pd.notna(value) else "Unknown"
    )

    genres_clean = enriched_catalog["genres"].fillna("(no genres listed)")
    genre_lists = genres_clean.str.split("|")
    enriched_catalog["primary_genre"] = genre_lists.map(
        lambda values: next(
            (genre for genre in values if genre and genre != "(no genres listed)"),
            "(no genres listed)",
        )
    )
    enriched_catalog["genre_count"] = genre_lists.map(
        lambda values: sum(genre != "(no genres listed)" for genre in values)
    )

    ratings_with_votes = enriched_catalog["num_ratings"].clip(lower=0)
    enriched_catalog["log_num_ratings"] = np.log10(ratings_with_votes.clip(lower=1))
    tag_density_base = ratings_with_votes.where(ratings_with_votes.ne(0), np.nan)
    enriched_catalog["tag_density"] = enriched_catalog["tag_count"].div(tag_density_base).fillna(0).round(3)
    enriched_catalog["rating_span_days"] = (
        enriched_catalog["last_rating_at"] - enriched_catalog["first_rating_at"]
    ).dt.days
    enriched_catalog["rating_recency_year"] = enriched_catalog["last_rating_at"].dt.year.astype("Int64")
    enriched_catalog["has_genome_signal"] = enriched_catalog["tag_count"].gt(0)
    enriched_catalog["popularity_percentile"] = ratings_with_votes.rank(method="average", pct=True)

    bins = [-0.5, 0.5, 10.5, 100.5, 1_000.5, 10_000.5, np.inf]
    labels = ["0", "1-10", "11-100", "101-1K", "1K-10K", "10K+"]
    enriched_catalog["rating_volume_bucket"] = pd.cut(
        ratings_with_votes,
        bins=bins,
        labels=labels,
        include_lowest=True,
    )

    rated_movies = enriched_catalog.loc[ratings_with_votes > 0, "avg_rating"].dropna()
    global_mean = rated_movies.mean() if not rated_movies.empty else pd.NA
    minimum_votes = ratings_with_votes.quantile(minimum_votes_quantile)
    if pd.isna(minimum_votes) or minimum_votes <= 0:
        minimum_votes = 1

    enriched_catalog["weighted_rating"] = (
        (ratings_with_votes / (ratings_with_votes + minimum_votes)) * enriched_catalog["avg_rating"]
        + (minimum_votes / (ratings_with_votes + minimum_votes)) * global_mean
    ).round(3)

    genre_catalog = (
        enriched_catalog.assign(genre=genre_lists)
        .explode("genre")
        .loc[lambda frame: frame["genre"].ne("(no genres listed)")]
        .reset_index(drop=True)
    )

    return enriched_catalog, genre_catalog


def build_user_eda_frames(
    movies: pd.DataFrame,
    ratings: pd.DataFrame,
    tags: pd.DataFrame,
    positive_threshold: float = 4.0,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    ratings_prepared = ratings.copy()
    tags_prepared = tags.copy()

    if "datetime" not in ratings_prepared.columns:
        ratings_prepared["datetime"] = pd.to_datetime(ratings_prepared["timestamp"], unit="s")
    if "year" not in ratings_prepared.columns:
        ratings_prepared["year"] = ratings_prepared["datetime"].dt.year
    if "datetime" not in tags_prepared.columns:
        tags_prepared["datetime"] = pd.to_datetime(tags_prepared["timestamp"], unit="s")

    movie_genres = movies.copy()
    movie_genres["genres"] = movie_genres["genres"].fillna("(no genres listed)")
    movie_genres["primary_genre"] = movie_genres["genres"].str.split("|").map(
        lambda values: next(
            (genre for genre in values if genre and genre != "(no genres listed)"),
            "(no genres listed)",
        )
    )

    user_catalog = (
        ratings_prepared.groupby("userId")
        .agg(
            num_ratings=("movieId", "size"),
            avg_rating_given=("rating", "mean"),
            rating_std=("rating", "std"),
            first_rating_at=("datetime", "min"),
            last_rating_at=("datetime", "max"),
            active_years=("year", "nunique"),
        )
        .reset_index()
    )

    positive_counts = (
        ratings_prepared.assign(is_positive=ratings_prepared["rating"].ge(positive_threshold))
        .groupby("userId")
        .agg(positive_ratings=("is_positive", "sum"))
        .reset_index()
    )

    tag_summary = (
        tags_prepared.assign(tag=tags_prepared["tag"].fillna("").str.strip())
        .query("tag != ''")
        .groupby("userId")
        .agg(tag_count=("tag", "size"), unique_tags=("tag", "nunique"))
        .reset_index()
    )

    ratings_with_genres = ratings_prepared.merge(
        movie_genres[["movieId", "title", "genres", "primary_genre"]],
        on="movieId",
        how="left",
    )
    user_genres = (
        ratings_with_genres.assign(genre=ratings_with_genres["genres"].fillna("(no genres listed)").str.split("|"))
        .explode("genre")
        .loc[lambda frame: frame["genre"].ne("(no genres listed)")]
        .reset_index(drop=True)
    )

    favorite_genres = (
        user_genres.groupby(["userId", "genre"])
        .agg(ratings_in_genre=("movieId", "size"), avg_genre_rating=("rating", "mean"))
        .reset_index()
        .sort_values(["userId", "ratings_in_genre", "avg_genre_rating", "genre"], ascending=[True, False, False, True])
    )
    top_genres = (
        favorite_genres.groupby("userId")
        .head(3)
        .groupby("userId")
        .apply(lambda group: ", ".join(group["genre"].tolist()), include_groups=False)
        .reset_index(name="top_genres")
    )
    primary_favorite = favorite_genres.drop_duplicates("userId").loc[:, ["userId", "genre"]].rename(columns={"genre": "favorite_genre"})
    genre_breadth = user_genres.groupby("userId").agg(genre_breadth=("genre", "nunique")).reset_index()

    user_catalog = (
        user_catalog.merge(positive_counts, on="userId", how="left")
        .merge(tag_summary, on="userId", how="left")
        .merge(primary_favorite, on="userId", how="left")
        .merge(top_genres, on="userId", how="left")
        .merge(genre_breadth, on="userId", how="left")
    )

    user_catalog["positive_ratings"] = user_catalog["positive_ratings"].fillna(0).astype(int)
    user_catalog["positive_share"] = (
        user_catalog["positive_ratings"].div(user_catalog["num_ratings"].replace(0, np.nan)).fillna(0).round(3)
    )
    user_catalog["tag_count"] = user_catalog["tag_count"].fillna(0).astype(int)
    user_catalog["unique_tags"] = user_catalog["unique_tags"].fillna(0).astype(int)
    user_catalog["genre_breadth"] = user_catalog["genre_breadth"].fillna(0).astype(int)
    user_catalog["rating_std"] = user_catalog["rating_std"].fillna(0).round(3)
    user_catalog["avg_rating_given"] = user_catalog["avg_rating_given"].round(3)
    user_catalog["favorite_genre"] = user_catalog["favorite_genre"].fillna("Unknown")
    user_catalog["top_genres"] = user_catalog["top_genres"].fillna("")
    user_catalog["rating_span_days"] = (user_catalog["last_rating_at"] - user_catalog["first_rating_at"]).dt.days
    user_catalog["ratings_per_active_year"] = (
        user_catalog["num_ratings"].div(user_catalog["active_years"].replace(0, np.nan)).fillna(0).round(2)
    )

    return user_catalog.sort_values("num_ratings", ascending=False).reset_index(drop=True), favorite_genres.reset_index(drop=True)


def build_user_report(
    user_id: int,
    movies: pd.DataFrame,
    ratings: pd.DataFrame,
    tags: pd.DataFrame,
    positive_threshold: float = 4.0,
    user_catalog: pd.DataFrame | None = None,
    favorite_genres: pd.DataFrame | None = None,
) -> dict[str, pd.DataFrame]:
    if user_catalog is None or favorite_genres is None:
        user_catalog, favorite_genres = build_user_eda_frames(
            movies,
            ratings,
            tags,
            positive_threshold=positive_threshold,
        )

    ratings_prepared = ratings.copy()
    tags_prepared = tags.copy()
    if "datetime" not in ratings_prepared.columns:
        ratings_prepared["datetime"] = pd.to_datetime(ratings_prepared["timestamp"], unit="s")
    if "datetime" not in tags_prepared.columns:
        tags_prepared["datetime"] = pd.to_datetime(tags_prepared["timestamp"], unit="s")

    if user_id not in set(user_catalog["userId"]):
        raise KeyError(f"No user matched userId: {user_id}")

    user_row = user_catalog.loc[user_catalog["userId"] == user_id].reset_index(drop=True)
    user_ratings = ratings_prepared.loc[ratings_prepared["userId"] == user_id].merge(
        movies[["movieId", "title", "genres"]],
        on="movieId",
        how="left",
    )

    top_rated_movies = (
        user_ratings.sort_values(["rating", "datetime", "title"], ascending=[False, False, True])
        .loc[:, ["movieId", "title", "genres", "rating", "datetime"]]
        .head(15)
        .reset_index(drop=True)
    )
    recent_ratings = (
        user_ratings.sort_values("datetime", ascending=False)
        .loc[:, ["movieId", "title", "genres", "rating", "datetime"]]
        .head(15)
        .reset_index(drop=True)
    )

    user_tags = (
        tags_prepared.loc[tags_prepared["userId"] == user_id, ["movieId", "tag", "datetime"]]
        .assign(tag=lambda frame: frame["tag"].fillna("").str.strip())
        .query("tag != ''")
        .merge(movies[["movieId", "title"]], on="movieId", how="left")
    )
    top_tags = (
        user_tags.groupby("tag")
        .size()
        .reset_index(name="uses")
        .sort_values(["uses", "tag"], ascending=[False, True])
        .head(15)
        .reset_index(drop=True)
    )

    genre_profile = (
        favorite_genres.loc[favorite_genres["userId"] == user_id, ["genre", "ratings_in_genre", "avg_genre_rating"]]
        .head(15)
        .reset_index(drop=True)
    )

    return {
        "user": user_row,
        "top_rated_movies": top_rated_movies,
        "recent_ratings": recent_ratings,
        "top_tags": top_tags,
        "genre_profile": genre_profile,
    }


def search_movies(movie_catalog: pd.DataFrame, query: str, limit: int = 10) -> pd.DataFrame:
    normalized_query = query.strip().lower()
    if not normalized_query:
        return movie_catalog.head(0)

    matches = movie_catalog.loc[
        movie_catalog["title"].str.lower().str.contains(normalized_query, na=False, regex=False)
    ].copy()
    if matches.empty:
        return matches

    matches["match_rank"] = matches["title"].str.lower().map(
        lambda title: (
            0 if title == normalized_query else 1 if title.startswith(normalized_query) else 2
        )
    )
    columns = [
        "movieId",
        "title",
        "release_year",
        "genres",
        "avg_rating",
        "num_ratings",
        "tag_count",
        "top_tags",
    ]
    return (
        matches.sort_values(["match_rank", "num_ratings", "avg_rating"], ascending=[True, False, False])
        .loc[:, columns]
        .head(limit)
        .reset_index(drop=True)
    )


def build_movie_report(
    movie_query: str,
    movie_catalog: pd.DataFrame,
    ratings: pd.DataFrame,
    tags: pd.DataFrame,
    genome_scores: pd.DataFrame | None = None,
    genome_tags: pd.DataFrame | None = None,
) -> dict[str, pd.DataFrame]:
    ratings_prepared = ratings.copy()
    tags_prepared = tags.copy()

    if "datetime" not in ratings_prepared.columns:
        ratings_prepared["datetime"] = pd.to_datetime(ratings_prepared["timestamp"], unit="s")
    if "datetime" not in tags_prepared.columns:
        tags_prepared["datetime"] = pd.to_datetime(tags_prepared["timestamp"], unit="s")

    matches = search_movies(movie_catalog, movie_query, limit=1)
    if matches.empty:
        raise KeyError(f"No movie matched query: {movie_query}")

    movie_id = int(matches.iloc[0]["movieId"])
    movie_row = movie_catalog.loc[movie_catalog["movieId"] == movie_id].copy()

    movie_ratings = ratings_prepared.loc[
        ratings_prepared["movieId"] == movie_id, ["userId", "rating", "datetime"]
    ].copy()
    rating_distribution = (
        movie_ratings.groupby("rating")
        .size()
        .reset_index(name="count")
        .sort_values("rating")
    )

    recent_ratings = movie_ratings.sort_values("datetime", ascending=False).head(10).reset_index(drop=True)

    movie_tags = (
        tags_prepared.loc[tags_prepared["movieId"] == movie_id, ["userId", "tag", "datetime"]]
        .assign(tag=lambda frame: frame["tag"].fillna("").str.strip())
        .query("tag != ''")
    )
    top_user_tags = (
        movie_tags.groupby("tag")
        .size()
        .reset_index(name="uses")
        .sort_values(["uses", "tag"], ascending=[False, True])
        .head(15)
        .reset_index(drop=True)
    )

    report: dict[str, pd.DataFrame] = {
        "movie": movie_row.reset_index(drop=True),
        "rating_distribution": rating_distribution.reset_index(drop=True),
        "recent_ratings": recent_ratings,
        "top_user_tags": top_user_tags,
    }

    if genome_scores is not None and genome_tags is not None:
        top_genome_tags = (
            genome_scores.loc[genome_scores["movieId"] == movie_id]
            .merge(genome_tags, on="tagId", how="left")
            .sort_values("relevance", ascending=False)
            .loc[:, ["tag", "relevance"]]
            .head(15)
            .reset_index(drop=True)
        )
        report["top_genome_tags"] = top_genome_tags

    return report