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
        setRecommendations(data.recommendations);
      }
    } catch (error) {
      console.error("Rec error", error);
    } finally {
      setRecLoading(false);
    }
  };

  return (
    <div className="dashboard-container">

      {/* LEFT COLUMN: Search & Catalog */}
      <div className="glass-panel catalog-section slide-up">
        <h2 className="gradient-text">Catalog Explorer</h2>
        <input
          type="text"
          className="search-bar"
          placeholder="Search by title..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <div className="catalog-grid">
          {loading ? <p>Loading data...</p> : movies.map(movie => (
            <div
              key={movie.movieId || movie.movie_id}
              className={`catalog-card ${selectedMovie?.title === movie.title ? 'active-card' : ''}`}
              onClick={() => handleMovieClick(movie)}
            >
              <h4>{movie.title}</h4>
              <span>{movie.year}</span>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT COLUMN: Item-to-Item Recommendations */}
      <div className="glass-panel analysis-section slide-up" style={{ animationDelay: '0.1s' }}>
        <h2 className="gradient-text">Item Analysis</h2>

        {!selectedMovie ? (
          <p className="subtext">Select a movie from the catalog to view its SVD cluster.</p>
        ) : (
          <div>
            <div className="selected-item-box" style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
              {selectedMovie.poster_url && (
                <img src={selectedMovie.poster_url} alt={selectedMovie.title} style={{ width: '120px', borderRadius: '10px' }} />
              )}
              <div>
                <h3>Target: {selectedMovie.title}</h3>
                <p style={{ color: '#aaa' }}>{selectedMovie.year} • {Array.isArray(selectedMovie.genre) ? selectedMovie.genre.join(', ') : selectedMovie.genre}</p>
                <p style={{ marginTop: '10px', fontSize: '0.9rem', lineHeight: '1.5' }}>{selectedMovie.description}</p>
              </div>
            </div>

            <h4 className="mt-4">Similar Items in Latent Space:</h4>
            {recLoading ? <p className="pulse-text">Calculating vector distance...</p> : (
              <div className="results-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '15px' }}>
                  {recommendations.map((rec, idx) => (
                    <div key={idx} className="result-card fade-in" style={{ padding: '10px', textAlign: 'center' }}>
                      {rec.poster_url ? (
                        <img src={rec.poster_url} alt={rec.title} style={{ width: '100%', borderRadius: '8px', marginBottom: '10px' }} />
                      ) : (
                        <div style={{ width: '100%', aspectRatio: '2/3', backgroundColor: '#333', borderRadius: '8px', marginBottom: '10px' }}></div>
                      )}
                      <div className="result-details">
                        <h4 style={{ fontSize: '0.9rem', margin: '0' }}>{rec.title}</h4>
                        <p style={{ fontSize: '0.8rem', color: '#aaa', margin: '5px 0 0 0' }}>{rec.year}</p>
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