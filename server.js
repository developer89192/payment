// server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const orderRoutes = require('./routes/orderRoutes');
const pingRoute = require('./routes/pingRoute');
const connectUsersDb = require('./utils/usersDbConnection'); // ✅ import user DB connection

dotenv.config();

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

// Connect admin DB first
mongoose.connect(process.env.DB_URI)
  .then(async () => {
    console.log('✅ Admin DB connected');

    // ✅ Connect to Users DB too (only once)
    try {
      await connectUsersDb(); // will log its own messages
    } catch (err) {
      console.error('❌ Users DB connection failed:', err.message);
      process.exit(1); // stop if users DB is critical
    }

    // Start server after both DBs are connected
    app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Admin DB connection failed:', err.message);
  });
