// src/components/Alerts/Alerts.js
import React, { useEffect, useState, useCallback, useRef } from 'react';
import AWS from 'aws-sdk';
import Modal from 'react-modal';

// ---- AWS SNS setup (browser) ----
// You must provide credentials (e.g., via Amplify/Cognito) for this to work client-side.
// If you prefer server-side send, call your API instead of SNS.publish here.
AWS.config.update({ region: 'us-east-2' });
const sns = new AWS.SNS();

// Optional: publish to a topic instead of direct phone number.
// Set in your CRA env as REACT_APP_SNS_TOPIC_ARN
const TOPIC_ARN = process.env.REACT_APP_SNS_TOPIC_ARN || '';

Modal.setAppElement('#root'); // accessibility

const Alerts = ({ alerts = [], onClearAlert }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mobileNumber, setMobileNumber] = useState('');

  // keep track of what we've already notified on to avoid duplicates
  const notifiedRef = useRef(new Set());

  const normalizeUsPhone = useCallback((raw) => {
    if (!raw) return null;
    const digits = ('' + raw).replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    if (/^\+[\d]+$/.test(raw.trim())) return raw.trim();
    return null;
  }, []);

  const getAlertKey = useCallback((alert) => {
    // Compose a stable key for de-duping notifications
    const { probeId, probeName, min, max, type, sessionId } = alert || {};
    return [
      sessionId || 'session',
      probeId || probeName || 'probe',
      type || 'threshold',
      (min ?? 'NA'),
      (max ?? 'NA'),
    ].join('|');
  }, []);

  const sendAlertNotification = useCallback(
    async (alert) => {
      const normalized = normalizeUsPhone(mobileNumber);
      if (!normalized && !TOPIC_ARN) {
        throw new Error('No valid phone number or Topic ARN configured.');
      }

      const messageParts = [
        `Smokehouse Alert`,
        alert?.probeName ? `• Probe: ${alert.probeName}` : null,
        alert?.itemName ? `• Item: ${alert.itemName}` : null,
        alert?.type ? `• Type: ${alert.type}` : null,
        alert?.min != null ? `• Min: ${alert.min}°F` : null,
        alert?.max != null ? `• Max: ${alert.max}°F` : null,
        alert?.current != null ? `• Current: ${alert.current}°F` : null,
      ].filter(Boolean);

      const message = messageParts.join('\n');

      const params = {
        Message: message,
        MessageAttributes: {
          'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' },
        },
      };

      if (TOPIC_ARN) {
        params.TopicArn = TOPIC_ARN;
      } else {
        params.PhoneNumber = normalized; // direct SMS
      }

      return new Promise((resolve, reject) => {
        sns.publish(params, (err, data) => {
          if (err) {
            console.error('Error sending alert:', err);
            reject(err);
          } else {
            console.log('Alert sent successfully:', data);
            resolve(data);
          }
        });
      });
    },
    [mobileNumber, normalizeUsPhone]
  );

  const maybeNotify = useCallback(
    async (alert) => {
      if (!alert?.active) return;
      const key = getAlertKey(alert);
      if (notifiedRef.current.has(key)) return;

      await sendAlertNotification(alert);
      notifiedRef.current.add(key);
    },
    [getAlertKey, sendAlertNotification]
  );

  useEffect(() => {
    if (!alerts?.length) return;
    const hasActive = alerts.some((a) => a?.active);
    if (!hasActive) return;

    // If we have active alerts but no phone and no Topic ARN, prompt for phone
    if (!mobileNumber && !TOPIC_ARN) {
      setIsModalOpen(true);
      return;
    }

    // Fire notifications for any new active alerts (deduped)
    (async () => {
      for (const alert of alerts) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await maybeNotify(alert);
        } catch (e) {
          // errors already logged in sendAlertNotification
        }
      }
    })();
  }, [alerts, mobileNumber, maybeNotify]);

  const handleSubscribe = useCallback(() => {
    const normalized = normalizeUsPhone(mobileNumber);
    if (!normalized) {
      // eslint-disable-next-line no-alert
      alert('Please enter a valid US phone number (e.g., 555-123-4567).');
      return;
    }
    setMobileNumber(normalized);
    setIsModalOpen(false);
  }, [mobileNumber, normalizeUsPhone]);

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

      {/* Modal for mobile number subscription (only shown if not using a Topic ARN) */}
      {!TOPIC_ARN && (
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
              maxWidth: 420,
              width: '90%',
            },
          }}
        >
          <h2>Subscribe for Alerts</h2>
          <p>Enter a US mobile number to receive SMS alerts.</p>
          <input
            type="tel"
            value={mobileNumber}
            onChange={(e) => setMobileNumber(e.target.value)}
            placeholder="e.g., 555-123-4567"
            style={{ width: '100%', padding: 8, marginBottom: 12 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSubscribe}>Subscribe</button>
            <button onClick={() => setIsModalOpen(false)} className="secondary">
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Alerts;
