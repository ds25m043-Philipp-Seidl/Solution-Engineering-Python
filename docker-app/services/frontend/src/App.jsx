import React, { useState } from 'react';
import ColdStartGame from './components/ColdStartGame';
import Dashboard from './components/Dashboard';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('game'); // 'game' or 'dashboard'

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
              className={`nav-btn ${activeTab === 'game' ? 'active' : ''}`}
              onClick={() => setActiveTab('game')}
            >
              Cold Start Game
            </button>
            <button
              className={`nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              EDA Dashboard
            </button>
          </div>
        </nav>

        {/* View Router */}
        <main className="view-container fade-in">
          {activeTab === 'game' && <ColdStartGame />}
          {activeTab === 'dashboard' && <Dashboard />}
        </main>
      </div>
    </div>
  );
}