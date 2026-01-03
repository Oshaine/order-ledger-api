# Render Deployment Setup

## Quick Setup Steps

### 1. Create PostgreSQL Database
1. Go to your Render dashboard
2. Click **"New +"** → **"PostgreSQL"**
3. Configure:
   - **Name:** order-ledger-db (or any name you prefer)
   - **Database:** orderledger (or leave default)
   - **User:** (auto-generated)
   - **Region:** Choose closest to you
   - **Plan:** Free (or paid for better performance)
4. Click **"Create Database"**
5. Wait for it to be created (takes a few minutes)

### 2. Create Web Service
1. Click **"New +"** → **"Web Service"**
2. Connect your GitHub repository (`order-ledger-api`)
3. Configure:
   - **Name:** order-ledger-api
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free (or paid)

### 3. Link Database to Web Service
1. In your Web Service, go to **"Environment"** tab
2. Click **"Add Environment Variable"**
3. Click **"Link Database"** (or manually add `DATABASE_URL`)
4. Select your PostgreSQL database
5. Render will automatically add the `DATABASE_URL` variable

### 4. Add Other Environment Variables
Add these in the **"Environment"** tab:
- `JWT_SECRET` = (generate a strong random string)
- `NODE_ENV` = `production`
- `PORT` = (Render sets this automatically, but you can set it if needed)

### 5. Deploy
1. Render will automatically deploy when you save
2. Check the logs to see if it connects successfully
3. Your API will be available at: `https://your-app-name.onrender.com`

## Important Notes

- **PostgreSQL vs MySQL:** Render uses PostgreSQL, not MySQL. The code now automatically detects and uses PostgreSQL when `DATABASE_URL` is present.
- **Database URL:** Render automatically provides `DATABASE_URL` when you link the database. This contains all connection info.
- **First Deploy:** The first deploy may take a few minutes. Subsequent deploys are faster.
- **Free Tier:** The free tier spins down after 15 minutes of inactivity. First request after spin-down may take 30-60 seconds.

## Troubleshooting

### Connection Refused Error
- Make sure you've linked the PostgreSQL database to your web service
- Check that `DATABASE_URL` is present in your environment variables
- Verify the database is running (green status in Render dashboard)

### Build Errors
- Make sure `pg` and `pg-hstore` are in your `package.json` dependencies
- Check that your build command is correct: `npm install`

### Database Sync Issues
- The app uses Sequelize auto-sync which will create tables on first run
- Check the logs for any migration errors
- Make sure the database user has CREATE TABLE permissions

