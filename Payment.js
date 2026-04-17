// models/Payment.js — Support/Donation Payment
// Tracks monetary donations to support BloodLink TN (non-profit)
const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  donor: {
    name:  { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
  },
  amount:      { type: Number, required: true, min: 1 },   // in INR
  currency:    { type: String, default: 'INR' },
  message:     { type: String, trim: true },                // optional note
  // Razorpay fields — filled after payment success
  razorpayOrderId:   { type: String },
  razorpayPaymentId: { type: String },
  razorpaySignature: { type: String },
  status: {
    type:    String,
    enum:    ['created', 'paid', 'failed'],
    default: 'created',
  },
  paidAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
