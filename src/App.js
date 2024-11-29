import React from 'react';
import './App.css';
import SensorDataTable from './components/SensorDataTable/SensorDataTable';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Smokehouse Dashboard</h1>
      </header>
      <main>
        <SensorDataTable />
      </main>
    </div>
  );
}

export default App;
