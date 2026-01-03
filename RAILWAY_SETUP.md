# Railway Setup - Step by Step

## The Problem
Your app is trying to connect to `localhost` because Railway's MySQL database variables are not being passed to your app service.

## Solution: Link the MySQL Database to Your App

### Step 1: Verify MySQL Database Exists
1. In your Railway project dashboard, check if you have a MySQL service
2. If not, create one:
   - Click **"+ New"** → **"Database"** → **"MySQL"**
   - Wait for it to be created

### Step 2: Link Database to Your App Service
1. Click on your **app service** (order-ledger-api)
2. Go to the **"Variables"** tab
3. Click **"+ New Variable"**
4. Select **"Reference"** (not "Raw")
5. In the dropdown, select your **MySQL database service**
6. Click **"Add"**

### Step 3: Verify Variables Were Added
After adding the reference, you should see these variables automatically appear:
- `MYSQL_HOST`
- `MYSQL_USER`
- `MYSQLPASSWORD`
- `MYSQLDATABASE`
- `MYSQL_PORT`

### Step 4: Add Other Required Variables
Make sure you also have:
- `PORT=8000` (or Railway will auto-set this)
- `JWT_SECRET=<your-random-secret-key>` (manually add this)
- `NODE_ENV=production` (optional, but recommended)

### Step 5: Redeploy
1. Railway should automatically redeploy when you add variables
2. If not, go to **"Deployments"** → Click **"Redeploy"**
3. Check the logs - you should now see:
   - `✅ Available database environment variables: MYSQL_HOST=..., MYSQL_USER=..., etc.`
   - `Database connection config: { host: '...', ... }` (should NOT be localhost)

## Troubleshooting

### If variables still don't appear:
1. Make sure you selected **"Reference"** (not "Raw")
2. Make sure you selected the correct MySQL service
3. Try removing and re-adding the reference
4. Check that the MySQL service is running (green status)

### If connection still fails:
1. Check the logs for the actual connection values
2. Verify the MySQL service is running
3. Make sure you're using the correct service name when creating the reference

## Quick Checklist
- [ ] MySQL database service exists in Railway
- [ ] Database reference added to app service variables
- [ ] `MYSQL_*` variables visible in app service variables
- [ ] `JWT_SECRET` is set
- [ ] App has been redeployed
- [ ] Logs show non-localhost database host

