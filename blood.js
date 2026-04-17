// ═══════════════════════════════════════════
// routes/blood.js — Blood Search & Stock
// NOW WITH Socket.io real-time emit on stock update
//
// PUBLIC:
//   GET /api/blood/search     → patients search blood
//   GET /api/blood/banks      → list all verified banks
//
// PRIVATE (blood bank only):
//   GET  /api/blood/stock     → get my current stock
//   PUT  /api/blood/stock     → update stock (emits socket event)
//   PUT  /api/blood/status    → toggle open/closed
//   POST /api/blood/donation  → log donation received
// ═══════════════════════════════════════════

const express  = require('express');
const router   = express.Router();
const User     = require('../models/User');
const Stock    = require('../models/Stock');
const { protect, authorize } = require('../middleware/auth');

const VALID_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];


// ══════════════════════════════════════════
// GET /api/blood/search?group=B+&district=Salem
// Public — patients search for blood
// ══════════════════════════════════════════
router.get('/search', async (req, res) => {
  try {
    const { group, district } = req.query;

    if (!group || !VALID_GROUPS.includes(group)) {
      return res.status(400).json({ success: false, msg: 'Provide a valid blood group: A+, B-, O+, etc.' });
    }

    // Find verified open banks (filter by district if provided)
    const bankFilter = { role: 'bloodbank', isVerified: true, isOpen: true };
    if (district) bankFilter.district = district;

    const banks = await User.find(bankFilter)
      .select('orgName district address phone workingHours');

    // Get stock for all those banks
    const bankIds = banks.map(b => b._id);
    const stocks  = await Stock.find({ bank: { $in: bankIds } })
      .select('bank ' + group + ' lastUpdatedAt');

    // Build stock lookup map
    const stockMap = {};
    stocks.forEach(s => { stockMap[s.bank.toString()] = s; });

    // Combine bank info + their units for the requested group
    const results = banks
      .map(bank => {
        const stock = stockMap[bank._id.toString()];
        const units = stock ? (stock[group] || 0) : 0;

        // Human-readable "last updated"
        let lastUpdated = 'Unknown';
        if (stock && stock.lastUpdatedAt) {
          const diff = Math.floor((Date.now() - new Date(stock.lastUpdatedAt)) / 60000);
          if (diff < 1)   lastUpdated = 'Just now';
          else if (diff < 60) lastUpdated = diff + ' min ago';
          else if (diff < 1440) lastUpdated = Math.floor(diff / 60) + ' hr ago';
          else            lastUpdated = Math.floor(diff / 1440) + ' day ago';
        }

        return {
          id:          bank._id,
          name:        bank.orgName,
          district:    bank.district,
          address:     bank.address,
          phone:       bank.phone,
          hours:       bank.workingHours,
          units,
          lastUpdated,
        };
      })
      .sort((a, b) => b.units - a.units); // most stock first

    res.json({ success: true, count: results.length, results });

  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ success: false, msg: 'Search failed. Please try again.' });
  }
});


// ══════════════════════════════════════════
// GET /api/blood/banks?district=Salem
// Public — list all blood banks
// ══════════════════════════════════════════
router.get('/banks', async (req, res) => {
  try {
    const filter = { role: 'bloodbank', isVerified: true };
    if (req.query.district) filter.district = req.query.district;

    const banks = await User.find(filter)
      .select('orgName district address phone workingHours isOpen');

    res.json({ success: true, count: banks.length, banks });
  } catch (err) {
    res.status(500).json({ success: false, msg: 'Could not fetch banks' });
  }
});


// ══════════════════════════════════════════
// GET /api/blood/stock
// Private — blood bank views their own stock
// ══════════════════════════════════════════
router.get('/stock', protect, authorize('bloodbank'), async (req, res) => {
  try {
    let stock = await Stock.findOne({ bank: req.user._id });
    if (!stock) stock = await Stock.create({ bank: req.user._id });
    res.json({ success: true, stock });
  } catch (err) {
    res.status(500).json({ success: false, msg: 'Could not fetch stock' });
  }
});


// ══════════════════════════════════════════
// PUT /api/blood/stock
// Private — blood bank updates stock
// Body: { "A+": 10, "B+": 5, ... }
//
// ⚡ REAL-TIME: After saving, we emit a
//    socket event so all patients searching
//    for that blood group see the update
//    instantly — no page refresh needed.
// ══════════════════════════════════════════
router.put('/stock', protect, authorize('bloodbank'), async (req, res) => {
  try {
    const updates = { lastUpdatedAt: new Date() };

    // Only process valid blood group fields
    VALID_GROUPS.forEach(group => {
      if (req.body[group] !== undefined) {
        updates[group] = Math.max(0, parseInt(req.body[group]) || 0);
      }
    });

    // Save to MongoDB
    const stock = await Stock.findOneAndUpdate(
      { bank: req.user._id },
      { $set: updates },
      { new: true, upsert: true }
    );

    // ── EMIT SOCKET.IO EVENT ──────────────────
    // Get the socket.io instance we attached in server.js
    const io = req.app.get('io');

    if (io) {
      // For each group that was updated, notify
      // patients who are currently searching for it
      VALID_GROUPS.forEach(group => {
        if (updates[group] !== undefined) {
          // Notify "search:B+:Salem" room (district-specific)
          io.to('search:' + group + ':' + req.user.district).emit('stock:updated', {
            bankId:    req.user._id,
            bankName:  req.user.orgName,
            district:  req.user.district,
            group,
            units:     stock[group],
            updatedAt: new Date().toISOString(),
          });

          // Also notify "search:B+:all" room (all-district searches)
          io.to('search:' + group + ':all').emit('stock:updated', {
            bankId:    req.user._id,
            bankName:  req.user.orgName,
            district:  req.user.district,
            group,
            units:     stock[group],
            updatedAt: new Date().toISOString(),
          });
        }
      });

      // Notify the bank's own room (so their dashboard stays in sync if open on two tabs)
      io.to('bank:' + req.user._id).emit('stock:saved', {
        stock,
        savedAt: new Date().toISOString(),
      });

      console.log('⚡  Stock update emitted for', req.user.orgName, 'in', req.user.district);
    }

    res.json({ success: true, stock });

  } catch (err) {
    console.error('Stock update error:', err.message);
    res.status(500).json({ success: false, msg: 'Could not update stock' });
  }
});


// ══════════════════════════════════════════
// PUT /api/blood/status
// Private — toggle bank open/closed
// Body: { open: true/false }
// ══════════════════════════════════════════
router.put('/status', protect, authorize('bloodbank'), async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { isOpen: req.body.open },
      { new: true }
    );

    // Emit so any patient dashboards update the bank's availability badge
    const io = req.app.get('io');
    if (io) {
      io.emit('bank:status', {
        bankId:   user._id,
        district: user.district,
        isOpen:   user.isOpen,
      });
    }

    res.json({ success: true, isOpen: user.isOpen });
  } catch (err) {
    res.status(500).json({ success: false, msg: 'Could not update status' });
  }
});


// ══════════════════════════════════════════
// POST /api/blood/donation
// Private — log a donation received
// Body: { group, units, donorName }
// ══════════════════════════════════════════
router.post('/donation', protect, authorize('bloodbank'), async (req, res) => {
  try {
    const { group, units, donorName } = req.body;

    if (!group || !VALID_GROUPS.includes(group)) {
      return res.status(400).json({ success: false, msg: 'Invalid blood group' });
    }
    if (!units || parseInt(units) < 1) {
      return res.status(400).json({ success: false, msg: 'Units must be at least 1' });
    }

    // $inc: add to existing value
    const stock = await Stock.findOneAndUpdate(
      { bank: req.user._id },
      {
        $inc: { [group]: parseInt(units) },
        $set: { lastUpdatedAt: new Date() }
      },
      { new: true, upsert: true }
    );

    // Emit real-time update to patients searching for this group
    const io = req.app.get('io');
    if (io) {
      const payload = {
        bankId:   req.user._id,
        bankName: req.user.orgName,
        district: req.user.district,
        group,
        units:    stock[group],
        updatedAt: new Date().toISOString(),
      };
      io.to('search:' + group + ':' + req.user.district).emit('stock:updated', payload);
      io.to('search:' + group + ':all').emit('stock:updated', payload);
    }

    console.log('💉 Donation:', units, 'units of', group, 'by', donorName || 'Anonymous', 'at', req.user.orgName);

    res.json({
      success:  true,
      msg:      units + ' unit(s) of ' + group + ' added',
      newUnits: stock[group],
      stock,
    });

  } catch (err) {
    console.error('Donation error:', err.message);
    res.status(500).json({ success: false, msg: 'Could not log donation' });
  }
});


module.exports = router;
