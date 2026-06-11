import React, { useState } from 'react';
import './App.css';

export default function App() {
  // Game State
  const [step, setStep] = useState(1); // 1: Setup, 2: Game Loop, 3: Results
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Step 1: User Preferences
  const [selectedGenre, setSelectedGenre] = useState('');
  const [minYear, setMinYear] = useState(1990);
  const [maxYear, setMaxYear] = useState(2024);

  // Step 2: Game Variables
  const [gameRounds, setGameRounds] = useState([]); // Array of 10 arrays (3 movies each)
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [selectedMovies, setSelectedMovies] = useState([]); // Array of chosen IDs

  // Step 3: ML Results
  const [recommendations, setRecommendations] = useState([]);

  // --- API CALL: Fetch the 30 movies to start the game ---
  const startGame = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const response = await fetch('http://localhost:3000/api/start-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          genre: selectedGenre,
          min_year: parseInt(minYear),
          max_year: parseInt(maxYear)
        })
      });

      const data = await response.json();
      if (data.success) {
        setGameRounds(data.rounds);
        setSelectedMovies([]);
        setCurrentRoundIndex(0);
        setStep(2); // Move to the game phase
      } else {
        setErrorMsg(data.error || "Failed to start game.");
      }
    } catch (error) {
      console.error(error);
      setErrorMsg("Could not reach the backend server.");
    } finally {
      setLoading(false);
    }
  };

  // --- API CALL: Send the 10 picks to the ML Engine ---
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
        setStep(3); // Move to results
      }
    } catch (error) {
      console.error(error);
      setErrorMsg("Error generating recommendations.");
    } finally {
      setLoading(false);
    }
  };

  // --- GAME LOGIC: Handle user picking a movie in a round ---
  const handleMoviePick = (movieId) => {
    const newSelectedMovies = [...selectedMovies, movieId];
    setSelectedMovies(newSelectedMovies);

    if (currentRoundIndex < 9) {
      // Go to next round
      setCurrentRoundIndex(currentRoundIndex + 1);
    } else {
      // Game Over! We have 10 picks. Send them to the ML engine.
      getRecommendations(newSelectedMovies);
    }
  };

  // --- UI RENDERING ---
  return (
    <div className="app-container">
      <header>
        <h1>🎬 Startup Recommender</h1>
      </header>

      {/* STEP 1: SETUP (Genre & Year) */}
      {step === 1 && (
        <div className="card">
          <h2>Step 1: Set the Vibe</h2>

          <div className="setup-section">
            <label>Pick a Genre:</label>
            <div className="btn-grid">
              {["Sci-Fi", "Action", "Comedy", "Thriller", "Drama", "Romance", "Horror"].map(genre => (
                <button
                  key={genre}
                  className={selectedGenre === genre ? "btn-active" : "btn-primary"}
                  onClick={() => setSelectedGenre(genre)}
                >
                  {genre}
                </button>
              ))}
            </div>
          </div>

          <div className="setup-section year-filters">
            <label>Release Year Range:</label>
            <div className="year-inputs">
              <input
                type="number"
                value={minYear}
                onChange={(e) => setMinYear(e.target.value)}
                min="1900" max="2024"
              />
              <span> to </span>
              <input
                type="number"
                value={maxYear}
                onChange={(e) => setMaxYear(e.target.value)}
                min="1900" max="2024"
              />
            </div>
          </div>

          {errorMsg && <div className="error-box">{errorMsg}</div>}

          <button
            className="btn-success full-width"
            disabled={!selectedGenre || loading}
            onClick={startGame}
          >
            {loading ? "Loading Game..." : "Start the Setup Game →"}
          </button>
        </div>
      )}

      {/* STEP 2: THE 10-ROUND GAME */}
      {step === 2 && gameRounds.length > 0 && (
        <div className="card text-center">
          <h2>Round {currentRoundIndex + 1} of 10</h2>
          <p>Which of these 3 movies do you prefer?</p>

          <div className="game-board">
            {gameRounds[currentRoundIndex].map(movie => (
              <div
                key={movie.movie_id || movie.id}
                className="tinder-card"
                onClick={() => handleMoviePick(movie.movie_id || movie.id)}
              >
                <div className="card-content">
                  <h3>{movie.title}</h3>
                  <span className="year-badge">{movie.year}</span>
                </div>
              </div>
            ))}
          </div>

          <p className="subtext">Pick one to advance. (Picks so far: {selectedMovies.length})</p>
        </div>
      )}

      {/* STEP 3: RESULTS (Recommendations) */}
      {step === 3 && (
        <div className="card">
          <h2>✨ Your Live Personal Recommendations</h2>
          <p>Based on your 10 picks, the SVD model calculated your exact taste profile:</p>

          <div className="results-box">
            {recommendations.map((movie, index) => (
              <div key={index} className="result-item">
                <span className="movie-icon">🍿</span>
                <div>
                  <h3>{movie.title}</h3>
                  <span>{movie.year} • {movie.genre}</span>
                </div>
              </div>
            ))}
          </div>

          <button
            className="btn-primary full-width"
            onClick={() => {
              setStep(1);
              setSelectedGenre('');
              setRecommendations([]);
            }}
          >
            Play Again
          </button>
        </div>
      )}
    </div>
  );
}