// Alerts.js
import React, { useEffect, useState } from 'react';
import AWS from 'aws-sdk';
import Modal from 'react-modal';

AWS.config.update({
  region: 'us-east-2',
});

const sns = new AWS.SNS();

Modal.setAppElement('#root'); // Ensure this element exists for accessibility compliance

const Alerts = ({ alerts, onClearAlert }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mobileNumber, setMobileNumber] = useState('');

  useEffect(() => {
    alerts.forEach((alert) => {
      if (alert.active && mobileNumber) {
        sendAlertNotification(alert);
      } else if (alert.active && !mobileNumber) {
        setIsModalOpen(true);
      }
    });
  }, [alerts, mobileNumber]);

  const sendAlertNotification = (alert) => {
    const message = `Smokehouse Probe Alert for ${alert.probeName}. ${alert.min ? `Minimum threshold is ${alert.min}°F.` : ''} ${alert.max ? `Maximum threshold is ${alert.max}°F.` : ''}`;
    
    const params = {
      Message: message,
      PhoneNumber: mobileNumber,
      TopicArn: 'arn:aws:sns:us-east-2:623626440685:SmokehouseAlerts',
      
    };

    sns.publish(params, (err, data) => {
      if (err) {
        console.error('Error sending alert:', err);
      } else {
        console.log('Alert sent successfully:', data);
      }
    });
  };

  const handleSubscribe = () => {
    if (mobileNumber) {
      setIsModalOpen(false);
    } else {
      alert('Please enter a valid mobile number');
    }
  };

  return (
    <div>
      <h2>Active Alerts</h2>
      {alerts.length === 0 ? (
        <p>No active alerts</p>
      ) : (
        <ul>
          {alerts.map((alert) => (
            <li key={alert.probeId}>
              <strong>{alert.probeName}:</strong>
              {alert.min !== null && ` Min: ${alert.min} `}
              {alert.max !== null && ` Max: ${alert.max} `}
              <button
                style={{ marginLeft: '10px' }}
                onClick={() => onClearAlert(alert.probeId)}
              >
                Clear Alert
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Modal for mobile number subscription */}
      <Modal
        isOpen={isModalOpen}
        onRequestClose={() => setIsModalOpen(false)}
        style={{
          content: {
            top: '50%',
            left: '50%',
            right: 'auto',
            bottom: 'auto',
            marginRight: '-50%',
            transform: 'translate(-50%, -50%)',
          },
        }}
      >
        <h2>Subscribe for Alerts</h2>
        <input
          type="text"
          value={mobileNumber}
          onChange={(e) => setMobileNumber(e.target.value)}
          placeholder="Enter your mobile number"
        />
        <button onClick={handleSubscribe}>Subscribe</button>
      </Modal>
    </div>
  );
};

export default Alerts;
