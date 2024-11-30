import React, { useState, useEffect } from 'react';
import AWS from 'aws-sdk';
import './App.css';
import SensorDataTable from './components/SensorDataTable/SensorDataTable';
import Chart from './components/Chart/Chart';
import Alerts from './components/Alerts/Alerts';
import MeatAssignment from './components/MeatAssignment/MeatAssignment';

// AWS Configuration
AWS.config.update({
  region: 'us-east-2', // Ensure this matches your AWS region
});

const sns = new AWS.SNS();

function App() {
  const [sensorData, setSensorData] = useState([]);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [lastMessageTime, setLastMessageTime] = useState(null);
  const [alerts, setAlerts] = useState({});
  const [mobileNumber, setMobileNumber] = useState('');
  const [subscribedNumbers, setSubscribedNumbers] = useState([]);
  const [assignedMeat, setAssignedMeat] = useState([]);

  const topicArn = 'arn:aws:sns:us-east-2:<account_id>:SmokehouseAlerts'; // Replace <account_id> with your AWS account ID
  const apiEndpoint = 'https://w6hf0kxlve.execute-api.us-east-2.amazonaws.com/sensors'; // Replace with your API Gateway URL

  const mockProbes = [
    { id: 'probe1', label: 'Probe 1' },
    { id: 'probe2', label: 'Probe 2' },
    { id: 'probe3', label: 'Probe 3' },
  ];

  const mockMeatTypes = [
    { id: 1, name: 'Brisket' },
    { id: 2, name: 'Pork Shoulder' },
    { id: 3, name: 'Ribs' },
    { id: 4, name: 'Chicken' },
    { id: 5, name: 'Turkey' },
  ];

  // Fetch sensor data from the API Gateway
  useEffect(() => {
    const fetchSensorData = async () => {
      try {
        console.log('Fetching sensor data from API...');
        const response = await fetch(`${apiEndpoint}?session_id=12345`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Received sensor data:', data);

        if (data && data.length > 0) {
          setSensorData(data);
          setLastMessageTime(new Date());

          if (!isSessionActive) {
            setIsSessionActive(true);
            setSessionStartTime(new Date());
          }
        } else {
          console.warn('No data received from API');
        }
      } catch (error) {
        console.error('Error fetching sensor data:', error);
      }
    };

    const interval = setInterval(fetchSensorData, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, [isSessionActive, apiEndpoint]);

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
    if (isSessionActive && sensorData.length > 0) {
      sensorData.forEach((dataPoint) => {
        const alert = alerts[dataPoint.id];
        if (alert) {
          if (
            (alert.min !== null && dataPoint.value < alert.min) ||
            (alert.max !== null && dataPoint.value > alert.max)
          ) {
            const message = `${dataPoint.label} value (${dataPoint.value.toFixed(
              2
            )}) breached thresholds: Min (${alert.min}), Max (${alert.max}).`;
            sendAlert(message);
          }
        }
      });
    }
  }, [sensorData, alerts, isSessionActive]);

  // Function to send alerts via AWS SNS
  const sendAlert = (message) => {
    const params = {
      Message: message,
      TopicArn: topicArn,
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

  // Subscribe a new mobile number
  const handleSubscribe = (e) => {
    e.preventDefault();
    if (!mobileNumber) {
      alert('Please enter a valid mobile number');
      return;
    }

    const params = {
      Protocol: 'SMS',
      TopicArn: topicArn,
      Endpoint: mobileNumber,
    };

    sns.subscribe(params, (err, data) => {
      if (err) {
        console.error('Error subscribing number:', err);
        alert('Failed to subscribe the number. Check the console for details.');
      } else {
        console.log('Successfully subscribed:', data);
        setSubscribedNumbers((prev) => [...prev, mobileNumber]);
        setMobileNumber('');
        alert(`Number ${mobileNumber} subscribed successfully!`);
      }
    });
  };

  // Handle meat assignment
  const handleAssignMeat = (assignment) => {
    setAssignedMeat((prev) => [...prev, assignment]);
  };

  // Remove a meat assignment
  const handleRemoveMeatAssignment = (indexToRemove) => {
    setAssignedMeat((prev) => prev.filter((_, index) => index !== indexToRemove));
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
            <SensorDataTable data={sensorData} />
            <Chart data={sensorData} />
            <Alerts
              sensors={sensorData}
              alerts={alerts}
              onSetAlert={handleSetAlerts}
              onRemoveAlert={handleRemoveAlert}
            />
            <h3>Subscribe to Alerts</h3>
            <form onSubmit={handleSubscribe}>
              <label>
                Mobile Number:
                <input
                  type="tel"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  placeholder="+1234567890"
                  required
                />
              </label>
              <button type="submit">Subscribe</button>
            </form>
            <h4>Subscribed Numbers:</h4>
            <ul>
              {subscribedNumbers.map((number, index) => (
                <li key={index}>{number}</li>
              ))}
            </ul>
            <MeatAssignment
              probes={mockProbes}
              meatTypes={mockMeatTypes}
              onAssignMeat={handleAssignMeat}
            />
            <h3>Assigned Meat</h3>
            <ul>
              {assignedMeat.map((assignment, index) => (
                <li key={index}>
                  Probes: {assignment.probes.join(', ')} - {assignment.meat} (
                  {assignment.weight} lbs)
                  <button
                    style={{ marginLeft: '10px' }}
                    onClick={() => handleRemoveMeatAssignment(index)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>Waiting for smokehouse to turn on...</p>
        )}
      </main>
    </div>
  );
}

export default App;
