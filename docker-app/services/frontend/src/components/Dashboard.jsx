import React, { useState, useEffect } from 'react';

export default function Dashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(false);

  const [selectedMovie, setSelectedMovie] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [recLoading, setRecLoading] = useState(false);

  // Fetch initial movies or search results
  useEffect(() => {
    const fetchMovies = async () => {
      setLoading(true);
      try {
        const res = await fetch(`http://localhost:3000/api/search?q=${searchQuery}`);
        const data = await res.json();
        if (data.success) setMovies(data.movies);
      } catch (err) {
        console.error("Search failed", err);
      } finally {
        setLoading(false);
      }
    };

    // Add a slight delay (debounce) so it doesn't spam the backend on every keystroke
    const delayDebounceFn = setTimeout(() => { fetchMovies(); }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  // Get recommendations for a single clicked movie
  const handleMovieClick = async (movie) => {
    setSelectedMovie(movie);
    setRecLoading(true);
    setRecommendations([]);

    try {
      const response = await fetch('http://localhost:3000/api/get-movies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // We pass the single selected movie as an array to reuse the ML endpoint!
        body: JSON.stringify({ movie_ids: [movie.movieId || movie.movie_id || movie.id] })
      });

      const data = await response.json();
      if (data.success) {
        // FIX: The backend now returns 'svd_recommendations', not 'recommendations'!
        setRecommendations(data.svd_recommendations);
      }
    } catch (error) {
      console.error("Rec error", error);
    } finally {
      setRecLoading(false);
    }
  };

  return (
    <div className="dashboard-container" style={{ display: 'flex', gap: '20px', maxWidth: '1400px', margin: '0 auto' }}>

      {/* LEFT COLUMN: Search & Catalog */}
      <div className="glass-panel catalog-section slide-up" style={{ flex: '1 1 40%', minWidth: '350px' }}>
        <h2 className="gradient-text">Catalog Explorer</h2>
        <input
          type="text"
          className="search-bar"
          placeholder="Search by title..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: '100%', marginBottom: '20px', padding: '15px', boxSizing: 'border-box' }}
        />

        <div className="catalog-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '15px', maxHeight: '600px', overflowY: 'auto', paddingRight: '10px' }}>
          {loading ? <p className="pulse-text">Loading data...</p> : movies.map(movie => (
            <div
              key={movie.movieId || movie.movie_id}
              className={`catalog-card ${selectedMovie?.title === movie.title ? 'active-card' : ''}`}
              onClick={() => handleMovieClick(movie)}
              style={{ padding: '15px', textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            >
              {/* ADDED POSTERS HERE */}
              {movie.poster_url ? (
                <img src={movie.poster_url} alt={movie.title} style={{ width: '100%', height: '180px', objectFit: 'cover', borderRadius: '6px', marginBottom: '10px' }} />
              ) : (
                <div style={{ width: '100%', height: '180px', backgroundColor: '#333', borderRadius: '6px', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No Image</div>
              )}

              <h4 style={{ margin: '0 0 5px 0', fontSize: '0.9rem' }}>{movie.title}</h4>
              <span style={{ fontSize: '0.8rem', color: '#aaa' }}>{movie.year}</span>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT COLUMN: Item-to-Item Recommendations */}
      <div className="glass-panel analysis-section slide-up" style={{ flex: '1 1 60%', minWidth: '400px', animationDelay: '0.1s' }}>
        <h2 className="gradient-text">Latent Space Explorer</h2>

        {!selectedMovie ? (
          <p className="subtext">Select a movie from the catalog to view its closest geometric neighbors in the SVD cluster.</p>
        ) : (
          <div>
            <div className="selected-item-box" style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', background: 'rgba(0,0,0,0.3)', padding: '20px', borderRadius: '12px', marginBottom: '20px' }}>
              {selectedMovie.poster_url && (
                <img src={selectedMovie.poster_url} alt={selectedMovie.title} style={{ width: '120px', borderRadius: '10px', objectFit: 'cover' }} />
              )}
              <div>
                <h3 style={{ marginTop: 0 }}>Target: {selectedMovie.title}</h3>
                <p style={{ color: '#aaa', margin: '5px 0' }}>{selectedMovie.year} • {Array.isArray(selectedMovie.genre) ? selectedMovie.genre.join(', ') : selectedMovie.genre}</p>
                <p style={{ marginTop: '10px', fontSize: '0.9rem', lineHeight: '1.5', color: '#ddd' }}>{selectedMovie.description}</p>
              </div>
            </div>

            <h4 className="mt-4" style={{ borderBottom: '1px solid #444', paddingBottom: '10px' }}>Closest Latent Neighbors:</h4>

            {recLoading ? <p className="pulse-text" style={{ textAlign: 'center', marginTop: '30px' }}>Calculating Cosine Distance...</p> : (
              <div className="results-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '15px', marginTop: '20px' }}>
                  {recommendations.map((rec, idx) => (
                    <div key={idx} className="result-card fade-in" style={{ padding: '10px', textAlign: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', animationDelay: `${idx * 0.05}s` }}>
                      {rec.poster_url ? (
                        <img src={rec.poster_url} alt={rec.title} style={{ width: '100%', height: '160px', objectFit: 'cover', borderRadius: '8px', marginBottom: '10px' }} />
                      ) : (
                        <div style={{ width: '100%', height: '160px', backgroundColor: '#333', borderRadius: '8px', marginBottom: '10px' }}></div>
                      )}
                      <div className="result-details">
                        <h4 style={{ fontSize: '0.85rem', margin: '0' }}>{rec.title}</h4>
                        <p style={{ fontSize: '0.75rem', color: '#aaa', margin: '5px 0 0 0' }}>{rec.year}</p>
                      </div>
                    </div>
                  ))}
                </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}