import React, { useState, useEffect, useRef } from 'react';

export default function MovieSearchGame() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const [selectedBasket, setSelectedBasket] = useState([]);
  const [svdRecommendations, setSvdRecommendations] = useState([]);
  const [ncfRecommendations, setNcfRecommendations] = useState([]);
  const [funkRecommendations, setFunkRecommendations] = useState([]);
  const [recLoading, setRecLoading] = useState(false);
  const [viewingPlotId, setViewingPlotId] = useState(null);

  const searchCache = useRef({});

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    if (searchCache.current[searchQuery]) {
        setSearchResults(searchCache.current[searchQuery]);
        return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`http://localhost:3000/api/search?q=${searchQuery}`);
        const data = await res.json();
        if (data.success) {
            searchCache.current[searchQuery] = data.movies;
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
      <div key={movieId || index} className="result-card fade-in" style={{ animationDelay: `${index * 0.1}s`, display: 'flex', gap: '20px', textAlign: 'left', backgroundColor: 'rgba(20, 20, 30, 0.6)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="rank" style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#888', minWidth: '40px', display: 'flex', alignItems: 'center' }}>#{index + 1}</div>
        {movie.poster_url ? <img src={movie.poster_url} alt={movie.title} style={{ width: '80px', height: '120px', borderRadius: '8px', objectFit: 'cover' }} /> : <div style={{ width: '80px', height: '120px', backgroundColor: '#333', borderRadius: '8px' }}></div>}
        <div className="result-details" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
          <h3 style={{ margin: '0 0 6px 0', fontSize: '1.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{movie.title}</h3>
          <p style={{ fontSize: '0.9rem', color: '#aaa', margin: '0 0 12px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {movie.year} • {Array.isArray(movie.genre) ? movie.genre.join(', ') : movie.genre}
          </p>
          <div style={{ position: 'relative' }}>
            <p style={{ fontSize: '0.95rem', lineHeight: '1.6', color: '#ccc', margin: '0 0 10px 0', display: isShowingPlot ? 'block' : '-webkit-box', WebkitLineClamp: isShowingPlot ? 'unset' : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {movie.description ? movie.description : "No description available."}
            </p>
            {movie.description && (
              <button onClick={(e) => { e.preventDefault(); setViewingPlotId(isShowingPlot ? null : movieId); }} style={{ background: 'transparent', border: '1px solid #555', color: '#fff', padding: '6px 12px', borderRadius: '5px', cursor: 'pointer', fontSize: '0.8rem' }}>
                {isShowingPlot ? 'Show Less' : 'Read Full Description'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const hasRecommendations = svdRecommendations.length > 0;

  return (
    // UPDATED: Expanded to 95% width, max 1800px, and increased gap to 40px
    <div style={{ display: 'flex', flexDirection: 'row', width: '95%', maxWidth: '1800px', margin: '0 auto', gap: '40px', alignItems: 'flex-start', flexWrap: 'nowrap' }}>

      {/* LEFT COLUMN: Main Activity Area */}
      {/* UPDATED: Increased flex ratio to 4 so it takes up more space compared to the basket */}
      <div style={{ flex: '4 1 0%', minWidth: 0 }}>

        {/* VIEW 1: SEARCH PHASE */}
        {!hasRecommendations && (
          <div className="glass-panel slide-up" style={{ width: '100%', boxSizing: 'border-box', padding: '30px' }}>
            <h2 className="gradient-text">Search & Rate</h2>
            <p className="subtext" style={{ marginBottom: '25px', fontSize: '1.1rem' }}>Search for movies you love. Clicking them acts as a 5-star rating!</p>
            <input
              type="text"
              className="search-bar"
              placeholder="Type a movie title (e.g. Matrix)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', marginBottom: '30px', padding: '18px', boxSizing: 'border-box', fontSize: '1.2rem' }}
            />
            {/* UPDATED: grid minmax increased to 160px for wider screens */}
            <div className="catalog-grid" style={{ minHeight: '400px', maxHeight: '700px', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '20px', paddingRight: '10px' }}>
              {loading && searchResults.length === 0 ? (
                <p className="pulse-text" style={{ gridColumn: '1 / -1', fontSize: '1.2rem' }}>Searching database...</p>
              ) : searchResults.length > 0 ? (
                searchResults.map(movie => {
                  const movieId = movie.movieId || movie.movie_id || movie.id;
                  const isSelected = selectedBasket.some(m => (m.movieId || m.movie_id || m.id) === movieId);

                  return (
                    <div key={movieId} className={`catalog-card ${isSelected ? 'active-card' : ''}`} onClick={() => toggleBasket(movie)} style={{ position: 'relative', padding: '15px', textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      {movie.poster_url ? <img src={movie.poster_url} alt={movie.title} style={{ width: '100%', height: '220px', objectFit: 'cover', borderRadius: '8px', marginBottom: '12px' }} /> : <div style={{ width: '100%', height: '220px', backgroundColor: '#333', borderRadius: '8px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No Image</div>}
                      <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem' }}>{movie.title}</h4>
                      <span style={{ fontSize: '0.85rem', color: '#aaa' }}>{movie.year}</span>
                      {isSelected && (
                        <div style={{ position: 'absolute', top: '-10px', right: '-10px', background: '#00ff88', color: '#000', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,255,136,0.4)', fontSize: '1.2rem' }}>✓</div>
                      )}
                    </div>
                  );
                })
              ) : (
                <p style={{ gridColumn: '1 / -1', color: '#666', textAlign: 'center', marginTop: '30px', fontSize: '1.1rem' }}>{searchQuery.length >= 2 ? "No movies found." : "Start typing to explore the catalog."}</p>
              )}
            </div>
          </div>
        )}

        {/* VIEW 2: RESULTS PHASE */}
        {hasRecommendations && (
          <div className="glass-panel zoom-in text-center" style={{ width: '100%', boxSizing: 'border-box', padding: '30px' }}>
            <h2 className="glowing-text" style={{ fontSize: '2.5rem' }}>Your Recommendations</h2>
            <p style={{ fontSize: '1.1rem' }}>Based on your highly-rated movies.</p>

            <div style={{ display: 'flex', gap: '40px', marginTop: '40px', flexWrap: 'nowrap' }}>
              <div style={{ flex: '1 1 50%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <h3 className="gradient-text" style={{ fontSize: '1.5rem', borderBottom: '1px solid #444', paddingBottom: '15px' }}>The Calculator<br/><span style={{ fontSize: '0.85rem', color: '#888', fontWeight: 'normal' }}>(Singular Value Decomposition)</span></h3>
                  {svdRecommendations.map(renderMovieCard)}
              </div>
              <div style={{ flex: '1 1 50%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <h3 className="gradient-text" style={{ fontSize: '1.5rem', borderBottom: '1px solid #444', paddingBottom: '15px' }}>The Network<br/><span style={{ fontSize: '0.85rem', color: '#888', fontWeight: 'normal' }}>(Neural Collaborative Filtering)</span></h3>
                  {ncfRecommendations.map(renderMovieCard)}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* RIGHT COLUMN: Persistent Compact Basket */}
      {/* UPDATED: Made minimum width larger so it scales nicely */}
      <div className="glass-panel slide-up" style={{ flex: '1 1 0%', minWidth: '320px', maxWidth: '400px', display: 'flex', flexDirection: 'column', height: 'fit-content', boxSizing: 'border-box', padding: '25px' }}>
        <h2 className="gradient-text" style={{ fontSize: '1.6rem', margin: '0 0 8px 0' }}>Your Ratings</h2>
        <p className="subtext" style={{ fontSize: '1rem', marginBottom: '25px' }}>{selectedBasket.length} movies selected</p>

        <div style={{ flexGrow: 1, minHeight: '200px', maxHeight: '600px', overflowY: 'auto', marginBottom: '25px', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '10px' }}>
          {selectedBasket.length === 0 ? (
            <div style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ color: '#666', textAlign: 'center', fontSize: '1rem' }}>Your basket is empty.<br/><br/>Click on movies to add them here.</p>
            </div>
          ) : (
            selectedBasket.map(movie => (
              <div key={movie.movieId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.4)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                   {movie.poster_url ? <img src={movie.poster_url} style={{ width: '30px', height: '45px', objectFit: 'cover', borderRadius: '4px'}} /> : <div style={{width: '30px', height:'45px', background:'#333', borderRadius: '4px'}} />}
                   <span style={{ fontSize: '0.95rem', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{movie.title}</span>
                </div>
                <button onClick={() => toggleBasket(movie)} style={{ background: 'transparent', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '1.4rem', lineHeight: '1', padding: '0 8px' }}>×</button>
              </div>
            ))
          )}
        </div>

        {!hasRecommendations ? (
            <button className="btn-primary pulse-btn full-width" style={{ padding: '15px', fontSize: '1.1rem', fontWeight: 'bold' }} disabled={selectedBasket.length === 0 || recLoading} onClick={getRecommendations}>
            {recLoading ? "Analyzing..." : "Get Recommendations"}
            </button>
        ) : (
            <button className="btn-secondary full-width" style={{ padding: '15px', fontSize: '1rem', border: '1px solid #555', background: 'transparent', color: '#fff', borderRadius: '8px' }} onClick={() => {
                setSvdRecommendations([]);
                setNcfRecommendations([]);
                setFunkRecommendations([]);
                setViewingPlotId(null);
              }}>
                ← Edit Search Basket
            </button>
        )}
      </div>

    </div>
  );
}