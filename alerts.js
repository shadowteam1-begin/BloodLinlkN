// ═══════════════════════════════════════════
// routes/alerts.js — Availability Alert Routes
//
// GET    /api/alerts       → get my alerts
// POST   /api/alerts       → create alert
// PUT    /api/alerts/:id   → toggle active
// DELETE /api/alerts/:id   → delete alert
// ═══════════════════════════════════════════

const express = require('express');
const router  = express.Router();
const Alert   = require('../models/Alert');
const { protect, authorize } = require('../middleware/auth');


// ══════════════════════════════════════════
// GET /api/alerts  — get my alerts
// ══════════════════════════════════════════
router.get('/', protect, authorize('patient', 'hospital'), async (req, res) => {
  try {
    const alerts = await Alert.find({ patient: req.user._id })
      .sort({ createdAt: -1 });

    res.json({ success: true, alerts });
  } catch (err) {
    res.status(500).json({ success: false, msg: 'Could not fetch alerts' });
  }
});


// ══════════════════════════════════════════
// POST /api/alerts  — create a new alert
// Body: { bloodGroup: "B+", district: "Salem" }
// ══════════════════════════════════════════
router.post('/', protect, authorize('patient', 'hospital'), async (req, res) => {
  try {
    const { bloodGroup, district } = req.body;

    if (!bloodGroup) {
      return res.status(400).json({ success: false, msg: 'Blood group is required' });
    }

    // Prevent duplicate alerts
    const existing = await Alert.findOne({
      patient:    req.user._id,
      bloodGroup,
      district:   district || '',
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        msg: `Alert for ${bloodGroup} in ${district || 'all districts'} already exists`
      });
    }

    const alert = await Alert.create({
      patient: req.user._id,
      bloodGroup,
      district: district || '',
    });

    res.status(201).json({ success: true, alert });
  } catch (err) {
    res.status(500).json({ success: false, msg: 'Could not create alert' });
  }
});


// ══════════════════════════════════════════
// PUT /api/alerts/:id  — toggle active
// Body: { active: true/false }
// ══════════════════════════════════════════
router.put('/:id', protect, async (req, res) => {
  try {
    const alert = await Alert.findOne({
      _id:     req.params.id,
      patient: req.user._id  // must own this alert
    });

    if (!alert) {
      return res.status(404).json({ success: false, msg: 'Alert not found' });
    }

    alert.active = req.body.active;
    await alert.save();

    res.json({ success: true, alert });
  } catch (err) {
    res.status(500).json({ success: false, msg: 'Could not update alert' });
  }
});


// ══════════════════════════════════════════
// DELETE /api/alerts/:id  — delete alert
// ══════════════════════════════════════════
router.delete('/:id', protect, async (req, res) => {
  try {
    const alert = await Alert.findOneAndDelete({
      _id:     req.params.id,
      patient: req.user._id
    });

    if (!alert) {
      return res.status(404).json({ success: false, msg: 'Alert not found' });
    }

    res.json({ success: true, msg: 'Alert deleted' });
  } catch (err) {
    res.status(500).json({ success: false, msg: 'Could not delete alert' });
  }
});


module.exports = router;
