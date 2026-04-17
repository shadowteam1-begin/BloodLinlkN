// ═══════════════════════════════════════════
// utils/sms.js — MSG91 SMS Utility (Step 7)
//
// sendSMS(phone, message)
//   → Sends a single SMS via MSG91
//
// checkAndNotifyAlerts(bloodGroup, district, bankName)
//   → Finds all patients with active alerts for
//     this blood group + district and sends them SMS
//
// HOW TO SET UP MSG91 (FREE):
//   1. Go to msg91.com → Sign up free
//   2. Dashboard → SMS → Templates → Create template
//      Template text: "BloodLink TN: {group} blood is now available in {district} at {bank}. Search: bloodlink.tn"
//   3. Get your AUTH KEY from Dashboard → API
//   4. Paste AUTH KEY and TEMPLATE ID into .env
//   5. Free tier: 100 SMS/month — enough for testing
// ═══════════════════════════════════════════

const axios = require('axios');
const Alert = require('../models/Alert');
const User  = require('../models/User');

const MSG91_URL = 'https://control.msg91.com/api/v5/flow/';

// ── Send a single SMS ─────────────────────
async function sendSMS(phone, message) {
  // Clean phone — ensure it has country code
  const cleaned = phone.replace(/\D/g, '');
  const withCC  = cleaned.startsWith('91') ? cleaned : '91' + cleaned;

  const authKey    = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_TEMPLATE_ID;
  const senderId   = process.env.MSG91_SENDER_ID || 'BLDLNK';

  // If no auth key — log and return (development mode)
  if (!authKey || authKey === 'your_msg91_auth_key_here') {
    console.log('📱  [SMS SIMULATION] To:', withCC, '| Message:', message);
    return { success: true, simulated: true };
  }

  try {
    const res = await axios.post(
      MSG91_URL,
      {
        template_id: templateId,
        sender:      senderId,
        mobiles:     withCC,
        // Variables match your MSG91 template placeholders
        // Adjust variable names to match your actual template
        VAR1: message,
      },
      {
        headers: {
          authkey:        authKey,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log('📱  SMS sent to', withCC, '| Response:', res.data?.message || 'ok');
    return { success: true, data: res.data };
  } catch (err) {
    console.error('📱  SMS failed to', withCC, ':', err.response?.data || err.message);
    throw err;
  }
}

// ── Notify all patients with matching alert ─
// Called after stock update or donation log
async function checkAndNotifyAlerts(bloodGroup, district, bankName) {
  try {
    // Find active alerts for this blood group in this district (or "all")
    const alerts = await Alert.find({
      bloodGroup,
      active: true,
      $or: [
        { district: district },
        { district: '' },
        { district: { $exists: false } },
      ],
    }).populate('patient', 'firstName phone');

    if (alerts.length === 0) return;

    console.log('🔔  Notifying', alerts.length, 'patient(s) about', bloodGroup, 'in', district);

    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    let   notified    = 0;

    for (const alert of alerts) {
      // Rate limit: don't spam — max 1 SMS per 6 hours per alert
      if (alert.lastNotifiedAt && alert.lastNotifiedAt > sixHoursAgo) continue;
      if (!alert.patient || !alert.patient.phone) continue;

      const msg = 'BloodLink TN: ' + bloodGroup + ' blood is now available at ' +
                  bankName + ' in ' + district + '. Search on BloodLink TN.';

      try {
        await sendSMS(alert.patient.phone, msg);
        // Update lastNotifiedAt to prevent spam
        alert.lastNotifiedAt = new Date();
        await alert.save();
        notified++;
      } catch (e) {
        // SMS failed — skip this patient, continue others
      }
    }

    console.log('🔔  Notified', notified, '/', alerts.length, 'patients');
  } catch (err) {
    console.error('Alert notification error:', err.message);
  }
}

module.exports = { sendSMS, checkAndNotifyAlerts };
