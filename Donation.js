// models/Donation.js — Blood Donation Record
// Tracks every unit of blood received at a bank
const mongoose = require('mongoose');

const donationSchema = new mongoose.Schema({
  bank:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  bloodGroup: { type: String, required: true, enum: ['A+','A-','B+','B-','O+','O-','AB+','AB-'] },
  units:      { type: Number, required: true, min: 1 },
  donorName:  { type: String, trim: true, default: 'Anonymous' },
  donorPhone: { type: String, trim: true },
  donorAge:   { type: Number },
  notes:      { type: String, trim: true },
  donatedAt:  { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('Donation', donationSchema);
