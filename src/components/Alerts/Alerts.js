// src/components/Alerts/Alerts.js
import React from 'react';

const Alerts = ({ alerts = [], onClearAlert }) => {
  return (
    <div>
      <h2>Active Alerts</h2>
      {(!alerts || alerts.length === 0) ? (
        <p>No active alerts</p>
      ) : (
        <ul>
          {alerts.map((alert) => (
            <li key={alert.probeId || alert.probeName}>
              <strong>{alert.probeName || alert.probeId}:</strong>
              {alert.min != null && <> Min: {alert.min} </>}
              {alert.max != null && <> Max: {alert.max} </>}
              {alert.current != null && <> Current: {alert.current} </>}
              <button
                style={{ marginLeft: '10px' }}
                onClick={() => onClearAlert && onClearAlert(alert.probeId)}
              >
                Clear Alert
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Alerts;
