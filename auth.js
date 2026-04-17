// ═══════════════════════════════════════════
// routes/auth.js — Register, Login, Profile
//
// Feature: Blood banks & hospitals must submit
// a government license number on register.
// They enter a "pending approval" state.
// Admin can approve manually OR the system
// auto-approves after 12 hours automatically.
// ═══════════════════════════════════════════

const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');
const Stock   = require('../models/Stock');
const { protect } = require('../middleware/auth');

// ── JWT helper ────────────────────────────
const sendTokenResponse = (user, statusCode, res) => {
  const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
  res.status(statusCode).json({
    success: true,
    token,
    user: {
      id:                  user._id,
      firstName:           user.firstName,
      lastName:            user.lastName,
      email:               user.email,
      role:                user.role,
      district:            user.district,
      orgName:             user.orgName,
      licenseNumber:       user.licenseNumber,
      isVerified:          user.isVerified,
      approvalRequestedAt: user.approvalRequestedAt,
      autoApproveAt:       user.autoApproveAt,
      approvedBy:          user.approvedBy,
      phone:               user.phone,
    }
  });
};

// ══════════════════════════════════════════
// POST /api/auth/register
// ══════════════════════════════════════════
router.post('/register', async (req, res) => {
  try {
    const {
      firstName, lastName, email, password,
      phone, role, district, orgName, licenseNumber, address
    } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ success: false, msg: 'First name, last name, email and password are required' });
    }

    // Require license number for blood banks and hospitals
    const needsLicense = role === 'bloodbank' || role === 'hospital';
    if (needsLicense && !licenseNumber) {
      return res.status(400).json({
        success: false,
        msg: 'Government license number is required for blood banks and hospitals'
      });
    }
    if (needsLicense && licenseNumber.trim().length < 4) {
      return res.status(400).json({
        success: false,
        msg: 'Please enter a valid license number (minimum 4 characters)'
      });
    }

    // Check duplicate email
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ success: false, msg: 'An account with this email already exists' });
    }

    // Check duplicate license (same role)
    if (needsLicense && licenseNumber) {
      const dupLicense = await User.findOne({ licenseNumber: licenseNumber.trim(), role });
      if (dupLicense) {
        return res.status(400).json({ success: false, msg: 'This license number is already registered' });
      }
    }

    // Patients are auto-verified; banks/hospitals start pending
    const isPatient   = role === 'patient';
    const now         = new Date();
    // Auto-approve 12 hours after registration if admin doesn't act
    const autoApprove = needsLicense ? new Date(now.getTime() + 12 * 60 * 60 * 1000) : null;

    const user = await User.create({
      firstName, lastName, email, password,
      phone, district, orgName,
      licenseNumber: licenseNumber ? licenseNumber.trim().toUpperCase() : undefined,
      address,
      role:                role     || 'patient',
      isVerified:          isPatient,            // patients verified immediately
      approvalRequestedAt: needsLicense ? now  : null,
      autoApproveAt:       needsLicense ? autoApprove : null,
      approvedBy:          isPatient ? 'auto' : null,
    });

    // Create empty stock for blood banks
    if (role === 'bloodbank') {
      await Stock.create({ bank: user._id });
    }

    sendTokenResponse(user, 201, res);

  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ success: false, msg: 'Server error. Please try again.' });
  }
});

// ══════════════════════════════════════════
// POST /api/auth/login
// ══════════════════════════════════════════
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, msg: 'Please provide email and password' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) return res.status(401).json({ success: false, msg: 'Invalid email or password' });

    const isMatch = await user.matchPassword(password);
    if (!isMatch) return res.status(401).json({ success: false, msg: 'Invalid email or password' });

    // ── Check auto-approve ─────────────────
    // If the 12-hour window has passed and not yet approved, auto-approve now
    if (!user.isVerified && user.autoApproveAt && new Date() >= user.autoApproveAt) {
      user.isVerified  = true;
      user.approvedBy  = 'auto';
      await user.save();
      console.log('⏱  Auto-approved:', user.orgName || user.email);
    }

    sendTokenResponse(user, 200, res);

  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ success: false, msg: 'Server error. Please try again.' });
  }
});

// ══════════════════════════════════════════
// GET /api/auth/me
// ══════════════════════════════════════════
router.get('/me', protect, async (req, res) => {
  res.json({ success: true, user: req.user });
});

// ══════════════════════════════════════════
// PUT /api/auth/me
// ══════════════════════════════════════════
router.put('/me', protect, async (req, res) => {
  try {
    const allowed = ['firstName','lastName','phone','district','address','workingHours','bloodGroup'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, msg: 'Could not update profile' });
  }
});

// ══════════════════════════════════════════
// GET /api/auth/status
// Check approval status (called by pending page)
// ══════════════════════════════════════════
router.get('/status', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    // Check auto-approve again on status check
    if (!user.isVerified && user.autoApproveAt && new Date() >= user.autoApproveAt) {
      user.isVerified = true;
      user.approvedBy = 'auto';
      await user.save();
    }

    const msLeft = user.autoApproveAt ? Math.max(0, user.autoApproveAt - Date.now()) : 0;
    const hrsLeft = Math.floor(msLeft / 3600000);
    const minLeft = Math.floor((msLeft % 3600000) / 60000);

    res.json({
      success:    true,
      isVerified: user.isVerified,
      approvedBy: user.approvedBy,
      timeLeft:   { hours: hrsLeft, minutes: minLeft, total_ms: msLeft },
      autoApproveAt: user.autoApproveAt,
    });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

// POST /api/auth/forgot-password
// Simulate sending reset email (logs to console, extend with nodemailer)
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, msg: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase() });

    // Always return success (security: don't reveal if email exists)
    if (!user) {
      return res.json({ success: true, msg: 'If registered, reset link sent.' });
    }

    // Generate a simple reset token (in production: use crypto + store with expiry)
    const resetToken = require('crypto').randomBytes(32).toString('hex');
    const resetLink  = (process.env.FRONTEND_URL || 'http://localhost:5500') +
      '/pages/reset-password.html?token=' + resetToken + '&email=' + encodeURIComponent(email);

    // Log to console (extend with actual email sending via nodemailer/MSG91)
    console.log('');
    console.log('════════════════════════════════════════');
    console.log('🔑  Password Reset Request');
    console.log('  Email:', email);
    console.log('  Name: ', user.firstName, user.lastName);
    console.log('  Link: ', resetLink);
    console.log('  (Send this link to the user via email)');
    console.log('════════════════════════════════════════');
    console.log('');

    res.json({ success: true, msg: 'If registered, reset link sent.', resetLink });
  } catch(err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

module.exports = router;
