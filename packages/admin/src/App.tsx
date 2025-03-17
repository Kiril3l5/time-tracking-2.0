import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

const Dashboard = () => (
  <div className="p-8">
    <h1 className="text-3xl font-bold text-primary">Admin Portal</h1>
    <p className="mt-4">Welcome to the Time Tracking System Admin.</p>
  </div>
);

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
