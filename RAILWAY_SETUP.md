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

## Alternative: Manual Method (If Reference Doesn't Work)

If the reference method isn't working, you can manually copy the variables:

1. **Get variables from MySQL service:**
   - Click on your **MySQL database service**
   - Go to the **"Variables"** tab
   - You'll see variables like:
     - `MYSQL_HOST` (or `MYSQLHOST`)
     - `MYSQL_USER` (or `MYSQLUSER`)
     - `MYSQLPASSWORD`
     - `MYSQLDATABASE`
     - `MYSQL_PORT` (or `MYSQLPORT`)

2. **Copy to your app service:**
   - Go back to your **app service** (order-ledger-api)
   - Go to **"Variables"** tab
   - Click **"+ New Variable"** → **"Raw"**
   - Add each variable one by one:
     - Key: `DB_HOST`, Value: (copy from `MYSQL_HOST` or `MYSQLHOST`)
     - Key: `DB_USER`, Value: (copy from `MYSQL_USER` or `MYSQLUSER`)
     - Key: `DB_PASSWORD`, Value: (copy from `MYSQLPASSWORD`)
     - Key: `DB_NAME`, Value: (copy from `MYSQLDATABASE`)
     - Key: `DB_PORT`, Value: (copy from `MYSQL_PORT` or `MYSQLPORT`, or use `3306`)

3. **Redeploy** and check the logs

## Troubleshooting

### If variables still don't appear (Reference Method):
1. Make sure you selected **"Reference"** (not "Raw")
2. Make sure you selected the correct MySQL service
3. Try removing and re-adding the reference
4. Check that the MySQL service is running (green status)
5. **Try the Manual Method above instead**

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

