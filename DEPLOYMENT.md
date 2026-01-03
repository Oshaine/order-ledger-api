# Deployment Guide for OrderLedger API

## Why Not Netlify?

Netlify is designed for static sites and serverless functions. Your backend is a full Express.js application with:
- MySQL database connections
- File uploads and static file serving
- Persistent server processes

**Netlify cannot run this type of backend.**

## Recommended Deployment Options

### Option 1: Railway (Easiest - Recommended) 🚂

Railway is the simplest option with built-in database support.

**Steps:**
1. Go to [railway.app](https://railway.app) and sign up/login
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your `order-ledger-api` repository
4. Railway will automatically detect it's a Node.js app
5. Add a MySQL database:
   - Click "+ New" → "Database" → "MySQL"
6. Set environment variables:
   - Go to your service → "Variables"
   - Add these variables (Railway will auto-populate DB variables from the MySQL service):
     ```
     PORT=8000
     DB_HOST=<auto-filled from MySQL service>
     DB_USER=<auto-filled from MySQL service>
     DB_PASSWORD=<auto-filled from MySQL service>
     DB_NAME=<auto-filled from MySQL service>
     JWT_SECRET=<generate a random secret key>
     NODE_ENV=production
     ```
7. Railway will automatically deploy and give you a URL like: `https://your-app.railway.app`

**Pros:**
- Very easy setup
- Built-in MySQL database
- Automatic deployments from GitHub
- Free tier available (with usage limits)

---

### Option 2: Render 🎨

Render offers a free tier and is straightforward to use.

**Steps:**
1. Go to [render.com](https://render.com) and sign up/login
2. Click "New +" → "Web Service"
3. Connect your GitHub repository (`order-ledger-api`)
4. Configure:
   - **Name:** order-ledger-api
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free (or paid for better performance)
5. Add a PostgreSQL database (Render uses PostgreSQL, not MySQL):
   - Click "New +" → "PostgreSQL"
   - Note: You'll need to update your database config to use PostgreSQL
6. Set environment variables in the Web Service:
   ```
   PORT=10000
   DB_HOST=<from PostgreSQL service>
   DB_USER=<from PostgreSQL service>
   DB_PASSWORD=<from PostgreSQL service>
   DB_NAME=<from PostgreSQL service>
   JWT_SECRET=<generate a random secret key>
   NODE_ENV=production
   ```

**Note:** Render uses PostgreSQL, not MySQL. You'll need to:
- Update `config/database.js` to use PostgreSQL dialect
- Install `pg` and `pg-hstore` packages
- Update Sequelize config

**Pros:**
- Free tier available
- Easy GitHub integration
- Automatic SSL

---

### Option 3: DigitalOcean App Platform 💧

**Steps:**
1. Go to [digitalocean.com](https://www.digitalocean.com)
2. Create an App Platform project
3. Connect GitHub repository
4. Configure:
   - Detect Node.js automatically
   - Add MySQL database component
   - Set environment variables

**Pros:**
- Good performance
- Reasonable pricing
- Easy scaling

---

## Important Notes

### File Uploads
The `uploads/` directory won't persist on most platforms. Consider:
- Using cloud storage (AWS S3, Cloudinary, etc.)
- Or use the platform's persistent storage if available

### Database Migration
Your app uses Sequelize auto-sync. In production, consider:
- Using migrations instead of auto-sync
- Or ensure auto-sync only runs once on first deploy

### Environment Variables
Never commit `.env` files. Set all variables in your hosting platform's dashboard.

### CORS Configuration
Update CORS in `server.js` to allow your Netlify frontend domain:
```javascript
app.use(cors({
  origin: ['https://your-netlify-app.netlify.app', 'http://localhost:5173'],
  credentials: true
}));
```

---

## Quick Start with Railway (Recommended)

1. **Sign up:** [railway.app](https://railway.app)
2. **Deploy:** Connect GitHub → Select `order-ledger-api` repo
3. **Add Database:** Click "+ New" → "Database" → "MySQL"
4. **Set Variables:** Add `JWT_SECRET` (generate a random string)
5. **Deploy:** Railway handles the rest automatically!

Your backend will be live at: `https://your-app.up.railway.app`

Then update your frontend's `VITE_API_URL` environment variable in Netlify to point to your Railway backend URL.

