// ═══════════════════════════════════════════
// routes/requests.js — Blood Request Routes
//
// PATIENT:
//   POST /api/requests          → create request
//   GET  /api/requests/mine     → my requests
//
// BLOOD BANK:
//   GET  /api/requests/incoming       → incoming requests
//   PUT  /api/requests/:id/respond    → approve/decline
//
// ADMIN:
//   GET  /api/requests/all      → all requests
// ═══════════════════════════════════════════

const express  = require('express');
const router   = express.Router();
const Request  = require('../models/Request');
const Stock    = require('../models/Stock');
const { protect, authorize } = require('../middleware/auth');


// ══════════════════════════════════════════
// POST /api/requests
// Patient creates a blood request
// Body: { bankId, bloodGroup, units, urgency, note }
// ══════════════════════════════════════════
router.post('/', protect, authorize('patient', 'hospital'), async (req, res) => {
  try {
    const { bankId, bloodGroup, units, urgency, note } = req.body;

    // ── Validate inputs ─────────────────────
    if (!bankId || !bloodGroup || !units) {
      return res.status(400).json({
        success: false,
        msg: 'Please provide bankId, bloodGroup and units'
      });
    }

    // ── Check bank has enough stock ──────────
    const stock = await Stock.findOne({ bank: bankId });
    if (!stock || stock[bloodGroup] < parseInt(units)) {
      return res.status(400).json({
        success: false,
        msg: `Not enough ${bloodGroup} units available at this bank`
      });
    }

    // ── Create the request ───────────────────
    const request = await Request.create({
      patient:    req.user._id,
      bank:       bankId,
      bloodGroup,
      units:      parseInt(units),
      urgency:    urgency || 'normal',
      note:       note || '',
    });

    // Populate with user details for the response
    await request.populate([
      { path: 'patient', select: 'firstName lastName phone email' },
      { path: 'bank',    select: 'orgName district phone' },
    ]);

    // ── Emit socket notification to the blood bank ──
    // This triggers the 5-second sound + notification on the bank dashboard
    const io = req.app.get('io');
    if (io) {
      io.to('bank:' + bankId).emit('new:request', {
        requestId:    request._id,
        bloodGroup,
        units:        parseInt(units),
        urgency:      urgency || 'normal',
        patientName:  (request.patient.firstName || '') + ' ' + (request.patient.lastName || ''),
        patientPhone: request.patient.phone || '',
        note:         note || '',
        createdAt:    request.createdAt,
      });
      console.log('Bell  New request alert sent to bank:', bankId, '| Group:', bloodGroup);
    }

    res.status(201).json({ success: true, request });

  } catch (err) {
    console.error('Create request error:', err.message);
    res.status(500).json({ success: false, msg: 'Could not create request' });
  }
});


// ══════════════════════════════════════════
// GET /api/requests/mine
// Patient sees their own requests
// ══════════════════════════════════════════
router.get('/mine', protect, authorize('patient', 'hospital'), async (req, res) => {
  try {
    const requests = await Request.find({ patient: req.user._id })
      .populate('bank', 'orgName district phone')
      .sort({ createdAt: -1 }); // newest first

    res.json({ success: true, count: requests.length, requests });
  } catch (err) {
    res.status(500).json({ success: false, msg: 'Could not fetch your requests' });
  }
});


// ══════════════════════════════════════════
// GET /api/requests/incoming
// Blood bank sees all requests sent to them
// Query: ?status=pending
// ══════════════════════════════════════════
router.get('/incoming', protect, authorize('bloodbank'), async (req, res) => {
  try {
    const filter = { bank: req.user._id };
    if (req.query.status) filter.status = req.query.status;

    const requests = await Request.find(filter)
      .populate('patient', 'firstName lastName phone email district')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: requests.length, requests });
  } catch (err) {
    res.status(500).json({ success: false, msg: 'Could not fetch requests' });
  }
});


// ══════════════════════════════════════════
// PUT /api/requests/:id/respond
// Blood bank approves or declines a request
// Body: { status: "approved" | "rejected" }
// ══════════════════════════════════════════
router.put('/:id/respond', protect, authorize('bloodbank'), async (req, res) => {
  try {
    const { status } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        msg: 'Status must be "approved" or "rejected"'
      });
    }

    // ── Find the request ─────────────────────
    const request = await Request.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, msg: 'Request not found' });
    }

    // ── Security: only the bank it was sent to ─
    if (request.bank.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, msg: 'Not authorised' });
    }

    // ── If approving: deduct stock ───────────
    if (status === 'approved') {
      const stock = await Stock.findOne({ bank: req.user._id });

      if (!stock || stock[request.bloodGroup] < request.units) {
        return res.status(400).json({
          success: false,
          msg: 'Not enough units in stock to approve this request'
        });
      }

      // $inc with negative value = decrement
      await Stock.findOneAndUpdate(
        { bank: req.user._id },
        {
          $inc: { [request.bloodGroup]: -request.units },
          $set: { lastUpdatedAt: new Date() }
        }
      );
    }

    // ── Update request status ────────────────
    request.status      = status;
    request.respondedAt = new Date();
    await request.save();

    await request.populate([
      { path: 'patient', select: 'firstName lastName phone' },
      { path: 'bank',    select: 'orgName' },
    ]);

    res.json({ success: true, request });

  } catch (err) {
    console.error('Respond to request error:', err.message);
    res.status(500).json({ success: false, msg: 'Could not update request' });
  }
});


// ══════════════════════════════════════════
// GET /api/requests/all  (Admin only)
// ══════════════════════════════════════════
router.get('/all', protect, authorize('admin'), async (req, res) => {
  try {
    const requests = await Request.find()
      .populate('patient', 'firstName lastName email district')
      .populate('bank',    'orgName district')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: requests.length, requests });
  } catch (err) {
    res.status(500).json({ success: false, msg: 'Could not fetch all requests' });
  }
});


module.exports = router;

// NOTE: Socket.io emit is already handled inside the route handlers above.
// After approve/decline, emit to patient's room:
// io.to('patient:' + req.user._id).emit('request:updated', { id, status })
// This requires patients to join socket room 'patient:<id>' on dashboard load.
// See frontend socket guide in js/socket.js
