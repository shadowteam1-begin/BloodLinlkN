// models/User.js — User Database Schema (v2)
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    firstName:   { type: String, required: [true, 'First name is required'], trim: true },
    lastName:    { type: String, required: [true, 'Last name is required'],  trim: true },
    email: {
      type: String, required: [true, 'Email is required'],
      unique: true, lowercase: true, trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address'],
    },
    password: {
      type: String, required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    phone:    { type: String, trim: true },
    role:     { type: String, enum: ['patient','bloodbank','hospital','admin'], default: 'patient' },
    district: { type: String, trim: true },

    // ── Blood bank / Hospital fields ──────
    orgName:       { type: String, trim: true },
    licenseNumber: { type: String, trim: true },  // Government-issued license
    address:       { type: String, trim: true },
    workingHours:  { type: String, default: 'Open 24 hours' },

    // ── Approval system ───────────────────
    isVerified: {
      type: Boolean, default: false,
      // false = pending/blocked, true = approved and active
    },
    // When the account was submitted for approval
    approvalRequestedAt: { type: Date },
    // Auto-approve at this timestamp (12 hours after registration)
    autoApproveAt: { type: Date },
    // Who approved: 'admin' | 'auto' | null
    approvedBy: { type: String, default: null },

    isOpen: { type: Boolean, default: true },

    // ── Patient only ──────────────────────
    bloodGroup: {
      type: String,
      enum: ['A+','A-','B+','B-','O+','O-','AB+','AB-',''],
      default: '',
    },
  },
  { timestamps: true }
);

// Hash password on save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare passwords
userSchema.methods.matchPassword = async function (typedPassword) {
  return await bcrypt.compare(typedPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
