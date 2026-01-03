require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { syncDatabase } = require('./models');

const app = express();

// Middleware
// CORS configuration - allow requests from frontend
// In production, set FRONTEND_URL environment variable to your Netlify URL
const corsOptions = {
  origin: process.env.FRONTEND_URL 
    ? [process.env.FRONTEND_URL, 'http://localhost:3000', 'http://localhost:5173']
    : true, // Allow all origins in development
  credentials: true
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
