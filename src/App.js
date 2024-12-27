// App.js (Corrected and Complete)
import React, { useState, useEffect } from 'react';
import AWS from 'aws-sdk';
import './App.css';
import Chart from './components/Chart/Chart';
import Alerts from './components/Alerts/Alerts';
import ProbeCard from './components/ProbeCard/ProbeCard';
import ProbeChart from './components/ProbeCard/ProbeChart';
import axios from 'axios';

AWS.config.update({
  region: 'us-east-2',
});

const sns = new AWS.SNS();
const apiEndpoint = 'https://w6hf0kxlve.execute-api.us-east-2.amazonaws.com/sensors';
const topicArn = 'arn:aws:sns:us-east-2:623626440685:SmokehouseAlerts';
const meatTypesEndpoint = 'https://o05rs5z8e1.execute-api.us-east-2.amazonaws.com/meatTypes';
const probeAssignmentEndpoint = 'https://hgrhqnwar6.execute-api.us-east-2.amazonaws.com/ManageProbeAssignment';

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
    outside: null,
    top: null,
    middle: null,
    bottom: null,
    humidity: null,
    smokePPM: null,
  });

  // Reusable function to fetch the latest session ID
  const fetchMaxSessionId = async () => {
    const dynamodb = new AWS.DynamoDB.DocumentClient();
    const sessionResponse = await dynamodb.scan({
      TableName: 'sensor_data', // Ensure this matches your table name
      ProjectionExpression: 'session_id',
    }).promise();

    const sessionIds = sessionResponse.Items.map(item => parseInt(item.session_id, 10));
    return Math.max(...sessionIds); // Return the latest session ID
  };

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
  }, []);

  useEffect(() => {
    const fetchSensorData = async () => {
      try {
        console.log('Fetching sensor data from API...');
        const response = await axios.get(`${apiEndpoint}?session_id=12345`, {
          headers: { 'Content-Type': 'application/json' },
        });

        if (response.status !== 200) {
          throw new Error(`API error: ${response.statusText}`);
        }

        const data = response.data;
        setSensorData(data);
        setLastMessageTime(new Date());

        if (!isSessionActive && data.length > 0) {
          setIsSessionActive(true);
          setSessionStartTime(new Date());
        }

        const statusData = data.reduce((acc, curr) => {
          if ('internal_temp' in curr) acc.outside = curr.internal_temp;
          if ('top_temp' in curr) acc.top = curr.top_temp;
          if ('middle_temp' in curr) acc.middle = curr.middle_temp;
          if ('bottom_temp' in curr) acc.bottom = curr.bottom_temp;
          if ('humidity' in curr) acc.humidity = curr.humidity;
          if ('smoke_ppm' in curr) acc.smokePPM = curr.smoke_ppm;
          return acc;
        }, {});

        setSmokehouseStatus({ ...statusData });

        setProbes((prevProbes) =>
          prevProbes.map(probe => {
            const matchingSensor = data.find(sensor => sensor[probe.id] !== undefined);
            return matchingSensor ? { ...probe, temperature: matchingSensor[probe.id] } : probe;
          })
        );
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

    setAlerts((prevAlerts) => [
      ...prevAlerts,
      { probeId: id, min, max, probeName: `Probe ${id}`, active: true },
    ]);

    sns.publish(
      {
        Message: `Alert set for Probe ${id}: Min=${min}, Max=${max}`,
        PhoneNumber: mobileNumber,
        TopicArn: topicArn,
      },
      (err, data) => {
        if (err) {
          console.error(`Error sending alert for Probe ${id}:`, err.message);
        } else {
          console.log(`Alert sent successfully for Probe ${id}:`, data);
        }
      }
    );
  };

 const handleMeatChange = async (id, meatType, meatWeight) => {
  setProbes((prevProbes) =>
    prevProbes.map((probe) =>
      probe.id === id ? { ...probe, meatType, meatWeight } : probe
    )
  );

    try {
      // Save meat assignment to the database via the new endpoint
      await axios.post(probeAssignmentEndpoint, {
        probeId: id,
        meatType,
        meatWeight,
        sessionId: '12345', // Use appropriate session ID
      });
      console.log('Probe assignment saved successfully');
    } catch (error) {
      console.error('Error saving probe assignment:', error.message);
    }
  };

  return (
    <div className="app-container">
      <h1>SmokeGPT - AI Powered Smokehouse</h1>

      <div className="layout-container">
        <div className="left-column">
          <div className="smokehouse-status-container" style={{ display: 'flex', alignItems: 'flex-start' }}>
            <div className="probe-card" style={{ marginLeft: '20px', marginRight: '10px' }}>
              <h3>Smokehouse Status</h3>
              <p>Outside Temp: {smokehouseStatus.outside !== null ? smokehouseStatus.outside : 'N/A'}</p>
              <p>Top: {smokehouseStatus.top !== null ? smokehouseStatus.top : 'N/A'}</p>
              <p>Middle: {smokehouseStatus.middle !== null ? smokehouseStatus.middle : 'N/A'}</p>
              <p>Bottom: {smokehouseStatus.bottom !== null ? smokehouseStatus.bottom : 'N/A'}</p>
              <p>Humidity: {smokehouseStatus.humidity !== null ? smokehouseStatus.humidity : 'N/A'}</p>
              <p>Smoke PPM: {smokehouseStatus.smokePPM !== null ? smokehouseStatus.smokePPM : 'N/A'}</p>
            </div>
            <div className="smokehouse-chart-container" style={{ flex: 1 }}>
              {sensorData && sensorData.length > 0 && <Chart data={sensorData} />} {/* Updated Chart component */}
            </div>
          </div>

          {probes && probes.length > 0 && probes.map((probe) => (
            <div key={probe.id} className="probe-container" style={{ display: 'flex', alignItems: 'center' }}>
              <ProbeCard
                probe={probe}
                onSetAlert={handleSetAlert}
                onMeatChange={handleMeatChange}
                meatTypes={assignedMeat || []}
              />
              <div className="probe-chart-container" style={{ flex: 1, marginLeft: '10px' }}>
                <ProbeChart probe={probe} data={sensorData} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {alerts && alerts.length > 0 && <Alerts alerts={alerts} />}
    </div>
  );
}

export default App;
