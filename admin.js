// ═══════════════════════════════════════════
// routes/admin.js — Admin Panel API
//
// All routes require role: 'admin'
//
// GET  /api/admin/stats          → dashboard stats
// GET  /api/admin/users          → all users
// PUT  /api/admin/users/:id/verify   → approve blood bank
// PUT  /api/admin/users/:id/block    → block user
// DELETE /api/admin/users/:id    → delete user
// GET  /api/admin/banks          → all blood banks + stock
// GET  /api/admin/requests       → all requests
// GET  /api/admin/donations      → all blood donations
// GET  /api/admin/payments       → all support payments
// GET  /api/admin/alerts         → all alerts
// POST /api/admin/broadcast      → send SMS to all patients
// ═══════════════════════════════════════════

const express  = require('express');
const router   = express.Router();
const User     = require('../models/User');
const Stock    = require('../models/Stock');
const Request  = require('../models/Request');
const Alert    = require('../models/Alert');
const Donation = require('../models/Donation');
const Payment  = require('../models/Payment');
const { protect, authorize } = require('../middleware/auth');
const { sendSMS } = require('../utils/sms');

// All admin routes need login + admin role
router.use(protect, authorize('admin'));

// ══════════════════════════════════════════
// GET /api/admin/stats
// Platform-wide dashboard numbers
// ══════════════════════════════════════════
router.get('/stats', async (req, res) => {
  try {
    const [
      totalPatients, totalBanks, totalHospitals, pendingBanks,
      totalRequests, pendingRequests, approvedRequests,
      totalAlerts, activeAlerts,
      totalDonations, totalPayments,
    ] = await Promise.all([
      User.countDocuments({ role: 'patient' }),
      User.countDocuments({ role: 'bloodbank', isVerified: true }),
      User.countDocuments({ role: 'hospital' }),
      User.countDocuments({ role: 'bloodbank', isVerified: false }),
      Request.countDocuments(),
      Request.countDocuments({ status: 'pending' }),
      Request.countDocuments({ status: 'approved' }),
      Alert.countDocuments(),
      Alert.countDocuments({ active: true }),
      Donation.countDocuments(),
      Payment.countDocuments({ status: 'paid' }),
    ]);

    // Total blood units across all banks
    const stocks = await Stock.find();
    const totalUnits = stocks.reduce((sum, s) => {
      return sum + ['A+','A-','B+','B-','O+','O-','AB+','AB-'].reduce((g, k) => g + (s[k] || 0), 0);
    }, 0);

    // Total money raised
    const payments  = await Payment.find({ status: 'paid' });
    const totalRaised = payments.reduce((s, p) => s + p.amount, 0);

    res.json({
      success: true,
      stats: {
        users:    { patients: totalPatients, banks: totalBanks, hospitals: totalHospitals, pendingApproval: pendingBanks },
        requests: { total: totalRequests, pending: pendingRequests, approved: approvedRequests },
        alerts:   { total: totalAlerts, active: activeAlerts },
        blood:    { totalUnits, totalDonations },
        payments: { count: totalPayments, totalRaised },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

// ══════════════════════════════════════════
// GET /api/admin/users?role=bloodbank&verified=false
// ══════════════════════════════════════════
router.get('/users', async (req, res) => {
  try {
    const filter = {};
    if (req.query.role)     filter.role     = req.query.role;
    if (req.query.verified !== undefined) filter.isVerified = req.query.verified === 'true';
    if (req.query.district) filter.district = req.query.district;

    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, count: users.length, users });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

// ══════════════════════════════════════════
// PUT /api/admin/users/:id/verify
// Approve a blood bank registration
// ══════════════════════════════════════════
router.put('/users/:id/verify', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isVerified: true },
      { new: true }
    ).select('-password');

    if (!user) return res.status(404).json({ success: false, msg: 'User not found' });

    // Create empty stock doc for the bank if not exists
    if (user.role === 'bloodbank') {
      await Stock.findOneAndUpdate(
        { bank: user._id },
        { bank: user._id },
        { upsert: true, new: true }
      );
    }

    res.json({ success: true, msg: user.orgName + ' verified and approved', user });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

// ══════════════════════════════════════════
// PUT /api/admin/users/:id/block
// Block or unblock a user
// ══════════════════════════════════════════
router.put('/users/:id/block', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, msg: 'User not found' });
    if (user.role === 'admin') return res.status(400).json({ success: false, msg: 'Cannot block admin' });

    user.isVerified = !user.isVerified;
    await user.save();

    res.json({
      success: true,
      msg: user.firstName + ' is now ' + (user.isVerified ? 'unblocked' : 'blocked'),
      isVerified: user.isVerified,
    });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

// ══════════════════════════════════════════
// DELETE /api/admin/users/:id
// ══════════════════════════════════════════
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, msg: 'User not found' });
    if (user.role === 'admin') return res.status(400).json({ success: false, msg: 'Cannot delete admin' });

    await User.findByIdAndDelete(req.params.id);
    await Stock.findOneAndDelete({ bank: req.params.id });

    res.json({ success: true, msg: 'User deleted' });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

// ══════════════════════════════════════════
// GET /api/admin/banks — with stock data
// ══════════════════════════════════════════
router.get('/banks', async (req, res) => {
  try {
    const banks  = await User.find({ role: 'bloodbank' }).select('-password').sort({ isVerified: -1 }).lean();
    const bankIds = banks.map(b => b._id);
    const stocks  = await Stock.find({ bank: { $in: bankIds } });
    const stockMap = {};
    stocks.forEach(s => { stockMap[s.bank.toString()] = s; });

    const result = banks.map(b => ({
     ...b,
      stock: stockMap[b._id.toString()] || null,
    }));

    res.json({ success: true, count: result.length, banks: result });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

// ══════════════════════════════════════════
// GET /api/admin/requests
// ══════════════════════════════════════════
router.get('/requests', async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const requests = await Request.find(filter)
      .populate('patient', 'firstName lastName phone district')
      .populate('bank',    'orgName district phone')
      .sort({ createdAt: -1 })
      .limit(200);

    res.json({ success: true, count: requests.length, requests });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

// ══════════════════════════════════════════
// GET /api/admin/donations
// ══════════════════════════════════════════
router.get('/donations', async (req, res) => {
  try {
    const donations = await Donation.find()
      .populate('bank', 'orgName district')
      .sort({ donatedAt: -1 })
      .limit(200);

    res.json({ success: true, count: donations.length, donations });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

// ══════════════════════════════════════════
// GET /api/admin/payments
// ══════════════════════════════════════════
router.get('/payments', async (req, res) => {
  try {
    const payments = await Payment.find().sort({ createdAt: -1 }).limit(200);
    const total    = payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
    res.json({ success: true, count: payments.length, totalRaised: total, payments });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

// ══════════════════════════════════════════
// POST /api/admin/broadcast
// Send SMS to all active patients in a district
// Body: { message, district?, bloodGroup? }
// ══════════════════════════════════════════
router.post('/broadcast', async (req, res) => {
  try {
    const { message, district, bloodGroup } = req.body;
    if (!message) return res.status(400).json({ success: false, msg: 'Message is required' });

    const filter = { role: 'patient', isVerified: true };
    if (district)   filter.district   = district;
    if (bloodGroup) filter.bloodGroup = bloodGroup;

    const patients = await User.find(filter).select('phone firstName');
    const phones   = patients.filter(p => p.phone).map(p => p.phone);

    if (phones.length === 0) return res.json({ success: true, msg: 'No patients found to notify', sent: 0 });

    // Send SMS to all (batched)
    let sent = 0;
    for (const phone of phones) {
      try { await sendSMS(phone, message); sent++; } catch (e) { /* skip failed */ }
    }

    res.json({ success: true, msg: 'Broadcast sent', total: phones.length, sent });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

module.exports = router;
