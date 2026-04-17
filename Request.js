// ═══════════════════════════════════════════
// models/Request.js — Blood Request Schema
//
// When a patient clicks "Request blood",
// a Request document is created.
// The blood bank then approves or declines it.
// ═══════════════════════════════════════════

const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema(
  {
    // Who is making the request?
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  'User',
      required: true,
    },

    // Which blood bank is the request for?
    bank: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  'User',
      required: true,
    },

    // What blood group and how many units?
    bloodGroup: {
      type:     String,
      required: true,
      enum:     ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'],
    },
    units: {
      type:     Number,
      required: true,
      min:      1,
      max:      10,
    },

    // How urgent is this?
    urgency: {
      type:    String,
      enum:    ['normal', 'urgent', 'critical'],
      default: 'normal',
    },

    // Optional note from the patient
    note: {
      type:    String,
      trim:    true,
      default: '',
    },

    // What stage is this request at?
    status: {
      type:    String,
      enum:    ['pending', 'approved', 'rejected', 'fulfilled'],
      default: 'pending',
    },

    // When the bank responded
    respondedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Request', requestSchema);
