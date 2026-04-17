// routes/features.js — Extra Features
// GET /api/features/compatibility?group=A+  → blood compatibility chart
// POST /api/features/sos                    → emergency SOS broadcast
// GET /api/features/stats/public            → public platform statistics
const express = require('express');
const router  = express.Router();
const User    = require('../models/User');
const Stock   = require('../models/Stock');
const Alert   = require('../models/Alert');
const Request = require('../models/Request');
const { protect } = require('../middleware/auth');
const { sendSMS }  = require('../utils/sms');

// ── Blood compatibility data ──────────────
const COMPATIBILITY = {
  'O-':  { canDonateTo: ['O-','O+','A-','A+','B-','B+','AB-','AB+'], canReceiveFrom: ['O-'] },
  'O+':  { canDonateTo: ['O+','A+','B+','AB+'],                       canReceiveFrom: ['O-','O+'] },
  'A-':  { canDonateTo: ['A-','A+','AB-','AB+'],                      canReceiveFrom: ['O-','A-'] },
  'A+':  { canDonateTo: ['A+','AB+'],                                  canReceiveFrom: ['O-','O+','A-','A+'] },
  'B-':  { canDonateTo: ['B-','B+','AB-','AB+'],                      canReceiveFrom: ['O-','B-'] },
  'B+':  { canDonateTo: ['B+','AB+'],                                  canReceiveFrom: ['O-','O+','B-','B+'] },
  'AB-': { canDonateTo: ['AB-','AB+'],                                 canReceiveFrom: ['O-','A-','B-','AB-'] },
  'AB+': { canDonateTo: ['AB+'],                                       canReceiveFrom: ['O-','O+','A-','A+','B-','B+','AB-','AB+'] },
};

// GET /api/features/compatibility?group=A+
router.get('/compatibility', (req, res) => {
  const { group } = req.query;
  if (!group || !COMPATIBILITY[group]) {
    return res.json({ success: true, all: COMPATIBILITY });
  }
  res.json({ success: true, group, ...COMPATIBILITY[group] });
});

// POST /api/features/sos
// Body: { bloodGroup, district, message, patientName, patientPhone }
router.post('/sos', protect, async (req, res) => {
  try {
    const { bloodGroup, district, message, patientName, patientPhone } = req.body;
    if (!bloodGroup || !district) {
      return res.status(400).json({ success:false, msg:'Blood group and district are required' });
    }

    // Find all blood banks in that district with stock
    const banks = await User.find({ role:'bloodbank', isVerified:true, isOpen:true, district });
    const bankIds = banks.map(b => b._id);
    const stocks  = await Stock.find({ bank:{ $in: bankIds }, [bloodGroup]:{ $gt: 0 } });
    const availIds = new Set(stocks.map(s => s.bank.toString()));
    const available = banks.filter(b => availIds.has(b._id.toString()));

    // SMS the banks
    let smsSent = 0;
    const sosMsg = 'URGENT BloodLink TN SOS: ' + (patientName||'Patient') + ' needs ' + bloodGroup
      + ' blood in ' + district + '. Contact: ' + (patientPhone||'N/A') + '. '
      + (message||'Please respond immediately.');

    for (const bank of available) {
      if (bank.phone) {
        try { await sendSMS(bank.phone, sosMsg); smsSent++; } catch(e){}
      }
    }

    // Emit socket to all patients searching in that district
    const io = req.app.get('io');
    if (io) {
      io.to('search:' + bloodGroup + ':' + district).emit('sos:alert', {
        bloodGroup, district, patientName, patientPhone, message,
        availableBanks: available.length,
      });
    }

    res.json({
      success: true,
      msg: 'SOS sent to ' + available.length + ' blood banks (' + smsSent + ' SMS sent)',
      availableBanks: available.length,
      smsSent,
    });
  } catch(err) {
    res.status(500).json({ success:false, msg: err.message });
  }
});

// GET /api/features/stats/public — public platform stats for landing page
router.get('/stats/public', async (req, res) => {
  try {
    const [banks, patients, requests, alerts] = await Promise.all([
      User.countDocuments({ role:'bloodbank', isVerified:true }),
      User.countDocuments({ role:'patient' }),
      Request.countDocuments({ status:'approved' }),
      Alert.countDocuments({ active:true }),
    ]);
    const stocks = await Stock.find({});
    const totalUnits = stocks.reduce((s,d) =>
      s + ['A+','A-','B+','B-','O+','O-','AB+','AB-'].reduce((g,k)=>g+(d[k]||0),0), 0);
    res.json({ success:true, stats:{ banks, patients, requests, totalUnits, alerts } });
  } catch(err) {
    res.status(500).json({ success:false, msg:err.message });
  }
});

module.exports = router;
