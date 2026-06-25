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

  // SHOWDOWN STATE
  const [ncfRecommendations, setNcfRecommendations] = useState([]);
  const [svdRecommendations, setSvdRecommendations] = useState([]);

  // Tracks which movie's plot is currently being read
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
        // Expecting the Node backend to return both arrays now!
        setNcfRecommendations(data.ncf_recommendations || []);
        setSvdRecommendations(data.svd_recommendations || []);
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

  // Reusable component for rendering a movie card in the results list
  const RenderResultCard = ({ movie, index }) => {
    const movieId = movie.movieId || movie.movie_id || movie.id;
    const isShowingPlot = viewingPlotId === movieId;

    return (
      <div
        className="result-card fade-in"
        style={{
          animationDelay: `${index * 0.05}s`,
          display: 'flex',
          gap: '15px',
          textAlign: 'left',
          backgroundColor: 'rgba(20, 20, 30, 0.6)',
          padding: '12px',
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.05)',
          marginBottom: '10px'
        }}
      >
        <div className="rank" style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#888', minWidth: '30px' }}>
          #{index + 1}
        </div>

        {/* Movie Poster */}
        {movie.poster_url ? (
          <img src={movie.poster_url} alt={movie.title} style={{ width: '60px', height: '90px', borderRadius: '6px', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '60px', height: '90px', backgroundColor: '#333', borderRadius: '6px' }}></div>
        )}

        {/* Details and Accordion Plot */}
        <div className="result-details" style={{ flexGrow: 1 }}>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem' }}>{movie.title}</h3>
          <p style={{ fontSize: '0.8rem', color: '#aaa', margin: '0 0 6px 0' }}>
            {movie.year} • {Array.isArray(movie.genre) ? movie.genre.join(', ') : movie.genre}
          </p>

          <div style={{ position: 'relative' }}>
            <p style={{
              fontSize: '0.85rem',
              lineHeight: '1.4',
              color: '#ccc',
              margin: '0 0 6px 0',
              display: isShowingPlot ? 'block' : '-webkit-box',
              WebkitLineClamp: isShowingPlot ? 'unset' : 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}>
              {movie.description ? movie.description : "No description available."}
            </p>

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
                  padding: '3px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  transition: 'background 0.2s',
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
  };

  return (
    <div className="cinematic-container">
      <div className="orb orb-1"></div>
      <div className="orb orb-2"></div>
      <div className="orb orb-3"></div>

      <div className="content-wrapper" style={{ maxWidth: step === 3 ? '1200px' : '800px' }}>

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
             {/* ... (Kept exactly the same as your code) ... */}
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
            {/* ... (Kept exactly the same as your code) ... */}
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
                      onClick={() => handleMoviePick(movieId)}
                      style={{ width: '260px', backgroundColor: 'rgba(20, 20, 30, 0.6)', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}
                    >
                      <div style={{ position: 'relative', height: '380px' }}>
                        {movie.poster_url ? (
                          <img src={movie.poster_url} alt={movie.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', backgroundColor: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                            <h3>{movie.title}</h3>
                          </div>
                        )}

                        {isShowingPlot && (
                          <div
                            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 15, 20, 0.95)', padding: '20px', overflowY: 'auto', textAlign: 'left', zIndex: 10, animation: 'fadeIn 0.2s ease-out', cursor: 'default' }}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setViewingPlotId(null); }}
                          >
                            <h4 style={{ color: '#fff', marginTop: 0 }}>Description Summary</h4>
                            <p style={{ color: '#ccc', fontSize: '0.9rem', lineHeight: '1.5' }}>{movie.description ? movie.description : "No description available."}</p>
                            <p style={{ color: '#777', fontSize: '0.8rem', textAlign: 'center', marginTop: '20px' }}>(Click text to close)</p>
                          </div>
                        )}
                      </div>

                      <div style={{ padding: '15px', display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'space-between' }}>
                        <h4 style={{ margin: '0 0 15px 0', fontSize: '1.1rem', lineHeight: '1.2', textAlign: 'left' }}>{movie.title}</h4>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="hologram-badge" style={{ position: 'static', padding: '4px 10px' }}>{movie.year}</span>
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setViewingPlotId(isShowingPlot ? null : movieId); }}
                            style={{ backgroundColor: isShowingPlot ? '#444' : 'transparent', border: '1px solid #666', color: '#fff', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', transition: 'background 0.2s', position: 'relative', zIndex: 20 }}
                          >
                            {isShowingPlot ? 'Hide' : 'Read'}
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

        {/* STEP 3: RESULTS (THE SHOWDOWN) */}
        {step === 3 && (
          <div className="glass-panel zoom-in text-center" style={{ width: '100%' }}>
            <h2 className="glowing-text">Your Recommendations</h2>
            <p>Based on our two models.</p>

            <div style={{ display: 'flex', gap: '30px', marginTop: '30px', flexWrap: 'wrap' }}>

              {/* LEFT COLUMN: NCF (The Winner) */}
              <div style={{ flex: '1 1 400px', backgroundColor: 'rgba(30, 20, 50, 0.4)', padding: '20px', borderRadius: '15px', border: '1px solid rgba(150, 100, 255, 0.2)' }}>
                <h3 style={{ color: '#b388ff', marginBottom: '5px' }}>The Network</h3>
                <p style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: '20px' }}>Neural Collaborative Filtering</p>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {ncfRecommendations.map((movie, index) => (
                    <RenderResultCard key={`ncf-${index}`} movie={movie} index={index} />
                  ))}
                </div>
              </div>

              {/* RIGHT COLUMN: SVD (The Baseline) */}
              <div style={{ flex: '1 1 400px', backgroundColor: 'rgba(20, 30, 50, 0.4)', padding: '20px', borderRadius: '15px', border: '1px solid rgba(100, 150, 255, 0.2)' }}>
                <h3 style={{ color: '#88b3ff', marginBottom: '5px' }}>The Calculator</h3>
                <p style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: '20px' }}>Singular Value Decomposition</p>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {svdRecommendations.map((movie, index) => (
                    <RenderResultCard key={`svd-${index}`} movie={movie} index={index} />
                  ))}
                </div>
              </div>

            </div>

            <button className="btn-primary full-width mt-4" style={{ marginTop: '30px' }} onClick={() => {
              setStep(0);
              setSelectedGenres([]);
              setNcfRecommendations([]);
              setSvdRecommendations([]);
              setViewingPlotId(null);
            }}>
              Restart Recommender
            </button>
          </div>
        )}
      </div>
    </div>
  );
}