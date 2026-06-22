import React, { useState } from 'react';
import ColdStartGame from './components/ColdStartGame';
import Dashboard from './components/Dashboard';
import MovieSearchGame from './components/MovieSearchGame'; // IMPORT THE NEW COMPONENT
import './App.css';

export default function App() {
  // We'll default to the new Search Game!
  const [activeTab, setActiveTab] = useState('search');

  return (
    <div className="cinematic-container">
      {/* Animated Background Elements */}
      <div className="orb orb-1"></div>
      <div className="orb orb-2"></div>
      <div className="orb orb-3"></div>

      <div className="content-wrapper">
        {/* Navigation Bar */}
        <nav className="glass-panel top-nav">
          <h2 className="logo">🎬 NeuralRec</h2>
          <div className="nav-links">
            <button
              className={`nav-btn ${activeTab === 'search' ? 'active' : ''}`}
              onClick={() => setActiveTab('search')}
            >
              Search & Rate
            </button>
            <button
              className={`nav-btn ${activeTab === 'game' ? 'active' : ''}`}
              onClick={() => setActiveTab('game')}
            >
              Roulette Game
            </button>
            <button
              className={`nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              Latent Explorer
            </button>
          </div>
        </nav>

        {/* View Router */}
        <main className="view-container fade-in">
          {activeTab === 'search' && <MovieSearchGame />}
          {activeTab === 'game' && <ColdStartGame />}
          {activeTab === 'dashboard' && <Dashboard />}
        </main>
      </div>
    </div>
  );
}