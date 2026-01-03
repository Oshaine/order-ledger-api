# OrderLedger API

Backend API for OrderLedger POS system built with Node.js, Express, Sequelize, and MySQL.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory:

**For Local Development:**
```
PORT=8000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=orderledger
JWT_SECRET=your-secret-key-change-in-production
NODE_ENV=development
```

**For Production (e.g., Railway, Render, etc.):**
```
PORT=8000
DB_HOST=<auto-filled from MySQL service>
DB_USER=<auto-filled from MySQL service>
DB_PASSWORD=<auto-filled from MySQL service>
DB_NAME=<auto-filled from MySQL service>
JWT_SECRET=<generate a random secret key>
NODE_ENV=production
```

**Note:** When deploying to platforms like Railway, the database variables (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME) are typically auto-filled when you connect a MySQL database service. You only need to manually set `JWT_SECRET` with a strong random string.

3. Make sure MySQL is running and the database exists (or Sequelize will create it).

4. Start the server:
```bash
npm run dev
```

The server will automatically:
- Connect to the database
- Sync all models (create tables if they don't exist)
- Create default roles (admin, cashier, delivery)
- Create a default admin user (username: `admin`, password: `admin123`)

## Project Structure

```
order-ledger-api/
├── config/
│   └── database.js          # Sequelize database configuration
├── controllers/             # Business logic controllers
│   ├── authController.js
│   ├── userController.js
│   ├── menuController.js
│   ├── inventoryController.js
│   ├── salesController.js
│   ├── shiftController.js
│   ├── deliveryController.js
│   └── reportsController.js
├── middleware/
│   ├── auth.js              # JWT authentication & authorization
│   └── audit.js             # Audit logging helper
├── models/                  # Sequelize models
│   ├── index.js             # Model associations & sync
│   ├── User.js
│   ├── Role.js
│   ├── Shift.js
│   ├── MenuItem.js
│   ├── MenuItemSize.js
│   ├── InventoryItem.js
│   ├── InventoryLog.js
│   ├── Sale.js
│   ├── SaleItem.js
│   ├── Payment.js
│   ├── CashDenomination.js
│   ├── Delivery.js
│   └── AuditLog.js
├── routes/
│   ├── index.js             # Main routes file
│   ├── auth.js
│   ├── users.js
│   ├── menu.js
│   ├── inventory.js
│   ├── sales.js
│   ├── shifts.js
│   ├── deliveries.js
│   └── reports.js
├── utils/
│   └── invoiceNumber.js     # Invoice number generation
├── server.js                # Express app entry point
└── package.json
```

## API Routes

All routes are prefixed with `/api`:

- `/api/auth` - Authentication (login, logout, current user)
- `/api/users` - User management (admin only)
- `/api/menu` - Menu items management
- `/api/inventory` - Inventory management
- `/api/sales` - Sales/orders
- `/api/shifts` - Shift tracking
- `/api/deliveries` - Delivery management
- `/api/reports` - Reports and analytics (admin only)

## Database Models

The system uses Sequelize ORM with auto-sync enabled. Tables are automatically created when the server starts.

**All models use UUID primary keys** for better security and scalability.

**Models:**
- Users (with roles: admin, cashier, delivery)
- Roles
- Shifts (clock-in/clock-out tracking)
- MenuItems & MenuItemSizes (MenuItems support image uploads)
- InventoryItems & InventoryLogs
- Sales & SaleItems
- Payments & CashDenominations
- Deliveries
- AuditLogs

### Menu Item Images

Menu items support image uploads. Images are stored in the `uploads/menu-items/` directory and served statically at `/uploads/menu-items/`.

To upload an image when creating/updating a menu item:
- Use `multipart/form-data` content type
- Include the image file with field name `image`
- Supported formats: jpeg, jpg, png, gif, webp
- Maximum file size: 5MB

## Authentication

- Uses JWT tokens
- Login automatically creates a shift (clock-in)
- Logout ends the current shift (clock-out)
- Role-based access control (RBAC)

## Default Credentials

- Username: `admin`
- Password: `admin123`

**⚠️ Change the default admin password in production!**
