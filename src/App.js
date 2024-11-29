import React, { useState, useEffect } from 'react';
import './App.css';
import SensorDataTable from './components/SensorDataTable/SensorDataTable';
import Chart from './components/Chart/Chart';

function App() {
  const [mockData, setMockData] = useState([]);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [lastMessageTime, setLastMessageTime] = useState(null);

  useEffect(() => {
    const interval = setInterval(() => {
      // Simulate receiving a new message
      const newMessage = {
        timestamp: new Date().toLocaleTimeString(),
        value: Math.random() * 100,
      };

      setMockData((prevData) => [...prevData, newMessage]);
      setLastMessageTime(new Date());

      if (!isSessionActive) {
        setIsSessionActive(true);
        setSessionStartTime(new Date());
      }
    }, 5000); // Simulate new data every 5 seconds

    return () => clearInterval(interval); // Cleanup interval on unmount
  }, [isSessionActive]);

  useEffect(() => {
    if (isSessionActive && lastMessageTime) {
      const timeout = setTimeout(() => {
        const now = new Date();
        if (now - lastMessageTime > 45 * 60 * 1000) {
          setIsSessionActive(false);
        }
      }, 1000);

      return () => clearTimeout(timeout);
    }
  }, [lastMessageTime, isSessionActive]);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Smokehouse Dashboard</h1>
        <p>
          {isSessionActive
            ? `Session Active (Started: ${sessionStartTime?.toLocaleString()})`
            : 'No Active Session'}
        </p>
      </header>
      <main>
        {isSessionActive ? (
          <>
            <SensorDataTable />
            <Chart data={mockData} />
          </>
        ) : (
          <p>Waiting for smokehouse to turn on...</p>
        )}
      </main>
    </div>
  );
}

export default App;
