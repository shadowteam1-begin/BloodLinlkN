// ═══════════════════════════════════════════
// utils/errorHandler.js
//
// Reusable error handling helpers.
// Instead of repeating try/catch in every
// route, we use these utilities to keep
// code clean and consistent.
// ═══════════════════════════════════════════

// ── Custom Error Class ─────────────────────
// Extends the built-in Error so we can also
// attach an HTTP status code
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);           // set error.message
    this.statusCode = statusCode;
    this.isOperational = true; // our error vs crash
    Error.captureStackTrace(this, this.constructor);
  }
}

// ── Async route wrapper ─────────────────────
// Instead of writing try/catch in every route:
//
//   router.get('/something', asyncHandler(async (req, res) => {
//     const data = await SomeModel.find();
//     res.json({ data });
//   }));
//
// If the async function throws, asyncHandler
// catches it and passes it to Express's global
// error handler in server.js automatically.
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ── Validate blood group ───────────────────
const VALID_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
const isValidGroup = (group) => VALID_GROUPS.includes(group);

// ── Validate TN districts ──────────────────
const TN_DISTRICTS = [
  'Salem', 'Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli',
  'Tirunelveli', 'Erode', 'Vellore', 'Thoothukudi', 'Thanjavur',
  'Dharmapuri', 'Namakkal', 'Krishnagiri', 'Dindigul', 'Virudhunagar',
  'Kanyakumari', 'Nilgiris', 'Ramanathapuram', 'Tiruppur', 'Kancheepuram',
  'Villupuram', 'Cuddalore', 'Nagapattinam', 'Tiruvarur', 'Perambalur',
  'Ariyalur', 'Pudukkottai', 'Sivaganga', 'Theni', 'Tenkasi',
  'Tirupattur', 'Ranipet', 'Chengalpattu', 'Kallakurichi',
  'Mayiladuthurai', 'Tiruvannamalai', 'Karur', 'Tirupathur'
];
const isValidDistrict = (d) => !d || TN_DISTRICTS.includes(d);

module.exports = { AppError, asyncHandler, isValidGroup, isValidDistrict, VALID_GROUPS, TN_DISTRICTS };
