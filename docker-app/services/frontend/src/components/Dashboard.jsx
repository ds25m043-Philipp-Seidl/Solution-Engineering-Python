import React, { useState, useEffect } from 'react';

export default function Dashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(false);

  const [selectedMovie, setSelectedMovie] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [recLoading, setRecLoading] = useState(false);

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

    const delayDebounceFn = setTimeout(() => { fetchMovies(); }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const handleMovieClick = async (movie) => {
    setSelectedMovie(movie);
    setRecLoading(true);
    setRecommendations([]);

    try {
      const response = await fetch('http://localhost:3000/api/get-movies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movie_ids: [movie.movieId || movie.movie_id || movie.id] })
      });

      const data = await response.json();
      if (data.success) {
        setRecommendations(data.svd_recommendations);
      }
    } catch (error) {
      console.error("Rec error", error);
    } finally {
      setRecLoading(false);
    }
  };

  return (
    // UPDATED: Same expansion applied here - up to 1800px width and larger gaps
    <div className="dashboard-container" style={{ display: 'flex', gap: '40px', maxWidth: '1800px', width: '95%', margin: '0 auto' }}>

      {/* LEFT COLUMN: Search & Catalog */}
      <div className="glass-panel catalog-section slide-up" style={{ flex: '1 1 40%', minWidth: '400px', padding: '30px' }}>
        <h2 className="gradient-text" style={{ fontSize: '2rem' }}>Catalog Explorer</h2>
        <input
          type="text"
          className="search-bar"
          placeholder="Search by title..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: '100%', marginBottom: '30px', padding: '18px', boxSizing: 'border-box', fontSize: '1.2rem' }}
        />

        <div className="catalog-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '20px', maxHeight: '700px', overflowY: 'auto', paddingRight: '10px' }}>
          {loading ? <p className="pulse-text" style={{ fontSize: '1.2rem' }}>Loading data...</p> : movies.map(movie => (
            <div
              key={movie.movieId || movie.movie_id}
              className={`catalog-card ${selectedMovie?.title === movie.title ? 'active-card' : ''}`}
              onClick={() => handleMovieClick(movie)}
              style={{ padding: '15px', textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            >
              {movie.poster_url ? (
                <img src={movie.poster_url} alt={movie.title} style={{ width: '100%', height: '220px', objectFit: 'cover', borderRadius: '8px', marginBottom: '12px' }} />
              ) : (
                <div style={{ width: '100%', height: '220px', backgroundColor: '#333', borderRadius: '8px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No Image</div>
              )}

              <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem' }}>{movie.title}</h4>
              <span style={{ fontSize: '0.85rem', color: '#aaa' }}>{movie.year}</span>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT COLUMN: Item-to-Item Recommendations */}
      <div className="glass-panel analysis-section slide-up" style={{ flex: '1 1 60%', minWidth: '500px', animationDelay: '0.1s', padding: '30px' }}>
        <h2 className="gradient-text" style={{ fontSize: '2rem' }}>Latent Space Explorer</h2>

        {!selectedMovie ? (
          <p className="subtext" style={{ fontSize: '1.1rem', marginTop: '20px' }}>Select a movie from the catalog to view its closest geometric neighbors in the SVD cluster.</p>
        ) : (
          <div style={{ marginTop: '20px' }}>
            <div className="selected-item-box" style={{ display: 'flex', gap: '30px', alignItems: 'flex-start', background: 'rgba(0,0,0,0.3)', padding: '30px', borderRadius: '15px', marginBottom: '30px' }}>
              {selectedMovie.poster_url && (
                <img src={selectedMovie.poster_url} alt={selectedMovie.title} style={{ width: '160px', borderRadius: '12px', objectFit: 'cover' }} />
              )}
              <div>
                <h3 style={{ marginTop: 0, fontSize: '1.6rem' }}>Target: {selectedMovie.title}</h3>
                <p style={{ color: '#aaa', margin: '10px 0', fontSize: '1rem' }}>{selectedMovie.year} • {Array.isArray(selectedMovie.genre) ? selectedMovie.genre.join(', ') : selectedMovie.genre}</p>
                <p style={{ marginTop: '15px', fontSize: '1rem', lineHeight: '1.6', color: '#ddd' }}>{selectedMovie.description}</p>
              </div>
            </div>

            <h4 className="mt-4" style={{ borderBottom: '1px solid #444', paddingBottom: '15px', fontSize: '1.3rem' }}>Closest Latent Neighbors:</h4>

            {recLoading ? <p className="pulse-text" style={{ textAlign: 'center', marginTop: '40px', fontSize: '1.2rem' }}>Calculating Cosine Distance...</p> : (
              <div className="results-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '20px', marginTop: '30px' }}>
                  {recommendations.map((rec, idx) => (
                    <div key={idx} className="result-card fade-in" style={{ padding: '15px', textAlign: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', animationDelay: `${idx * 0.05}s` }}>
                      {rec.poster_url ? (
                        <img src={rec.poster_url} alt={rec.title} style={{ width: '100%', height: '200px', objectFit: 'cover', borderRadius: '8px', marginBottom: '12px' }} />
                      ) : (
                        <div style={{ width: '100%', height: '200px', backgroundColor: '#333', borderRadius: '8px', marginBottom: '12px' }}></div>
                      )}
                      <div className="result-details">
                        <h4 style={{ fontSize: '0.95rem', margin: '0' }}>{rec.title}</h4>
                        <p style={{ fontSize: '0.85rem', color: '#aaa', margin: '6px 0 0 0' }}>{rec.year}</p>
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