import React, { useState, useEffect } from 'react';
import AWS from 'aws-sdk';
import './App.css';
import SensorDataTable from './components/SensorDataTable/SensorDataTable';
import Chart from './components/Chart/Chart';
import Alerts from './components/Alerts/Alerts';

// Configure AWS SDK
AWS.config.update({
  region: 'us-east-2', // Update for your AWS region
});

const sns = new AWS.SNS();

function App() {
  const [mockData, setMockData] = useState([]);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [lastMessageTime, setLastMessageTime] = useState(null);
  const [alerts, setAlerts] = useState({});

  // Simulate receiving sensor data
  useEffect(() => {
    const interval = setInterval(() => {
      const newMessage = [
        { id: 'internal_temp', label: 'Internal Temp', value: Math.random() * 100 },
        { id: 'sensor0', label: 'Bottom Temp', value: Math.random() * 100 },
        { id: 'sensor1', label: 'Middle Temp', value: Math.random() * 100 },
        { id: 'sensor2', label: 'Top Temp', value: Math.random() * 100 },
        { id: 'humidity', label: 'Humidity (%)', value: Math.random() * 100 },
        { id: 'smoke_ppm', label: 'Smoke PPM', value: Math.random() * 100 },
      ];

      setMockData(newMessage); // Replace all mock data with new data for simplicity
      setLastMessageTime(new Date());

      if (!isSessionActive) {
        setIsSessionActive(true);
        setSessionStartTime(new Date());
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isSessionActive]);

  // Handle session timeout
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

  // Handle alerts
  useEffect(() => {
    if (isSessionActive && mockData.length > 0) {
      mockData.forEach((dataPoint) => {
        const alert = alerts[dataPoint.id];
        if (alert) {
          if (
            (alert.min !== null && dataPoint.value < alert.min) ||
            (alert.max !== null && dataPoint.value > alert.max)
          ) {
            const message = `${alert.label} value (${dataPoint.value.toFixed(
              2
            )}) breached thresholds: Min (${alert.min}), Max (${alert.max}).`;
            sendAlert(message);
          }
        }
      });
    }
  }, [mockData, alerts, isSessionActive]);

  // Function to send alerts via AWS SNS
  const sendAlert = (message) => {
    const params = {
      Message: message,
      TopicArn: 'arn:aws:sns:us-east-2:<account_id>:SmokehouseAlerts', // Replace <account_id> with your AWS account ID
    };

    sns.publish(params, (err, data) => {
      if (err) {
        console.error('Error sending alert:', err);
      } else {
        console.log('Alert sent:', data);
      }
    });
  };

  // Add new alert thresholds
  const handleSetAlerts = (thresholds) => {
    setAlerts((prev) => ({ ...prev, ...thresholds }));
  };

  // Remove an alert
  const handleRemoveAlert = (sensorId) => {
    setAlerts((prev) => {
      const updated = { ...prev };
      delete updated[sensorId];
      return updated;
    });
  };

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
            <Alerts
              sensors={mockData}
              alerts={alerts}
              onSetAlert={handleSetAlerts}
              onRemoveAlert={handleRemoveAlert}
            />
          </>
        ) : (
          <p>Waiting for smokehouse to turn on...</p>
        )}
      </main>
    </div>
  );
}

export default App;
