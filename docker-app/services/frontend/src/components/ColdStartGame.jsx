import React, { useState, useEffect } from 'react';

export default function ColdStartGame() {
  const [step, setStep] = useState(0); // 0: Welcome, 1: Setup, 2: Game, 3: Results
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Setup State
  const [availableGenres, setAvailableGenres] = useState([]);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [minYear, setMinYear] = useState(1990);
  const [maxYear, setMaxYear] = useState(2024);

  // Game State
  const [gameRounds, setGameRounds] = useState([]);
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [selectedMovies, setSelectedMovies] = useState([]);
  const [recommendations, setRecommendations] = useState([]);

  // NEW: Tracks which movie's plot is currently being read
  const [viewingPlotId, setViewingPlotId] = useState(null);

  // Fetch Genres on Mount
  useEffect(() => {
    const fetchGenres = async () => {
      try {
        const res = await fetch('http://localhost:3000/api/genres');
        const data = await res.json();
        if (data.success) setAvailableGenres(data.genres);
      } catch (err) {
        console.error("Could not fetch genres", err);
        setAvailableGenres(["Action", "Sci-Fi", "Comedy", "Drama", "Thriller", "Horror", "Romance"]);
      }
    };
    fetchGenres();
  }, []);

  const toggleGenre = (genre) => {
    if (selectedGenres.includes(genre)) {
      setSelectedGenres(selectedGenres.filter(g => g !== genre));
    } else if (selectedGenres.length < 3) {
      setSelectedGenres([...selectedGenres, genre]);
    }
  };

  const startGame = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const response = await fetch('http://localhost:3000/api/start-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          genres: selectedGenres,
          min_year: parseInt(minYear),
          max_year: parseInt(maxYear)
        })
      });

      const data = await response.json();
      if (data.success) {
        setGameRounds(data.rounds);
        setSelectedMovies([]);
        setCurrentRoundIndex(0);
        setStep(2);
      } else {
        setErrorMsg(data.error || "Failed to start game.");
      }
    } catch (error) {
      setErrorMsg("Could not reach the backend server.");
    } finally {
      setLoading(false);
    }
  };

  const getRecommendations = async (finalSelectedMovies) => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:3000/api/get-movies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movie_ids: finalSelectedMovies })
      });

      const data = await response.json();
      if (data.success) {
        setRecommendations(data.recommendations);
        setStep(3);
      }
    } catch (error) {
      setErrorMsg("Error generating recommendations.");
    } finally {
      setLoading(false);
    }
  };

  const handleMoviePick = (movieId) => {
      setViewingPlotId(null);

      const newSelectedMovies = [...selectedMovies, movieId];
      setSelectedMovies(newSelectedMovies);

      if (currentRoundIndex < 9) {
        setCurrentRoundIndex(currentRoundIndex + 1);
      } else {
        getRecommendations(newSelectedMovies);
      }
    };
  return (
    <div className="cinematic-container">
      {/* Animated Background Elements */}
      <div className="orb orb-1"></div>
      <div className="orb orb-2"></div>
      <div className="orb orb-3"></div>

      <div className="content-wrapper">

        {/* STEP 0: WELCOME */}
        {step === 0 && (
          <div className="hero-section glass-panel fade-in">
            <h1 className="glowing-text">The Movie Recommender</h1>
            <p>Discover your next obsession through the power of Machine Learning.</p>
            <button className="btn-primary pulse-btn" onClick={() => setStep(1)}>
              Find your next favourite movie
            </button>
          </div>
        )}

        {/* STEP 1: SETUP */}
        {step === 1 && (
          <div className="glass-panel slide-up">
            <h2 className="gradient-text">Shape Your Profile</h2>

            <div className="setup-section">
              <label>Select your 3 favourite genres ({selectedGenres.length}/3):</label>
              <div className="genre-cloud">
                {availableGenres.map(genre => {
                  const isSelected = selectedGenres.includes(genre);
                  return (
                    <button
                      key={genre}
                      className={`genre-pill ${isSelected ? 'selected' : ''}`}
                      onClick={() => toggleGenre(genre)}
                      disabled={!isSelected && selectedGenres.length >= 3}
                    >
                      {genre} {isSelected && '✕'}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="setup-section year-filters">
              <label>Era Preference:</label>
              <div className="year-inputs">
                <input type="number" value={minYear} onChange={(e) => setMinYear(e.target.value)} min="1900" max="2024" />
                <span className="separator">to</span>
                <input type="number" value={maxYear} onChange={(e) => setMaxYear(e.target.value)} min="1900" max="2024" />
              </div>
            </div>

            {errorMsg && <div className="error-box">{errorMsg}</div>}

            <button
              className="btn-success full-width"
              disabled={selectedGenres.length !== 3 || loading}
              onClick={startGame}
            >
              {loading ? "Calibrating..." : "Initialize Sequence →"}
            </button>
          </div>
        )}

        {/* STEP 2: THE GAME */}
        {step === 2 && gameRounds.length > 0 && (
          <div className="glass-panel slide-up text-center">
            <h3 className="round-counter">Phase {currentRoundIndex + 1} / 10</h3>
            <p>Select the movie that sounds the most appealing to you.</p>

            <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginTop: '30px', flexWrap: 'wrap' }}>
              {gameRounds[currentRoundIndex].map(movie => {
                  const movieId = movie.movieId || movie.movie_id || movie.id;
                  const isShowingPlot = viewingPlotId === movieId;

                  return (
                    <div
                      key={movieId}
                      className="floating-card"
                      // 1. MAIN CLICK HANDLER MOVED TO THE OUTERMOST CARD
                      onClick={() => handleMoviePick(movieId)}
                      style={{
                        width: '260px',
                        backgroundColor: 'rgba(20, 20, 30, 0.6)',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        border: '1px solid rgba(255,255,255,0.05)',
                        cursor: 'pointer' // Shows pointer for the whole card
                      }}
                    >
                      {/* TOP SECTION: Poster */}
                      <div style={{ position: 'relative', height: '380px' }}>
                        {movie.poster_url ? (
                          <img
                            src={movie.poster_url}
                            alt={movie.title}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          />
                        ) : (
                          <div style={{ width: '100%', height: '100%', backgroundColor: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                            <h3>{movie.title}</h3>
                          </div>
                        )}

                        {/* THE PLOT OVERLAY */}
                        {isShowingPlot && (
                          <div
                            style={{
                              position: 'absolute',
                              top: 0, left: 0, right: 0, bottom: 0,
                              backgroundColor: 'rgba(15, 15, 20, 0.95)',
                              padding: '20px',
                              overflowY: 'auto',
                              textAlign: 'left',
                              zIndex: 10,
                              animation: 'fadeIn 0.2s ease-out',
                              cursor: 'default' // Changes cursor so it doesn't look clickable
                            }}
                            onClick={(e) => {
                              // 2. BRICK WALL TO STOP BUBBLING
                              e.preventDefault();
                              e.stopPropagation();
                              setViewingPlotId(null);
                            }}
                          >
                            <h4 style={{ color: '#fff', marginTop: 0 }}>Description Summary</h4>
                            <p style={{ color: '#ccc', fontSize: '0.9rem', lineHeight: '1.5' }}>
                              {movie.description ? movie.description : "No description available."}
                            </p>
                            <p style={{ color: '#777', fontSize: '0.8rem', textAlign: 'center', marginTop: '20px' }}>
                              (Click text to close)
                            </p>
                          </div>
                        )}

                        {/* Hover Overlay Hint for the poster */}
                        {!isShowingPlot && (
                          <div className="card-glare" style={{ zIndex: 5 }}></div>
                        )}
                      </div>

                      {/* BOTTOM SECTION: Details & Controls */}
                      <div style={{ padding: '15px', display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'space-between' }}>
                        <h4 style={{ margin: '0 0 15px 0', fontSize: '1.1rem', lineHeight: '1.2', textAlign: 'left' }}>
                          {movie.title}
                        </h4>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="hologram-badge" style={{ position: 'static', padding: '4px 10px' }}>
                            {movie.year}
                          </span>

                          <button
                            onClick={(e) => {
                              // 3. BRICK WALL FOR THE BUTTON
                              e.preventDefault();
                              e.stopPropagation();
                              setViewingPlotId(isShowingPlot ? null : movieId);
                            }}
                            style={{
                              backgroundColor: isShowingPlot ? '#444' : 'transparent',
                              border: '1px solid #666',
                              color: '#fff',
                              padding: '6px 12px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                              transition: 'background 0.2s',
                              position: 'relative', // Ensures button stays above parent elements
                              zIndex: 20
                            }}
                            onMouseEnter={(e) => e.target.style.backgroundColor = isShowingPlot ? '#555' : 'rgba(255,255,255,0.1)'}
                            onMouseLeave={(e) => e.target.style.backgroundColor = isShowingPlot ? '#444' : 'transparent'}
                          >
                            {isShowingPlot ? 'Hide Description' : 'Read Description'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="progress-bar" style={{ marginTop: '40px' }}>
              <div className="progress-fill" style={{ width: `${(selectedMovies.length / 10) * 100}%` }}></div>
            </div>
          </div>
        )}

        {/* STEP 3: RESULTS */}
        {step === 3 && (
          <div className="glass-panel zoom-in text-center">
            <h2 className="glowing-text">Your Recommendation</h2>
            <p>We found these matches for you:</p>

            <div className="results-grid" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {recommendations.map((movie, index) => {
                const movieId = movie.movieId || movie.movie_id || movie.id;
                const isShowingPlot = viewingPlotId === movieId;

                return (
                  <div
                    key={movieId || index}
                    className="result-card fade-in"
                    style={{
                      animationDelay: `${index * 0.1}s`,
                      display: 'flex',
                      gap: '20px',
                      textAlign: 'left',
                      backgroundColor: 'rgba(20, 20, 30, 0.6)',
                      padding: '15px',
                      borderRadius: '12px',
                      border: '1px solid rgba(255,255,255,0.05)'
                    }}
                  >
                    <div className="rank" style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#888', minWidth: '40px' }}>
                      #{index + 1}
                    </div>

                    {/* Movie Poster */}
                    {movie.poster_url ? (
                      <img src={movie.poster_url} alt={movie.title} style={{ width: '80px', height: '120px', borderRadius: '8px', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '80px', height: '120px', backgroundColor: '#333', borderRadius: '8px' }}></div>
                    )}

                    {/* Details and Accordion Plot */}
                    <div className="result-details" style={{ flexGrow: 1 }}>
                      <h3 style={{ margin: '0 0 5px 0', fontSize: '1.2rem' }}>{movie.title}</h3>
                      <p style={{ fontSize: '0.85rem', color: '#aaa', margin: '0 0 10px 0' }}>
                        {movie.year} • {Array.isArray(movie.genre) ? movie.genre.join(', ') : movie.genre}
                      </p>

                      <div style={{ position: 'relative' }}>
                        <p style={{
                          fontSize: '0.9rem',
                          lineHeight: '1.5',
                          color: '#ccc',
                          margin: '0 0 8px 0',
                          // This toggles between cutting off at 2 lines, or showing the full text
                          display: isShowingPlot ? 'block' : '-webkit-box',
                          WebkitLineClamp: isShowingPlot ? 'unset' : 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }}>
                          {movie.description ? movie.description : "No description available."}
                        </p>

                        {/* Expand/Collapse Button */}
                        {movie.description && (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              setViewingPlotId(isShowingPlot ? null : movieId);
                            }}
                            style={{
                              background: 'transparent',
                              border: '1px solid #555',
                              color: '#fff',
                              padding: '4px 10px',
                              borderRadius: '5px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              transition: 'background 0.2s',
                              marginTop: '5px'
                            }}
                            onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                          >
                            {isShowingPlot ? 'Show Less' : 'Read Full Description'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button className="btn-primary full-width mt-4" onClick={() => {
              setStep(0);
              setSelectedGenres([]);
              setRecommendations([]);
              setViewingPlotId(null); // Reset the plot viewer for the next game!
            }}>
              Restart Recommender
            </button>
          </div>
        )}
      </div>
    </div>
  );
}