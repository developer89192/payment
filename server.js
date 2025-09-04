const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const orderRoutes = require('./routes/orderRoutes');
const pingRoute = require('./routes/pingRoute');
const connectUsersDb = require('./utils/usersDbConnection');

dotenv.config();

// Print envs to check if loaded
console.log("RAZORPAY_KEY_ID:", process.env.RAZORPAY_KEY_ID);
console.log("RAZORPAY_KEY_SECRET:", process.env.RAZORPAY_KEY_SECRET);
console.log("DB_URI:", process.env.DB_URI);

const app = express();
const PORT = 5001;

// Middlewares
app.use(cors({ origin: 'https://www.rythuri.com', credentials: true }));
app.use(express.json());

app.use((req, res, next) => {
  console.log(`📥 Received request: ${req.method} ${req.url}`);
  next();
});

app.use('/', pingRoute);
app.use('/api/orders', orderRoutes);

mongoose.connect(process.env.DB_URI)
  .then(async () => {
    console.log('✅ Admin DB connected');
    try {
      await connectUsersDb();
    } catch (err) {
      console.error('❌ Users DB connection failed:', err.message);
      process.exit(1);
    }
    app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Admin DB connection failed:', err.message);
  });