// ═══════════════════════════════════════════
// models/Stock.js — Blood Inventory Schema
//
// Each blood bank has ONE stock document.
// It stores units for all 8 blood groups.
// When a bank updates stock → this document
// is updated → patients see new data live.
// ═══════════════════════════════════════════

const mongoose = require('mongoose');

const stockSchema = new mongoose.Schema(
  {
    // Which blood bank owns this stock?
    // ref: 'User' means it links to the User model
    bank: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',   // JOIN with User collection
      required: true,
      unique:   true,     // one stock doc per bank
    },

    // Units for each blood group
    // default: 0 means starts at zero
    'A+'  : { type: Number, default: 0, min: 0 },
    'A-'  : { type: Number, default: 0, min: 0 },
    'B+'  : { type: Number, default: 0, min: 0 },
    'B-'  : { type: Number, default: 0, min: 0 },
    'O+'  : { type: Number, default: 0, min: 0 },
    'O-'  : { type: Number, default: 0, min: 0 },
    'AB+' : { type: Number, default: 0, min: 0 },
    'AB-' : { type: Number, default: 0, min: 0 },

    // When the bank last updated their stock
    lastUpdatedAt: {
      type:    Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Stock', stockSchema);
