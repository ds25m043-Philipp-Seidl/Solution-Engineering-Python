import React, { useState, useEffect } from 'react';

export default function MovieSearchGame() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const [selectedBasket, setSelectedBasket] = useState([]);

  // Split state for all 3 models!
  const [svdRecommendations, setSvdRecommendations] = useState([]);
  const [ncfRecommendations, setNcfRecommendations] = useState([]);
  const [funkRecommendations, setFunkRecommendations] = useState([]);
  const [recLoading, setRecLoading] = useState(false);
  const [viewingPlotId, setViewingPlotId] = useState(null);

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`http://localhost:3000/api/search?q=${searchQuery}`);
        const data = await res.json();
        if (data.success) {
            setSearchResults(data.movies);
        }
      } catch (err) {
        console.error("Search failed", err);
      } finally {
        setLoading(false);
      }
    }, 600);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const toggleBasket = (movie) => {
    const movieId = movie.movieId || movie.movie_id || movie.id;
    const isSelected = selectedBasket.some(m => (m.movieId || m.movie_id || m.id) === movieId);

    if (isSelected) {
      setSelectedBasket(selectedBasket.filter(m => (m.movieId || m.movie_id || m.id) !== movieId));
    } else {
      setSelectedBasket([...selectedBasket, movie]);
    }
  };

  const getRecommendations = async () => {
    if (selectedBasket.length === 0) return;

    setRecLoading(true);
    setSvdRecommendations([]);
    setNcfRecommendations([]);
    setFunkRecommendations([]);
    setSearchQuery("");

    const movieIds = selectedBasket.map(m => m.movieId || m.movie_id || m.id);

    try {
      const response = await fetch('http://localhost:3000/api/get-movies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movie_ids: movieIds })
      });

      const data = await response.json();
      if (data.success) {
        setSvdRecommendations(data.svd_recommendations);
        setNcfRecommendations(data.ncf_recommendations);
        setFunkRecommendations(data.funk_svd_recommendations);
      }
    } catch (error) {
      console.error("Recommendation error", error);
    } finally {
      setRecLoading(false);
    }
  };

  const renderMovieCard = (movie, index) => {
    const movieId = movie.movieId || movie.movie_id || movie.id;
    const isShowingPlot = viewingPlotId === movieId;

    return (
      <div key={movieId || index} className="result-card fade-in" style={{ animationDelay: `${index * 0.1}s`, display: 'flex', gap: '15px', textAlign: 'left', backgroundColor: 'rgba(20, 20, 30, 0.6)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="rank" style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#888', minWidth: '30px', display: 'flex', alignItems: 'center' }}>
          #{index + 1}
        </div>

        {movie.poster_url ? (
          <img src={movie.poster_url} alt={movie.title} style={{ width: '70px', height: '105px', borderRadius: '8px', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '70px', height: '105px', backgroundColor: '#333', borderRadius: '8px' }}></div>
        )}

        <div className="result-details" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h3 style={{ margin: '0 0 5px 0', fontSize: '1.1rem' }}>{movie.title}</h3>
          <p style={{ fontSize: '0.8rem', color: '#aaa', margin: '0 0 10px 0' }}>
            {movie.year} • {Array.isArray(movie.genre) ? movie.genre.join(', ') : movie.genre}
          </p>

          <div style={{ position: 'relative' }}>
            <p style={{ fontSize: '0.85rem', lineHeight: '1.5', color: '#ccc', margin: '0 0 8px 0', display: isShowingPlot ? 'block' : '-webkit-box', WebkitLineClamp: isShowingPlot ? 'unset' : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {movie.description ? movie.description : "No description available."}
            </p>
            {movie.description && (
              <button
                onClick={(e) => { e.preventDefault(); setViewingPlotId(isShowingPlot ? null : movieId); }}
                style={{ background: 'transparent', border: '1px solid #555', color: '#fff', padding: '4px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '0.75rem', transition: 'background 0.2s', marginTop: '5px' }}
              >
                {isShowingPlot ? 'Show Less' : 'Read Full Description'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', maxWidth: '1600px', margin: '0 auto', gap: '20px' }}>

      {/* TOP SECTION: Search & Basket */}
      {svdRecommendations.length === 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '25px', width: '100%', alignItems: 'flex-start' }}>
          {/* LEFT: Search Panel */}
          <div className="glass-panel slide-up" style={{ flex: '1 1 65%', minWidth: '350px' }}>
            <h2 className="gradient-text">Search & Rate</h2>
            <p className="subtext" style={{ marginBottom: '20px' }}>
              Search for movies you love. Clicking them acts as a 5-star rating!
            </p>
            <input
              type="text"
              className="search-bar"
              placeholder="Type a movie title (e.g. Matrix)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', marginBottom: '25px', padding: '15px', boxSizing: 'border-box', fontSize: '1.1rem' }}
            />
            <div className="catalog-grid" style={{ minHeight: '300px', maxHeight: '500px', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '15px', paddingRight: '10px' }}>
              {loading && searchResults.length === 0 ? (
                <p className="pulse-text" style={{ gridColumn: '1 / -1' }}>Searching database...</p>
              ) : searchResults.length > 0 ? (
                searchResults.map(movie => {
                  const movieId = movie.movieId || movie.movie_id || movie.id;
                  const isSelected = selectedBasket.some(m => (m.movieId || m.movie_id || m.id) === movieId);

                  return (
                    <div
                      key={movieId}
                      className={`catalog-card ${isSelected ? 'active-card' : ''}`}
                      onClick={() => toggleBasket(movie)}
                      style={{ position: 'relative', padding: '15px', textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                    >
                      {movie.poster_url ? (
                        <img src={movie.poster_url} alt={movie.title} style={{ width: '100%', height: '180px', objectFit: 'cover', borderRadius: '6px', marginBottom: '10px' }} />
                      ) : (
                        <div style={{ width: '100%', height: '180px', backgroundColor: '#333', borderRadius: '6px', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No Image</div>
                      )}

                      <h4 style={{ margin: '0 0 5px 0', fontSize: '0.9rem' }}>{movie.title}</h4>
                      <span style={{ fontSize: '0.8rem', color: '#aaa' }}>{movie.year}</span>

                      {isSelected && (
                        <div style={{ position: 'absolute', top: '-10px', right: '-10px', background: '#00ff88', color: '#000', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', boxShadow: '0 4px 10px rgba(0,255,136,0.3)' }}>
                          ✓
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <p style={{ gridColumn: '1 / -1', color: '#666', textAlign: 'center', marginTop: '20px' }}>
                  {searchQuery.length >= 2 ? "No movies found." : "Start typing to explore the catalog."}
                </p>
              )}
            </div>
          </div>

          {/* RIGHT: The Favorites Basket */}
          <div className="glass-panel slide-up" style={{ flex: '1 1 30%', minWidth: '300px', animationDelay: '0.1s', display: 'flex', flexDirection: 'column' }}>
            <h2 className="gradient-text">Your Ratings</h2>
            <p className="subtext">{selectedBasket.length} movies selected</p>
            <div style={{ flexGrow: 1, minHeight: '250px', maxHeight: '400px', overflowY: 'auto', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '10px' }}>
              {selectedBasket.length === 0 ? (
                <div style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <p style={{ color: '#666', textAlign: 'center' }}>Your basket is empty.<br/><br/>Click on movies to add them here.</p>
                </div>
              ) : (
                selectedBasket.map(movie => (
                  <div key={movie.movieId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.4)', padding: '12px 15px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: '500' }}>{movie.title}</span>
                    <button onClick={() => toggleBasket(movie)} style={{ background: 'transparent', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '1.5rem', lineHeight: '1', padding: '0 5px' }}>×</button>
                  </div>
                ))
              )}
            </div>
            <button
              className="btn-primary pulse-btn full-width"
              style={{ padding: '15px', fontSize: '1.1rem', fontWeight: 'bold' }}
              disabled={selectedBasket.length === 0 || recLoading}
              onClick={getRecommendations}
            >
              {recLoading ? "Analyzing Taste..." : "Get Recommendations"}
            </button>
          </div>
        </div>
      )}

      {/* BOTTOM SECTION: The 3-Way Split-Screen Showdown */}
      {svdRecommendations.length > 0 && (
        <div className="glass-panel zoom-in text-center" style={{ width: '100%' }}>
          <h2 className="glowing-text">Your Recommendations</h2>
          <p>Based on your {selectedBasket.length} highly-rated movies.</p>

          <div style={{ display: 'flex', gap: '20px', marginTop: '30px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

            {/* COLUMN 1: SVD */}
            <div style={{ flex: '1 1 30%', minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <h3 className="gradient-text" style={{ fontSize: '1.4rem', borderBottom: '1px solid #444', paddingBottom: '10px' }}>
                    The Calculator<br/>
                    <span style={{ fontSize: '0.8rem', color: '#888', fontWeight: 'normal' }}>(Singular Value Decomposition)</span>
                </h3>
                {svdRecommendations.map(renderMovieCard)}
            </div>

            {/* COLUMN 2: NCF */}
            <div style={{ flex: '1 1 30%', minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <h3 className="gradient-text" style={{ fontSize: '1.4rem', borderBottom: '1px solid #444', paddingBottom: '10px' }}>
                    The Network<br/>
                    <span style={{ fontSize: '0.8rem', color: '#888', fontWeight: 'normal' }}>(Neural Collaborative Filtering)</span>
                </h3>
                {ncfRecommendations.map(renderMovieCard)}
            </div>

          </div>

          <button className="btn-primary full-width mt-4" style={{ padding: '15px', fontSize: '1.1rem', marginTop: '40px' }} onClick={() => {
            setSvdRecommendations([]);
            setNcfRecommendations([]);
            setFunkRecommendations([]);
            setSelectedBasket([]);
            setViewingPlotId(null);
          }}>
            Restart Recommender
          </button>
        </div>
      )}
    </div>
  );
}