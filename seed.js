// ═══════════════════════════════════════════
// scripts/seed.js — Full Database Seeder
// Seeds: Admin, 5 Blood Banks, 3 Patients,
//        Stock, Sample Donations, Sample Payment
//
// RUN ONCE:  npm run seed
// RESET ALL: npm run seed:reset
// ═══════════════════════════════════════════
require('dotenv').config();
const mongoose = require('mongoose');
const User     = require('../models/User');
const Stock    = require('../models/Stock');
const Donation = require('../models/Donation');
const Payment  = require('../models/Payment');
const Alert    = require('../models/Alert');

const ADMIN = {
  firstName: 'BloodLink', lastName: 'Admin',
  email: 'admin@bloodlink.tn', password: 'Admin@1234',
  role: 'admin', district: 'Chennai', isVerified: true,
};

const BLOOD_BANKS = [
  {
    firstName:'Salem', lastName:'GovtBank',
    email:'salem.bb@bloodlink.tn', password:'Salem@1234',
    role:'bloodbank', orgName:'Salem Government Blood Bank',
    district:'Salem', address:'Government Hospital Road, Salem - 636001',
    phone:'+91 427 225 5000', workingHours:'Open 24 hours',
    licenseNumber:'TN/BB/2019/045', isVerified:true, isOpen:true,
    stock:{'A+':8,'A-':2,'B+':15,'B-':0,'O+':20,'O-':3,'AB+':5,'AB-':1},
  },
  {
    firstName:'Apollo', lastName:'BloodCentre',
    email:'apollo.salem@bloodlink.tn', password:'Apollo@1234',
    role:'bloodbank', orgName:'Apollo Blood Centre Salem',
    district:'Salem', address:'Apollo Hospital, Omalur Main Road, Salem',
    phone:'+91 427 299 0000', workingHours:'Mon–Sat 8AM–8PM',
    licenseNumber:'TN/BB/2020/081', isVerified:true, isOpen:true,
    stock:{'A+':3,'A-':0,'B+':2,'B-':0,'O+':7,'O-':0,'AB+':1,'AB-':0},
  },
  {
    firstName:'RedCross', lastName:'Coimbatore',
    email:'redcross.cbe@bloodlink.tn', password:'RedCross@1234',
    role:'bloodbank', orgName:'Red Cross Blood Bank, Coimbatore',
    district:'Coimbatore', address:'Red Cross Bhavan, Race Course Road, Coimbatore',
    phone:'+91 422 222 3456', workingHours:'Open 24 hours',
    licenseNumber:'TN/BB/2018/033', isVerified:true, isOpen:true,
    stock:{'A+':12,'A-':4,'B+':9,'B-':2,'O+':18,'O-':6,'AB+':3,'AB-':0},
  },
  {
    firstName:'Madurai', lastName:'RajajiGovt',
    email:'madurai.bb@bloodlink.tn', password:'Madurai@1234',
    role:'bloodbank', orgName:'Madurai Rajaji Govt Blood Bank',
    district:'Madurai', address:'Panagal Road, Madurai - 625020',
    phone:'+91 452 253 0000', workingHours:'Open 24 hours',
    licenseNumber:'TN/BB/2017/012', isVerified:true, isOpen:true,
    stock:{'A+':22,'A-':5,'B+':18,'B-':3,'O+':30,'O-':8,'AB+':7,'AB-':2},
  },
  {
    firstName:'PendingBank', lastName:'Tiruppur',
    email:'pending.bb@bloodlink.tn', password:'Pending@1234',
    role:'bloodbank', orgName:'Tiruppur District Blood Bank',
    district:'Tiruppur', address:'District Hospital, Tiruppur - 641601',
    phone:'+91 421 222 1234', workingHours:'Mon–Sat 9AM–5PM',
    licenseNumber:'TN/BB/2024/099', isVerified:false, isOpen:false,
    stock:{},
  },
];

const PATIENTS = [
  {
    firstName:'Arun', lastName:'Kumar',
    email:'arun@test.com', password:'Test@1234',
    role:'patient', district:'Salem',
    phone:'9876543210', bloodGroup:'B+', isVerified:true,
  },
  {
    firstName:'Priya', lastName:'Rajan',
    email:'priya@test.com', password:'Test@1234',
    role:'patient', district:'Coimbatore',
    phone:'9876543211', bloodGroup:'O-', isVerified:true,
  },
  {
    firstName:'Karthik', lastName:'S',
    email:'karthik@test.com', password:'Test@1234',
    role:'patient', district:'Madurai',
    phone:'9876543212', bloodGroup:'A+', isVerified:true,
  },
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser:true, useUnifiedTopology:true,
    });
    console.log('✅  Connected to MongoDB Atlas');

    if (process.argv.includes('--reset')) {
      await Promise.all([
        User.deleteMany({}), Stock.deleteMany({}),
        Donation.deleteMany({}), Payment.deleteMany({}),
        Alert.deleteMany({}),
      ]);
      console.log('🗑   All data cleared');
    }

    // Admin
    const existingAdmin = await User.findOne({ email: ADMIN.email });
    if (!existingAdmin) {
      await User.create(ADMIN);
      console.log('✅  Admin: ' + ADMIN.email + ' / ' + ADMIN.password);
    } else {
      console.log('⏭   Admin already exists');
    }

    // Blood banks + stock
    const bankDocs = [];
    for (const bankData of BLOOD_BANKS) {
      const { stock, ...userData } = bankData;
      let bank = await User.findOne({ email: userData.email });
      if (!bank) {
        bank = await User.create(userData);
        console.log('✅  Bank: ' + userData.orgName + ' (' + userData.district + ')' + (userData.isVerified ? '' : ' [PENDING]'));
      } else {
        console.log('⏭   Bank exists: ' + userData.orgName);
      }
      if (userData.isVerified && Object.keys(stock).length > 0) {
        await Stock.findOneAndUpdate(
          { bank: bank._id },
          { bank: bank._id, ...stock, lastUpdatedAt: new Date() },
          { upsert: true, new: true }
        );
      }
      bankDocs.push(bank);
    }

    // Patients
    const patientDocs = [];
    for (const p of PATIENTS) {
      let patient = await User.findOne({ email: p.email });
      if (!patient) {
        patient = await User.create(p);
        console.log('✅  Patient: ' + p.email + ' / ' + p.password);
      } else {
        console.log('⏭   Patient exists: ' + p.email);
      }
      patientDocs.push(patient);
    }

    // Sample donations (if none exist)
    const donationCount = await Donation.countDocuments();
    if (donationCount === 0 && bankDocs[0]) {
      await Donation.insertMany([
        { bank:bankDocs[0]._id, bloodGroup:'B+', units:3, donorName:'Ramesh Kumar', donorAge:28, donatedAt:new Date(Date.now()-2*60*60*1000) },
        { bank:bankDocs[0]._id, bloodGroup:'O+', units:2, donorName:'Vijay S', donorAge:35, donatedAt:new Date(Date.now()-5*60*60*1000) },
        { bank:bankDocs[2]._id, bloodGroup:'A+', units:4, donorName:'Priya M', donorAge:24, donatedAt:new Date(Date.now()-24*60*60*1000) },
      ]);
      console.log('✅  Sample donations created');
    }

    // Sample alerts
    const alertCount = await Alert.countDocuments();
    if (alertCount === 0 && patientDocs.length > 0) {
      await Alert.insertMany([
        { patient:patientDocs[0]._id, bloodGroup:'B+', district:'Salem',      active:true },
        { patient:patientDocs[1]._id, bloodGroup:'O-', district:'Coimbatore', active:true },
      ]);
      console.log('✅  Sample alerts created');
    }

    // Sample payment
    const paymentCount = await Payment.countDocuments();
    if (paymentCount === 0) {
      await Payment.create({
        donor:{ name:'Karthik S', email:'karthik@test.com', phone:'9876543212' },
        amount:500, message:'Keep up the great work! — Karthik, Madurai',
        razorpayOrderId:'sim_order_seed', razorpayPaymentId:'sim_pay_seed',
        status:'paid', paidAt:new Date(),
      });
      console.log('✅  Sample support payment created (₹500)');
    }

    console.log('\n══════════════════════════════════════════');
    console.log('🩸  BloodLink TN — Seed Complete!');
    console.log('══════════════════════════════════════════');
    console.log('\n📋  TEST ACCOUNTS:\n');
    console.log('👑  Admin:');
    console.log('    Email:    ' + ADMIN.email);
    console.log('    Password: ' + ADMIN.password);
    console.log('\n🏥  Blood Banks:');
    BLOOD_BANKS.forEach(b => {
      console.log('    ' + b.orgName + ' (' + b.district + ')' + (b.isVerified ? '' : ' ← PENDING APPROVAL'));
      console.log('    Email: ' + b.email + '  Password: ' + b.password);
    });
    console.log('\n👤  Patients:');
    PATIENTS.forEach(p => {
      console.log('    ' + p.firstName + ' ' + p.lastName + ' — ' + p.email + '  Password: ' + p.password);
    });
    console.log('\n══════════════════════════════════════════\n');
    process.exit(0);
  } catch(err) {
    console.error('❌  Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
