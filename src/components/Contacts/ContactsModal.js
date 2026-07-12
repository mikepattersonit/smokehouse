// src/components/Contacts/ContactsModal.js
import React, { useEffect, useState, useCallback } from "react";
import "./ContactsModal.css";
import { fetchAlertContacts, saveAlertContact, deleteAlertContact } from "../../api";

function formatPhone(e164) {
  const digits = String(e164 || "").replace(/\D/g, "").replace(/^1/, "");
  if (digits.length !== 10) return e164;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function ContactsModal({ onClose }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const items = await fetchAlertContacts();
    setContacts(items);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = useCallback(async (e) => {
    e.preventDefault();
    if (!phone.trim()) return;
    setSaving(true);
    setError("");
    try {
      await saveAlertContact({ phoneNumber: phone.trim(), name: name.trim() || undefined, enabled: true });
      setName("");
      setPhone("");
      await load();
    } catch (err) {
      setError(err?.message || "Failed to add contact");
    } finally {
      setSaving(false);
    }
  }, [name, phone, load]);

  const handleToggle = useCallback(async (contact) => {
    setContacts((prev) => prev.map((c) =>
      c.phone_number === contact.phone_number ? { ...c, enabled: !c.enabled } : c
    ));
    try {
      await saveAlertContact({ phoneNumber: contact.phone_number, enabled: !contact.enabled });
    } catch {
      setError("Failed to update contact — please try again.");
      await load();
    }
  }, [load]);

  const handleDelete = useCallback(async (contact) => {
    setContacts((prev) => prev.filter((c) => c.phone_number !== contact.phone_number));
    try {
      await deleteAlertContact(contact.phone_number);
    } catch {
      setError("Failed to remove contact — please try again.");
      await load();
    }
  }, [load]);

  return (
    <div className="contacts-modal-backdrop" onClick={onClose}>
      <div className="contacts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="contacts-modal__header">
          <span>🔔 Alert Contacts</span>
          <button className="contacts-modal__close" onClick={onClose}>✕</button>
        </div>

        <div className="contacts-modal__body">
          <p className="contacts-modal__hint">
            Anyone on this list gets a text when a probe crosses its min/max threshold —
            no need to configure a number per probe.
          </p>

          {loading ? (
            <div className="contacts-modal__loading">Loading…</div>
          ) : contacts.length === 0 ? (
            <div className="contacts-modal__empty">No contacts added yet.</div>
          ) : (
            <ul className="contacts-list">
              {contacts.map((c) => (
                <li key={c.phone_number} className="contacts-list__row">
                  <div className="contacts-list__info">
                    <span className="contacts-list__name">{c.name || "Unnamed"}</span>
                    <span className="contacts-list__phone">{formatPhone(c.phone_number)}</span>
                  </div>
                  <label className="contacts-list__toggle">
                    <input
                      type="checkbox"
                      checked={c.enabled !== false}
                      onChange={() => handleToggle(c)}
                    />
                    <span>{c.enabled !== false ? "On" : "Off"}</span>
                  </label>
                  <button
                    className="contacts-list__delete"
                    onClick={() => handleDelete(c)}
                    aria-label={`Remove ${c.name || c.phone_number}`}
                  >
                    🗑
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form className="contacts-add-form" onSubmit={handleAdd}>
            <input
              type="text"
              placeholder="Name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              type="tel"
              placeholder="Phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
            <button type="submit" disabled={saving || !phone.trim()}>
              {saving ? "Adding…" : "+ Add"}
            </button>
          </form>

          {error && <div className="contacts-modal__error">{error}</div>}

          <p className="contacts-modal__disclosure">
            Smokehouse Alerts: by adding a number above you're opting that person in to
            receive SMS temperature alerts for this household smoker. Message frequency
            varies with cooking activity (occasional, only on threshold breaches). Reply
            STOP to any alert text to opt out at any time. Msg &amp; data rates may apply.
            Questions? Contact mike@pattersonfam.com.
          </p>
        </div>
      </div>
    </div>
  );
}

export default ContactsModal;
