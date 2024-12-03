// App.js (Main file for the application)
import React, { useState, useEffect } from 'react';
import AWS from 'aws-sdk';
import './App.css';
import Chart from './components/Chart/Chart';
import Alerts from './components/Alerts/Alerts';
import ProbeCard from './components/ProbeCard/ProbeCard';
import axios from 'axios';

AWS.config.update({
  region: 'us-east-2', 
});

const sns = new AWS.SNS();
const apiEndpoint = 'https://w6hf0kxlve.execute-api.us-east-2.amazonaws.com/sensors';
const topicArn = 'arn:aws:sns:us-east-2:623626440685:SmokehouseAlerts';
const meatTypesEndpoint = 'https://o05rs5z8e1.execute-api.us-east-2.amazonaws.com/meatTypes';

function App() {
  const [sensorData, setSensorData] = useState([]);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [lastMessageTime, setLastMessageTime] = useState(null);
  const [assignedMeat, setAssignedMeat] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [probes, setProbes] = useState([
    { id: 'probe1_temp', name: 'Probe 1', minAlert: '', maxAlert: '', mobileNumber: '', meatType: '', meatWeight: '', temperature: null },
    { id: 'probe2_temp', name: 'Probe 2', minAlert: '', maxAlert: '', mobileNumber: '', meatType: '', meatWeight: '', temperature: null },
    { id: 'probe3_temp', name: 'Probe 3', minAlert: '', maxAlert: '', mobileNumber: '', meatType: '', meatWeight: '', temperature: null },
  ]);
  const [smokehouseStatus, setSmokehouseStatus] = useState({
    internal: null,
    top: null,
    middle: null,
    bottom: null,
    humidity: null,
    smokePPM: null
  });

  useEffect(() => {
    const fetchMeatTypes = async () => {
      try {
        console.log('Fetching meat types from API...');
        const response = await axios.get(meatTypesEndpoint);
        if (response.status !== 200) {
          throw new Error(`API error: ${response.statusText}`);
        }
        setAssignedMeat(response.data);
        console.log('Received meat types:', response.data);
      } catch (error) {
        console.error('Error fetching meat types:', error.message);
      }
    };
    fetchMeatTypes();
  }, []); // Removed unnecessary dependency

  useEffect(() => {
    const fetchSensorData = async () => {
      try {
        console.log('Fetching sensor data from API...');
        const response = await axios.get(`${apiEndpoint}?session_id=12345`, {
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.status !== 200) {
          throw new Error(`API error: ${response.statusText}`);
        }

        const data = response.data;
        console.log('Received sensor data:', data);

        if (data && data.length > 0) {
          setSensorData(data);
          setLastMessageTime(new Date());

          if (!isSessionActive) {
            setIsSessionActive(true);
            setSessionStartTime(new Date());
          }

          // Extract smokehouse status from the response data
          const statusData = data.reduce((acc, curr) => {
            if ('internal_temp' in curr) acc.internal = curr.internal_temp;
            if ('top_temp' in curr) acc.top = curr.top_temp;
            if ('middle_temp' in curr) acc.middle = curr.middle_temp;
            if ('bottom_temp' in curr) acc.bottom = curr.bottom_temp;
            if ('humidity' in curr) acc.humidity = curr.humidity;
            if ('smoke_ppm' in curr) acc.smokePPM = curr.smoke_ppm;
            return acc;
          }, {});

          setSmokehouseStatus({ ...statusData });

          // Update probe temperatures
          setProbes((prevProbes) =>
            prevProbes.map(probe => {
              const matchingSensor = data.find(sensor => sensor[probe.id] !== undefined);
              return matchingSensor ? { ...probe, temperature: matchingSensor[probe.id] } : probe;
            })
          );
        } else {
          console.warn('No data received from API');
        }
      } catch (error) {
        console.error('Error fetching sensor data:', error.message);
      }
    };

    const interval = setInterval(fetchSensorData, 5000);
    return () => clearInterval(interval);
  }, [isSessionActive]);

  const handleSetAlert = (id, min, max, mobileNumber) => {
    setProbes((prevProbes) =>
      prevProbes.map((probe) =>
        probe.id === id ? { ...probe, minAlert: min, maxAlert: max, mobileNumber: mobileNumber } : probe
      )
    );

    // Update alerts state
    setAlerts((prevAlerts) => [
      ...prevAlerts,
      { probeId: id, min, max, probeName: `Probe ${id}`, active: true }
    ]);

    sns.publish({
      Message: `Alert set for Probe ${id}: Min=${min}, Max=${max}`,
      PhoneNumber: mobileNumber,
      TopicArn: topicArn,
    }, (err, data) => {
      if (err) {
        console.error('Error sending alert:', err);
      } else {
        console.log('Alert sent successfully:', data);
      }
    });
  };

  const handleMeatChange = (id, meatType, meatWeight) => {
    setProbes((prevProbes) =>
      prevProbes.map((probe) =>
        probe.id === id ? { ...probe, meatType, meatWeight } : probe
      )
    );
  };

  return (
    <div className="app-container">
      <h1>SmokeGPT - AI Powered Smokehouse</h1>

      <div className="layout-container">
        <div className="left-column">
          <div className="probe-card">
            <h3>Smokehouse Status</h3>
            <p>Internal: {smokehouseStatus.internal !== null ? smokehouseStatus.internal : 'N/A'}</p>
            <p>Top: {smokehouseStatus.top !== null ? smokehouseStatus.top : 'N/A'}</p>
            <p>Middle: {smokehouseStatus.middle !== null ? smokehouseStatus.middle : 'N/A'}</p>
            <p>Bottom: {smokehouseStatus.bottom !== null ? smokehouseStatus.bottom : 'N/A'}</p>
            <p>Humidity: {smokehouseStatus.humidity !== null ? smokehouseStatus.humidity : 'N/A'}</p>
            <p>Smoke PPM: {smokehouseStatus.smokePPM !== null ? smokehouseStatus.smokePPM : 'N/A'}</p>
          </div>

          {probes && probes.length > 0 && probes.map((probe) => (
            <ProbeCard
              key={probe.id}
              probe={probe}
              onSetAlert={handleSetAlert}
              onMeatChange={handleMeatChange}
              meatTypes={assignedMeat || []}
              minTemp={0}
              maxTemp={300}
              temperature={probe.temperature}
            />
          ))}
        </div>

        <div className="right-column">
          {sensorData && sensorData.length > 0 && <Chart data={sensorData} />}
        </div>
      </div>

      {alerts && alerts.length > 0 && <Alerts alerts={alerts} />}
    </div>
  );
}

export default App;
