require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { syncDatabase } = require('./models');

const app = express();

// Middleware
// CORS configuration - allow requests from frontend
// In production, set FRONTEND_URL environment variable to your frontend URL
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'https://order-ledger.onrender.com' // Render frontend
];

if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    // In development, allow all origins
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    // In production, check allowed origins
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(null, true); // Temporarily allow all for debugging - remove in production
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images statically
app.use('/uploads', express.static('uploads'));

// Routes
app.use('/api', require('./routes'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'OrderLedger API is running' });
});

const PORT = process.env.PORT || 8000;

// Initialize database and sync models
syncDatabase(false)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });

module.exports = app;
