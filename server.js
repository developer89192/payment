// server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const orderRoutes = require('./routes/orderRoutes');

dotenv.config();

const app = express();
const PORT = 5001;

// Middlewares
app.use(cors({ origin: 'http://192.168.101.3:3001', credentials: true }));
app.use(express.json());

app.use((req, res, next) => {
  console.log(`📥 Received request: ${req.method} ${req.url}`);
  next();
});

// API Routes
app.use('/api/orders', orderRoutes);

// Connect to MongoDB and start server
mongoose.connect(process.env.DB_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err);
  });
