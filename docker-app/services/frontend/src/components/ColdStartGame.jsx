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
  const [viewingPlotId, setViewingPlotId] = useState(null);

  useEffect(() => {
    const fetchGenres = async () => {
      try {
        const res = await fetch('http://localhost:3000/api/genres');
        const data = await res.json();
        if (data.success) setAvailableGenres(data.genres);
      } catch (err) {
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

  const getRecommendations = async (finalSelectedMovieIds) => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:3000/api/get-movies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movie_ids: finalSelectedMovieIds })
      });

      const data = await response.json();
      if (data.success) {
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

  const handleMoviePick = (movie) => {
      setViewingPlotId(null);
      const newSelection = [...selectedMovies];

      const existingIndex = newSelection.findIndex(m => m.roundIndex === currentRoundIndex);
      if (existingIndex >= 0) {
          newSelection[existingIndex] = { roundIndex: currentRoundIndex, movie };
      } else {
          newSelection.push({ roundIndex: currentRoundIndex, movie });
      }
      setSelectedMovies(newSelection);

      let nextRound = -1;
      for (let i = 0; i < 10; i++) {
          if (!newSelection.some(s => s.roundIndex === i)) {
              nextRound = i;
              break;
          }
      }

      if (nextRound !== -1) {
          setCurrentRoundIndex(nextRound);
      } else {
          getRecommendations(newSelection.map(s => s.movie.movieId || s.movie.movie_id || s.movie.id));
      }
  };

  const RenderResultCard = ({ movie, index }) => {
    const movieId = movie.movieId || movie.movie_id || movie.id;
    const isShowingPlot = viewingPlotId === movieId;

    return (
      <div className="result-card fade-in" style={{ animationDelay: `${index * 0.05}s`, display: 'flex', gap: '20px', textAlign: 'left', backgroundColor: 'rgba(20, 20, 30, 0.6)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '15px' }}>
        <div className="rank" style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#888', minWidth: '40px' }}>#{index + 1}</div>
        {movie.poster_url ? (
          <img src={movie.poster_url} alt={movie.title} style={{ width: '60px', height: '90px', borderRadius: '6px', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '60px', height: '90px', backgroundColor: '#333', borderRadius: '6px' }}></div>
        )}
        <div className="result-details" style={{ flexGrow: 1, minWidth: 0 }}>
          <h3 style={{ margin: '0 0 6px 0', fontSize: '1.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{movie.title}</h3>
          <p style={{ fontSize: '0.85rem', color: '#aaa', margin: '0 0 8px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {movie.year} • {Array.isArray(movie.genre) ? movie.genre.join(', ') : movie.genre}
          </p>
          <div style={{ position: 'relative' }}>
            <p style={{ fontSize: '0.9rem', lineHeight: '1.5', color: '#ccc', margin: '0 0 8px 0', display: isShowingPlot ? 'block' : '-webkit-box', WebkitLineClamp: isShowingPlot ? 'unset' : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {movie.description ? movie.description : "No description available."}
            </p>
            {movie.description && (
              <button onClick={(e) => { e.preventDefault(); setViewingPlotId(isShowingPlot ? null : movieId); }} style={{ background: 'transparent', border: '1px solid #555', color: '#fff', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>
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

      {/* UPDATED: Width to 95%, max to 1800px so it stretches cleanly */}
      <div className="content-wrapper" style={{ maxWidth: step >= 2 ? '1800px' : '900px', width: '95%', margin: '0 auto' }}>

        {step === 0 && (
          <div className="hero-section glass-panel fade-in" style={{ padding: '40px' }}>
            <h1 className="glowing-text" style={{ fontSize: '3rem' }}>The Movie Recommender</h1>
            <p style={{ fontSize: '1.2rem', marginBottom: '30px' }}>Discover your next obsession through the power of Machine Learning.</p>
            <button className="btn-primary pulse-btn" style={{ padding: '15px 30px', fontSize: '1.2rem' }} onClick={() => setStep(1)}>
              Find your next favourite movie
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="glass-panel slide-up" style={{ padding: '40px' }}>
            <h2 className="gradient-text" style={{ fontSize: '2rem' }}>Shape Your Profile</h2>
            <div className="setup-section" style={{ marginTop: '30px' }}>
              <label style={{ fontSize: '1.1rem' }}>Select your 3 favourite genres ({selectedGenres.length}/3):</label>
              <div className="genre-cloud" style={{ marginTop: '15px' }}>
                {availableGenres.map(genre => {
                  const isSelected = selectedGenres.includes(genre);
                  return (
                    <button key={genre} className={`genre-pill ${isSelected ? 'selected' : ''}`} onClick={() => toggleGenre(genre)} disabled={!isSelected && selectedGenres.length >= 3}>
                      {genre} {isSelected && '✕'}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="setup-section year-filters" style={{ marginTop: '30px' }}>
              <label style={{ fontSize: '1.1rem' }}>Era Preference:</label>
              <div className="year-inputs" style={{ marginTop: '10px' }}>
                <input type="number" value={minYear} onChange={(e) => setMinYear(e.target.value)} min="1900" max="2024" style={{ fontSize: '1.1rem', padding: '10px' }} />
                <span className="separator" style={{ fontSize: '1.1rem', padding: '0 15px' }}>to</span>
                <input type="number" value={maxYear} onChange={(e) => setMaxYear(e.target.value)} min="1900" max="2024" style={{ fontSize: '1.1rem', padding: '10px' }} />
              </div>
            </div>
            {errorMsg && <div className="error-box" style={{ marginTop: '20px' }}>{errorMsg}</div>}
            <button className="btn-success full-width" style={{ marginTop: '40px', padding: '15px', fontSize: '1.2rem' }} disabled={selectedGenres.length !== 3 || loading} onClick={startGame}>
              {loading ? "Calibrating..." : "Initialize Sequence →"}
            </button>
          </div>
        )}

        {/* UPDATED: Widened layout gap to 40px */}
        {step >= 2 && (
          <div style={{ display: 'flex', gap: '40px', width: '100%', alignItems: 'flex-start', flexWrap: 'nowrap' }}>

            {/* LEFT COLUMN: Main Interaction / Results */}
            {/* UPDATED: Increased flex ratio to 4 so it takes more space */}
            <div style={{ flex: '4 1 0%', minWidth: 0 }}>

              {/* --- STEP 2 CONTENT --- */}
              {step === 2 && gameRounds.length > 0 && (
                <div className="glass-panel slide-up text-center" style={{ width: '100%', boxSizing: 'border-box', padding: '30px' }}>
                  <h3 className="round-counter" style={{ fontSize: '1.5rem' }}>Phase {currentRoundIndex + 1} / 10</h3>
                  <p style={{ fontSize: '1.1rem' }}>Select the movie that sounds the most appealing to you.</p>

                  <div style={{ display: 'flex', gap: '30px', justifyContent: 'center', marginTop: '40px', flexWrap: 'wrap' }}>
                    {gameRounds[currentRoundIndex].map(movie => {
                        const movieId = movie.movieId || movie.movie_id || movie.id;
                        const isShowingPlot = viewingPlotId === movieId;

                        return (
                          <div key={movieId} className="floating-card" onClick={() => handleMoviePick(movie)} style={{ width: '260px', backgroundColor: 'rgba(20, 20, 30, 0.6)', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}>
                            <div style={{ position: 'relative', height: '380px' }}>
                              {movie.poster_url ? (
                                <img src={movie.poster_url} alt={movie.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              ) : (
                                <div style={{ width: '100%', height: '100%', backgroundColor: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                                  <h3 style={{ fontSize: '1.2rem' }}>{movie.title}</h3>
                                </div>
                              )}

                              {isShowingPlot && (
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 15, 20, 0.95)', padding: '20px', overflowY: 'auto', textAlign: 'left', zIndex: 10 }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setViewingPlotId(null); }}>
                                  <h4 style={{ color: '#fff', marginTop: 0, fontSize: '1.1rem' }}>Description</h4>
                                  <p style={{ color: '#ccc', fontSize: '0.95rem', lineHeight: '1.5' }}>{movie.description ? movie.description : "No description available."}</p>
                                </div>
                              )}
                            </div>

                            <div style={{ padding: '15px', display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'space-between' }}>
                              <h4 style={{ margin: '0 0 10px 0', fontSize: '1.1rem', textAlign: 'left' }}>{movie.title}</h4>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span className="hologram-badge" style={{ position: 'static', padding: '4px 10px', fontSize: '0.85rem' }}>{movie.year}</span>
                                <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setViewingPlotId(isShowingPlot ? null : movieId); }} style={{ backgroundColor: isShowingPlot ? '#444' : 'transparent', border: '1px solid #666', color: '#fff', padding: '4px 12px', borderRadius: '6px', fontSize: '0.85rem', zIndex: 20 }}>
                                  {isShowingPlot ? 'Hide' : 'Read'}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* --- STEP 3 CONTENT --- */}
              {step === 3 && (
                <div className="glass-panel zoom-in text-center" style={{ width: '100%', boxSizing: 'border-box', padding: '30px' }}>
                  <h2 className="glowing-text" style={{ fontSize: '2.5rem' }}>Your Recommendations</h2>
                  <p style={{ fontSize: '1.1rem' }}>Based on our two models.</p>

                  <div style={{ display: 'flex', gap: '40px', marginTop: '40px', flexWrap: 'nowrap' }}>

                    <div style={{ flex: '1 1 50%', minWidth: 0, backgroundColor: 'rgba(30, 20, 50, 0.4)', padding: '25px', borderRadius: '15px', border: '1px solid rgba(150, 100, 255, 0.2)', boxSizing: 'border-box' }}>
                      <h3 style={{ color: '#b388ff', marginBottom: '8px', fontSize: '1.5rem' }}>The Network</h3>
                      <p style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: '25px' }}>Neural Collaborative Filtering</p>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {ncfRecommendations.map((movie, index) => <RenderResultCard key={`ncf-${index}`} movie={movie} index={index} />)}
                      </div>
                    </div>

                    <div style={{ flex: '1 1 50%', minWidth: 0, backgroundColor: 'rgba(20, 30, 50, 0.4)', padding: '25px', borderRadius: '15px', border: '1px solid rgba(100, 150, 255, 0.2)', boxSizing: 'border-box' }}>
                      <h3 style={{ color: '#88b3ff', marginBottom: '8px', fontSize: '1.5rem' }}>The Calculator</h3>
                      <p style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: '25px' }}>Singular Value Decomposition</p>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {svdRecommendations.map((movie, index) => <RenderResultCard key={`svd-${index}`} movie={movie} index={index} />)}
                      </div>
                    </div>

                  </div>
                </div>
              )}

            </div>

            {/* RIGHT COLUMN: The Compact Basket */}
            {/* UPDATED: Increased min/max width slightly for better proportion on wide screens */}
            <div className="glass-panel slide-up" style={{ flex: '1 1 0%', minWidth: '320px', maxWidth: '400px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', padding: '25px' }}>
                <h3 className="gradient-text" style={{ fontSize: '1.5rem', marginBottom: '8px' }}>Your Selections</h3>
                <p className="subtext" style={{ fontSize: '0.9rem', marginBottom: '20px' }}>
                    {step === 3 ? "Click to edit." : "Click to change pick."}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {Array.from({ length: 10 }).map((_, i) => {
                        const sel = selectedMovies.find(s => s.roundIndex === i);
                        const isActive = currentRoundIndex === i && step === 2;

                        return (
                            <div key={i} onClick={() => { setStep(2); setCurrentRoundIndex(i); }} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', background: isActive ? 'rgba(100, 150, 255, 0.2)' : 'rgba(0,0,0,0.4)', border: isActive ? '1px solid #6496ff' : '1px solid rgba(255,255,255,0.05)', transition: 'all 0.2s' }}>
                                <span style={{ color: isActive ? '#fff' : '#666', fontWeight: 'bold', width: '20px', textAlign: 'center', fontSize: '1rem' }}>{i + 1}</span>
                                {sel ? (
                                    <>
                                        {sel.movie.poster_url ?
                                            <img src={sel.movie.poster_url} style={{ width: '30px', height: '45px', objectFit: 'cover', borderRadius: '4px' }} />
                                            : <div style={{ width: '30px', height: '45px', background: '#333', borderRadius: '4px' }}></div>
                                        }
                                        <span style={{ fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#fff' }}>{sel.movie.title}</span>
                                    </>
                                ) : (
                                    <span style={{ color: '#555', fontStyle: 'italic', fontSize: '0.95rem', paddingLeft: '42px' }}>Pending...</span>
                                )}
                            </div>
                        )
                    })}
                </div>

                {step === 3 && (
                    <div style={{ marginTop: '30px' }}>
                        <button className="btn-primary full-width" style={{ padding: '15px', fontSize: '1rem' }} onClick={() => {
                            setStep(0);
                            setSelectedGenres([]);
                            setSelectedMovies([]);
                            setNcfRecommendations([]);
                            setSvdRecommendations([]);
                            setViewingPlotId(null);
                        }}>
                            Start Over
                        </button>
                    </div>
                )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}