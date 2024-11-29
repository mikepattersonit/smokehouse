import React from 'react';
import './App.css';
import SensorDataTable from './components/SensorDataTable/SensorDataTable';
import Chart from './components/Chart/Chart';

function App() {
  const mockData = [
    { timestamp: '10:00', value: 65 },
    { timestamp: '10:05', value: 59 },
    { timestamp: '10:10', value: 80 },
    { timestamp: '10:15', value: 81 },
    { timestamp: '10:20', value: 56 },
    { timestamp: '10:25', value: 55 },
    { timestamp: '10:30', value: 40 },
  ];

  return (
    <div className="App">
      <header className="App-header">
        <h1>Smokehouse Dashboard</h1>
      </header>
      <main>
        <SensorDataTable />
        <Chart data={mockData} />
      </main>
    </div>
  );
}

export default App;
