import sys
from pathlib import Path

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

PROJECT_ROOT = Path(__file__).resolve().parents[1]
# Keep local package imports working when the app is launched from explorer/.
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import streamlit as st

from movie_recommender import (
    build_catalog_eda_frames,
    build_movie_report,
    build_user_eda_frames,
    build_user_report,
    prepare_movielens_frames,
    search_movies,
)

DATA_DIR = PROJECT_ROOT / "movies-database"
PLOTLY_TEMPLATE = "plotly_white"
PLOT_COLORS = {
    "blue": "#3B82F6",
    "coral": "#F97316",
    "green": "#10B981",
}

st.set_page_config(page_title="Movie Explorer", layout="wide")


@st.cache_data(show_spinner=False)
def load_frames() -> dict[str, pd.DataFrame]:
    movies = pd.read_csv(DATA_DIR / "movies.csv")
    ratings = pd.read_csv(DATA_DIR / "ratings.csv")
    tags = pd.read_csv(DATA_DIR / "tags.csv")
    links = pd.read_csv(DATA_DIR / "links.csv")
    genome_scores = pd.read_csv(DATA_DIR / "genome-scores.csv")
    genome_tags = pd.read_csv(DATA_DIR / "genome-tags.csv")

    ratings_prepared, tags_prepared, movie_catalog = prepare_movielens_frames(
        movies,
        ratings,
        tags,
        links,
    )
    movie_catalog_eda, genre_catalog = build_catalog_eda_frames(movie_catalog)
    user_catalog, user_favorite_genres = build_user_eda_frames(movies, ratings_prepared, tags_prepared)

    return {
        "movies": movies,
        "ratings": ratings_prepared,
        "tags": tags_prepared,
        "links": links,
        "genome_scores": genome_scores,
        "genome_tags": genome_tags,
        "movie_catalog": movie_catalog,
        "movie_catalog_eda": movie_catalog_eda,
        "genre_catalog": genre_catalog,
        "user_catalog": user_catalog,
        "user_favorite_genres": user_favorite_genres,
    }


frames = load_frames()
movies = frames["movies"]
movie_catalog = frames["movie_catalog"]
movie_catalog_eda = frames["movie_catalog_eda"]
ratings = frames["ratings"]
tags = frames["tags"]
genome_scores = frames["genome_scores"]
genome_tags = frames["genome_tags"]
user_catalog = frames["user_catalog"]
user_favorite_genres = frames["user_favorite_genres"]

st.title("Movie Database Explorer")
st.caption("A lightweight Streamlit explorer for the same features used in the notebook.")
movie_tab, user_tab = st.tabs(["Movies", "Users"])

with movie_tab:
    with st.sidebar:
        st.header("Movie Filters")
        query = st.text_input(
            "Title search (optional)",
            value="",
            placeholder="Toy Story",
        )
        st.caption("Leave title search empty to browse the full filtered catalog.")

        available_genres = sorted(
            genre
            for genre in movie_catalog_eda["primary_genre"].dropna().unique()
            if genre != "(no genres listed)"
        )
        selected_genres = st.multiselect("Primary genres", available_genres)

        decade_values = sorted(movie_catalog_eda["release_decade"].dropna().astype(int).unique().tolist())
        default_decades = (decade_values[0], decade_values[-1]) if decade_values else (1950, 2020)
        selected_decades = st.slider(
            "Release decade range",
            min_value=default_decades[0],
            max_value=default_decades[1],
            value=default_decades,
            step=10,
        )

        min_ratings = st.slider(
            "Minimum number of ratings",
            min_value=0,
            max_value=int(movie_catalog_eda["num_ratings"].max()),
            value=100,
        )
        sort_metric = st.selectbox(
            "Rank results by",
            ["weighted_rating", "avg_rating", "num_ratings"],
            index=0,
        )
        browse_limit = st.slider(
            "Movies shown in browser",
            min_value=25,
            max_value=250,
            value=100,
            step=25,
        )

    filtered_catalog = movie_catalog_eda[movie_catalog_eda["num_ratings"].ge(min_ratings)].copy()
    filtered_catalog = filtered_catalog[
        filtered_catalog["release_decade"].fillna(selected_decades[0]).between(
            selected_decades[0], selected_decades[1]
        )
    ]

    if query.strip():
        search_matches = search_movies(movie_catalog, query, limit=250)["movieId"]
        filtered_catalog = filtered_catalog[filtered_catalog["movieId"].isin(search_matches)]

    if selected_genres:
        filtered_catalog = filtered_catalog[filtered_catalog["primary_genre"].isin(selected_genres)]

    filtered_catalog = filtered_catalog.sort_values([sort_metric, "num_ratings"], ascending=[False, False])
    browser_catalog = filtered_catalog.head(browse_limit).copy()

    metric_col1, metric_col2, metric_col3 = st.columns(3)
    metric_col1.metric("Movies in view", f"{len(filtered_catalog):,}")
    metric_col2.metric("Median weighted rating", f"{filtered_catalog['weighted_rating'].median():.2f}")
    metric_col3.metric("Median ratings per movie", f"{filtered_catalog['num_ratings'].median():.0f}")

    chart_col, table_col = st.columns((3, 2))

    with chart_col:
        scatter_view = filtered_catalog[
            filtered_catalog["num_ratings"].gt(0) & filtered_catalog["avg_rating"].notna()
        ].copy()
        scatter = px.scatter(
            scatter_view,
            x="num_ratings",
            y="avg_rating",
            size="tag_count",
            color="primary_genre",
            hover_name="title",
            hover_data={
                "weighted_rating": ":.3f",
                "release_year": True,
                "num_ratings": ":,",
                "tag_count": ":,",
            },
            template=PLOTLY_TEMPLATE,
            title="Ratings vs Popularity",
            labels={
                "num_ratings": "Number of ratings",
                "avg_rating": "Average rating",
                "tag_count": "User tag count",
            },
            opacity=0.7,
        )
        scatter.update_xaxes(type="log")
        scatter.update_layout(height=520)
        st.plotly_chart(scatter, width="stretch")

    with table_col:
        st.subheader("Top movies in current slice")
        st.dataframe(
            browser_catalog[
                [
                    "title",
                    "primary_genre",
                    "release_year",
                    "avg_rating",
                    "weighted_rating",
                    "num_ratings",
                    "tag_count",
                ]
            ].head(50),
            width="stretch",
            hide_index=True,
        )

    st.subheader("Movie detail")
    st.caption("Browse directly from the ranked list below. Title search is only one way to narrow the catalog.")

    if browser_catalog.empty:
        st.warning("No movies match the current filters. Adjust the search or broaden the filters.")
    else:
        selected_title = st.selectbox(
            "Inspect a movie from the current filtered slice",
            browser_catalog["title"].tolist(),
        )

        movie_report = build_movie_report(
            selected_title,
            movie_catalog,
            ratings,
            tags,
            genome_scores,
            genome_tags,
        )

        info_col, dist_col = st.columns((2, 3))
        with info_col:
            st.dataframe(movie_report["movie"], width="stretch", hide_index=True)
            st.dataframe(movie_report["top_user_tags"], width="stretch", hide_index=True)

        with dist_col:
            rating_distribution = movie_report["rating_distribution"]
            dist_chart = px.bar(
                rating_distribution,
                x="rating",
                y="count",
                template=PLOTLY_TEMPLATE,
                title="Rating distribution",
                color_discrete_sequence=[PLOT_COLORS["blue"]],
            )
            dist_chart.update_layout(showlegend=False, height=320)
            st.plotly_chart(dist_chart, width="stretch")

            if "top_genome_tags" in movie_report and not movie_report["top_genome_tags"].empty:
                fingerprint = movie_report["top_genome_tags"].head(8).sort_values("relevance")
                polar_chart = go.Figure()
                polar_chart.add_trace(
                    go.Scatterpolar(
                        r=fingerprint["relevance"],
                        theta=fingerprint["tag"],
                        fill="toself",
                        line={"color": PLOT_COLORS["green"], "width": 3},
                        marker={"size": 8, "color": PLOT_COLORS["green"]},
                    )
                )
                polar_chart.update_layout(
                    template=PLOTLY_TEMPLATE,
                    title=f"Genome fingerprint: {selected_title}",
                    polar={"radialaxis": {"visible": True, "range": [0, 1]}},
                    height=420,
                )
                st.plotly_chart(polar_chart, width="stretch")

        st.subheader("Recent ratings")
        st.dataframe(movie_report["recent_ratings"], width="stretch", hide_index=True)

with user_tab:
    st.subheader("User Explorer")
    st.caption("Inspect how active users are, how they rate, and which movies or genres define their profile.")

    user_filter_col1, user_filter_col2, user_filter_col3 = st.columns(3)
    with user_filter_col1:
        min_user_ratings = st.slider(
            "Minimum ratings by user",
            min_value=1,
            max_value=int(user_catalog["num_ratings"].max()),
            value=20,
        )
    with user_filter_col2:
        favorite_genre_options = sorted(
            genre for genre in user_catalog["favorite_genre"].dropna().unique() if genre != "Unknown"
        )
        selected_favorite_genres = st.multiselect("Favorite genres", favorite_genre_options)
    with user_filter_col3:
        user_sort_metric = st.selectbox(
            "Rank users by",
            ["num_ratings", "positive_share", "avg_rating_given", "genre_breadth"],
            index=0,
        )

    filtered_users = user_catalog[user_catalog["num_ratings"].ge(min_user_ratings)].copy()
    if selected_favorite_genres:
        filtered_users = filtered_users[filtered_users["favorite_genre"].isin(selected_favorite_genres)]
    filtered_users = filtered_users.sort_values([user_sort_metric, "num_ratings"], ascending=[False, False])

    user_metric_col1, user_metric_col2, user_metric_col3 = st.columns(3)
    user_metric_col1.metric("Users in view", f"{len(filtered_users):,}")
    user_metric_col2.metric("Median ratings per user", f"{filtered_users['num_ratings'].median():.0f}")
    user_metric_col3.metric("Median positive share", f"{filtered_users['positive_share'].median():.1%}")

    user_chart_col, user_table_col = st.columns((3, 2))
    with user_chart_col:
        active_users = filtered_users[filtered_users["num_ratings"].ge(20)].copy()
        user_scatter = px.scatter(
            active_users,
            x="num_ratings",
            y="avg_rating_given",
            size="genre_breadth",
            color="positive_share",
            hover_name=active_users["userId"].astype(str),
            hover_data={
                "favorite_genre": True,
                "top_genres": True,
                "ratings_per_active_year": ":.1f",
                "tag_count": ":,",
            },
            color_continuous_scale="Tealgrn",
            template=PLOTLY_TEMPLATE,
            title="User Activity vs Rating Style",
            labels={
                "num_ratings": "Number of ratings",
                "avg_rating_given": "Average rating given",
                "genre_breadth": "Genre breadth",
                "positive_share": "Positive share",
            },
        )
        user_scatter.update_xaxes(type="log")
        user_scatter.update_layout(height=520)
        st.plotly_chart(user_scatter, width="stretch")

    with user_table_col:
        st.subheader("Users in current slice")
        st.dataframe(
            filtered_users[
                [
                    "userId",
                    "num_ratings",
                    "avg_rating_given",
                    "positive_share",
                    "favorite_genre",
                    "top_genres",
                ]
            ].head(50),
            width="stretch",
            hide_index=True,
        )

    if filtered_users.empty:
        st.warning("No users match the current filters. Lower the thresholds or broaden the genre filters.")
    else:
        selected_user_id = int(
            st.selectbox(
                "Inspect a user from the current filtered slice",
                filtered_users["userId"].head(250).tolist(),
            )
        )
        user_report = build_user_report(
            selected_user_id,
            movies,
            ratings,
            tags,
            user_catalog=user_catalog,
            favorite_genres=user_favorite_genres,
        )

        user_info_col, user_profile_col = st.columns((2, 3))
        with user_info_col:
            st.dataframe(user_report["user"], width="stretch", hide_index=True)
            st.dataframe(user_report["top_tags"], width="stretch", hide_index=True)

        with user_profile_col:
            genre_profile_chart = px.bar(
                user_report["genre_profile"].head(10).sort_values("ratings_in_genre"),
                x="ratings_in_genre",
                y="genre",
                orientation="h",
                template=PLOTLY_TEMPLATE,
                title="Genre profile",
                color_discrete_sequence=[PLOT_COLORS["coral"]],
                hover_data={"avg_genre_rating": ":.2f"},
            )
            genre_profile_chart.update_layout(showlegend=False, height=320)
            st.plotly_chart(genre_profile_chart, width="stretch")

            top_rated_chart = px.bar(
                user_report["top_rated_movies"].head(10).sort_values(["rating", "title"]),
                x="rating",
                y="title",
                orientation="h",
                template=PLOTLY_TEMPLATE,
                title="Top rated movies",
                color_discrete_sequence=[PLOT_COLORS["blue"]],
            )
            top_rated_chart.update_layout(showlegend=False, height=360)
            st.plotly_chart(top_rated_chart, width="stretch")

        recent_col, favorite_col = st.columns(2)
        with recent_col:
            st.subheader("Recent ratings")
            st.dataframe(user_report["recent_ratings"], width="stretch", hide_index=True)
        with favorite_col:
            st.subheader("Top rated movies")
            st.dataframe(user_report["top_rated_movies"], width="stretch", hide_index=True)
