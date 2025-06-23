// utils/usersDbConnection.js
const mongoose = require('mongoose');

let usersDb = null;

const connectUsersDb = async () => {
  if (usersDb) return usersDb;

  const uri = process.env.MONGO_URI_USERS;
  if (!uri) {
    throw new Error("❌ Missing MONGO_URI_USERS in .env");
  }

  console.log("⏳ Attempting to connect to Users DB...");

  try {
    usersDb = mongoose.createConnection(uri); // ⬅️ no deprecated options

    await new Promise((resolve, reject) => {
      usersDb.once('open', resolve);
      usersDb.on('error', reject);
    });

    console.log("✅ Successfully connected to Users DB.");
    return usersDb;
  } catch (err) {
    console.error("❌ Users DB connection error:", err.message);
    throw err;
  }
};

module.exports = connectUsersDb;
