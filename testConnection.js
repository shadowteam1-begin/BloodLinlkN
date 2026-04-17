// Test MongoDB replica set connection
require('dotenv').config({ path: require('path').join(__dirname,'../.env') });
const mongoose = require('mongoose');

console.log('🔗 Testing MongoDB connection...');
console.log('   Host: ac-hbm6pbg shard cluster');

mongoose.connect(process.env.MONGO_URI, {
  serverSelectionTimeoutMS: 15000,
  socketTimeoutMS: 45000,
})
.then(conn => {
  console.log('✅  Connected to MongoDB Atlas!');
  console.log('📦  Database:', conn.connection.name);
  console.log('🏠  Host:',     conn.connection.host);
  process.exit(0);
})
.catch(err => {
  console.error('❌  Connection failed:', err.message);
  console.log('\n💡 Check your MONGO_URI in .env file');
  process.exit(1);
});
