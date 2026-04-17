// ═══════════════════════════════════════════
// utils/autoApprove.js — Auto-Approval Job
//
// Runs every 5 minutes.
// Finds blood banks / hospitals that registered
// more than 12 hours ago and haven't been
// manually approved or rejected yet.
// Automatically approves them and emits a
// socket event to the admin room.
// ═══════════════════════════════════════════

const User  = require('../models/User');
const Stock = require('../models/Stock');

let _io = null; // socket.io instance

function startAutoApproveJob(io) {
  _io = io;

  // Run immediately on server start (catch any missed ones)
  runAutoApprove();

  // Then run every 5 minutes
  setInterval(runAutoApprove, 5 * 60 * 1000);

  console.log('⏱   Auto-approve job started (runs every 5 min, approves after 12hr)');
}

async function runAutoApprove() {
  try {
    const now = new Date();

    // Find all pending banks/hospitals whose autoApproveAt has passed
    const pendingUsers = await User.find({
      role:       { $in: ['bloodbank', 'hospital'] },
      isVerified: false,
      autoApproveAt: { $lte: now },
    });

    if (pendingUsers.length === 0) return;

    console.log('⏱   Auto-approving', pendingUsers.length, 'account(s)...');

    for (const user of pendingUsers) {
      user.isVerified = true;
      user.approvedBy = 'auto';
      await user.save();

      // Ensure stock doc exists for blood banks
      if (user.role === 'bloodbank') {
        await Stock.findOneAndUpdate(
          { bank: user._id },
          { bank: user._id },
          { upsert: true }
        );
      }

      console.log('  ✅  Auto-approved:', (user.orgName || user.email), '(' + user.role + ')');

      // Notify admin dashboard via socket
      if (_io) {
        _io.to('admin').emit('account:approved', {
          userId:    user._id,
          orgName:   user.orgName || (user.firstName + ' ' + user.lastName),
          role:      user.role,
          district:  user.district,
          approvedBy: 'auto',
          approvedAt: new Date(),
        });
      }
    }

    console.log('⏱   Auto-approve complete —', pendingUsers.length, 'approved');
  } catch (err) {
    console.error('Auto-approve job error:', err.message);
  }
}

module.exports = { startAutoApproveJob };
