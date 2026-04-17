// ═══════════════════════════════════════════
// models/Alert.js — Availability Alert Schema
//
// When a patient sets an alert for "B+ in Salem",
// an Alert document is stored.
// Step 7 (SMS) will check these and notify
// patients when stock arrives.
// ═══════════════════════════════════════════

const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema(
  {
    patient: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
    },
    bloodGroup: {
      type:     String,
      required: true,
      enum:     ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'],
    },
    district: {
      type:    String,
      default: '', // empty = all districts
    },
    active: {
      type:    Boolean,
      default: true,
    },
    // When was the last SMS sent for this alert?
    // (prevents spam — max 1 per 6 hours)
    lastNotifiedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Alert', alertSchema);
