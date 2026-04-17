// ═══════════════════════════════════════════
// routes/payments.js — Support Donation Payments
//
// BloodLink TN is a non-profit platform.
// This module lets supporters send money to
// keep the platform running.
//
// Uses Razorpay (Indian payment gateway)
// Test mode: no real money involved
//
// POST /api/payments/create-order  → create Razorpay order
// POST /api/payments/verify        → verify payment signature
// GET  /api/payments/total         → total raised (public)
// GET  /api/payments/mine          → donor's payment history
// ═══════════════════════════════════════════

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const Payment = require('../models/Payment');

// ── Razorpay setup ────────────────────────
// We load Razorpay only if keys are set.
// This prevents crashes when keys are not configured yet.
let razorpay = null;
try {
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_ID !== 'rzp_test_your_key_id_here') {
    const Razorpay = require('razorpay');
    razorpay = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    console.log('💳  Razorpay initialized');
  } else {
    console.log('💳  Razorpay: using simulation mode (set real keys in .env to enable)');
  }
} catch (e) {
  console.log('💳  Razorpay not installed — run: npm install razorpay');
}

// ══════════════════════════════════════════
// POST /api/payments/create-order
// PUBLIC — anyone can donate (no login required)
// Body: { amount, name, email, phone?, message? }
// Returns: { orderId, amount, currency, key }
// ══════════════════════════════════════════
router.post('/create-order', async (req, res) => {
  try {
    const { amount, name, email, phone, message } = req.body;

    if (!amount || amount < 1) {
      return res.status(400).json({ success: false, msg: 'Minimum donation is ₹1' });
    }
    if (!name || !email) {
      return res.status(400).json({ success: false, msg: 'Name and email are required' });
    }

    // Amount in paise (Razorpay uses smallest unit: 100 paise = ₹1)
    const amountPaise = Math.round(parseFloat(amount) * 100);

    let orderId;

    if (razorpay) {
      // Real Razorpay order
      const order = await razorpay.orders.create({
        amount:   amountPaise,
        currency: 'INR',
        receipt:  'bl_' + Date.now(),
        notes:    { name, email, message: message || '' },
      });
      orderId = order.id;
    } else {
      // Simulation mode — generate a fake order ID for demo
      orderId = 'sim_order_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
    }

    // Save pending payment record
    const payment = await Payment.create({
      donor:           { name, email, phone: phone || '' },
      amount:          parseFloat(amount),
      message:         message || '',
      razorpayOrderId: orderId,
      status:          'created',
    });

    res.status(201).json({
      success:  true,
      orderId,
      paymentId: payment._id,
      amount:   amountPaise,
      currency: 'INR',
      key:      process.env.RAZORPAY_KEY_ID || 'DEMO_MODE',
      simMode:  !razorpay,  // tells frontend it's simulation
    });

  } catch (err) {
    console.error('Create order error:', err.message);
    res.status(500).json({ success: false, msg: err.message });
  }
});

// ══════════════════════════════════════════
// POST /api/payments/verify
// Verify Razorpay payment signature (security check)
// Body: { razorpayOrderId, razorpayPaymentId, razorpaySignature, paymentId }
// ══════════════════════════════════════════
router.post('/verify', async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, paymentId } = req.body;

    let isValid = false;

    if (razorpay && razorpaySignature) {
      // Real verification: create HMAC-SHA256 of orderId|paymentId
      const body      = razorpayOrderId + '|' + razorpayPaymentId;
      const expected  = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body)
        .digest('hex');
      isValid = expected === razorpaySignature;
    } else {
      // Simulation mode — always valid
      isValid = true;
    }

    if (!isValid) {
      await Payment.findByIdAndUpdate(paymentId, { status: 'failed' });
      return res.status(400).json({ success: false, msg: 'Payment verification failed' });
    }

    // Mark as paid
    const payment = await Payment.findByIdAndUpdate(
      paymentId,
      {
        status:            'paid',
        razorpayPaymentId: razorpayPaymentId || 'SIM_' + Date.now(),
        razorpaySignature: razorpaySignature || 'simulated',
        paidAt:            new Date(),
      },
      { new: true }
    );

    console.log('💚 Donation received: ₹' + payment.amount + ' from ' + payment.donor.name);

    res.json({
      success: true,
      msg:     'Thank you! ₹' + payment.amount + ' received.',
      payment,
    });

  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

// ══════════════════════════════════════════
// GET /api/payments/total
// PUBLIC — shows total raised on donate page
// ══════════════════════════════════════════
router.get('/total', async (req, res) => {
  try {
    const payments = await Payment.find({ status: 'paid' });
    const total    = payments.reduce((s, p) => s + p.amount, 0);
    const count    = payments.length;
    res.json({ success: true, total, count });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

// ══════════════════════════════════════════
// GET /api/payments/recent
// PUBLIC — recent donors (name + amount only, no email)
// ══════════════════════════════════════════
router.get('/recent', async (req, res) => {
  try {
    const payments = await Payment.find({ status: 'paid' })
      .select('donor.name amount message paidAt')
      .sort({ paidAt: -1 })
      .limit(10);
    res.json({ success: true, payments });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

module.exports = router;
