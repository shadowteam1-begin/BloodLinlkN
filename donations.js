// ═══════════════════════════════════════════
// routes/donations.js — Blood Donation Routes
//
// POST /api/donations          → log a donation (bank)
// GET  /api/donations/mine     → bank's donation history
// GET  /api/donations/stats    → stats for a bank
// ═══════════════════════════════════════════

const express  = require('express');
const router   = express.Router();
const Donation = require('../models/Donation');
const Stock    = require('../models/Stock');
const { protect, authorize } = require('../middleware/auth');
const { checkAndNotifyAlerts } = require('../utils/sms');

const GROUPS = ['A+','A-','B+','B-','O+','O-','AB+','AB-'];

// ══════════════════════════════════════════
// POST /api/donations
// Blood bank logs a new donation received
// Body: { bloodGroup, units, donorName, donorPhone, donorAge, notes }
// ══════════════════════════════════════════
router.post('/', protect, authorize('bloodbank'), async (req, res) => {
  try {
    const { bloodGroup, units, donorName, donorPhone, donorAge, notes } = req.body;

    if (!bloodGroup || !GROUPS.includes(bloodGroup)) {
      return res.status(400).json({ success: false, msg: 'Invalid blood group' });
    }
    if (!units || parseInt(units) < 1) {
      return res.status(400).json({ success: false, msg: 'Units must be at least 1' });
    }

    // Save donation record
    const donation = await Donation.create({
      bank:       req.user._id,
      bloodGroup,
      units:      parseInt(units),
      donorName:  donorName || 'Anonymous',
      donorPhone: donorPhone || '',
      donorAge:   donorAge  || null,
      notes:      notes     || '',
    });

    // Increase stock
    const stock = await Stock.findOneAndUpdate(
      { bank: req.user._id },
      { $inc: { [bloodGroup]: parseInt(units) }, $set: { lastUpdatedAt: new Date() } },
      { new: true, upsert: true }
    );

    // Emit socket event so patients see live update
    const io = req.app.get('io');
    if (io) {
      const payload = {
        bankId: req.user._id, bankName: req.user.orgName,
        district: req.user.district, group: bloodGroup,
        units: stock[bloodGroup], updatedAt: new Date().toISOString(),
      };
      io.to('search:' + bloodGroup + ':' + req.user.district).emit('stock:updated', payload);
      io.to('search:' + bloodGroup + ':all').emit('stock:updated', payload);
    }

    // Trigger SMS alerts for patients waiting for this blood group
    checkAndNotifyAlerts(bloodGroup, req.user.district, req.user.orgName).catch(console.error);

    res.status(201).json({
      success:  true,
      donation,
      newUnits: stock[bloodGroup],
      msg:      units + ' unit(s) of ' + bloodGroup + ' added. Patients notified.',
    });
  } catch (err) {
    console.error('Donation error:', err.message);
    res.status(500).json({ success: false, msg: err.message });
  }
});

// ══════════════════════════════════════════
// GET /api/donations/mine
// Blood bank's own donation history
// ══════════════════════════════════════════
router.get('/mine', protect, authorize('bloodbank'), async (req, res) => {
  try {
    const donations = await Donation.find({ bank: req.user._id })
      .sort({ donatedAt: -1 })
      .limit(100);
    res.json({ success: true, count: donations.length, donations });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

// ══════════════════════════════════════════
// GET /api/donations/stats
// Blood bank's donation statistics
// ══════════════════════════════════════════
router.get('/stats', protect, authorize('bloodbank'), async (req, res) => {
  try {
    const donations = await Donation.find({ bank: req.user._id });

    const byGroup = {};
    GROUPS.forEach(g => { byGroup[g] = 0; });
    let totalUnits = 0;

    donations.forEach(d => {
      byGroup[d.bloodGroup] = (byGroup[d.bloodGroup] || 0) + d.units;
      totalUnits += d.units;
    });

    res.json({
      success: true,
      stats: { totalDonations: donations.length, totalUnits, byGroup },
    });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

module.exports = router;
