# Enterprise Resource Planning (ERP) System

A comprehensive, modular, and high-performance Enterprise Resource Planning system built with modern technologies. This system provides complete business management capabilities including POS, inventory management, sales, purchasing, finance, and analytics.

## 🚀 Features

### Core Modules
- **Point of Sale (POS)** - Multi-terminal, real-time synchronized POS system
- **Inventory Management** - Barcode/RFID integration with stock tracking
- **Sales & Invoicing** - Tax calculation and receipt printing
- **Purchases & Supplier Management** - Complete procurement workflow
- **Finance & Accounting** - Cash flow, ledger, and bank integration
- **Audit Logs & Compliance** - Complete activity tracking and monitoring
- **Analytics & Reporting** - Advanced insights with ML-powered forecasting

### Key Features
- **Real-time Synchronization** - Multi-terminal POS with instant updates
- **Offline Support** - Service Workers + IndexedDB for offline operations
- **Role-based Access Control** - Owner, Manager, Salesperson roles
- **Multi-device Support** - Responsive design for desktop, tablet, mobile
- **Barcode/RFID Support** - WebUSB and Serial port integration
- **Notifications** - Email/SMS/Push notifications
- **Beautiful UI** - Modern Material-UI design
- **RESTful APIs** - Complete API coverage for all operations

## 🏗️ Architecture

### Technology Stack

#### Frontend
- **React 18** with TypeScript
- **Material-UI (MUI)** for UI components
- **React Query** for data fetching and caching
- **Zustand** for state management
- **Socket.io Client** for real-time updates
- **Vite** for fast development and building
- **PWA** support with offline capabilities

#### Backend
- **Node.js** with Express.js
- **Python Django** for analytics microservice
- **Socket.io** for real-time communication
- **Prisma ORM** for database operations
- **JWT** authentication with refresh tokens
- **Bcrypt** for password hashing
- **Multer** for file uploads

#### Databases
- **PostgreSQL** - Primary database for transactions
- **Redis** - Caching and session management
- **MongoDB** - Audit logs and analytics data

#### Additional Technologies
- **Docker & Docker Compose** for containerization
- **Winston** for logging
- **Celery** for background tasks
- **Pandas & Plotly** for analytics
- **Sharp** for image processing

## 🚦 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Python 3.9+
- Docker and Docker Compose
- PostgreSQL 15+
- Redis 7+
- MongoDB 6+

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd enterprise-erp-system
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start databases with Docker**
   ```bash
   docker-compose up -d
   ```

4. **Install dependencies**
   ```bash
   npm run setup
   ```

5. **Set up the database**
   ```bash
   npx prisma migrate dev
   npx prisma generate
   npx prisma db seed
   ```

6. **Start the development servers**
   ```bash
   npm run dev
   ```

This will start:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001  
- Analytics Service: http://localhost:8000

### Default Login Credentials
- **Owner**: owner@company.com / Password123!
- **Manager**: manager@company.com / Password123!
- **Salesperson**: sales@company.com / Password123!

## 📱 Usage

### Point of Sale (POS)
1. Navigate to the POS interface
2. Search for products or scan barcodes
3. Add items to cart
4. Select customer (optional)
5. Process payment
6. Print receipt

### Inventory Management
1. Add products with categories and suppliers
2. Set stock levels and reorder points
3. Scan barcodes for quick updates
4. Track stock movements
5. Generate inventory reports

### Sales & Reporting
1. View sales dashboard
2. Generate sales reports by date range
3. Track performance by salesperson
4. Monitor payment methods
5. Export data to CSV/Excel

### User Management (Owner/Manager)
1. Create user accounts
2. Assign roles and permissions
3. Monitor user activity
4. Reset passwords
5. View audit logs

## 🔧 Configuration

### Environment Variables

```env
# Database Configuration
DATABASE_URL="postgresql://user:password@localhost:5432/erp_main"
REDIS_URL="redis://localhost:6379"
MONGODB_URL="mongodb://user:password@localhost:27017/erp_logs"

# Authentication
JWT_SECRET="your-secret-key"
JWT_REFRESH_SECRET="your-refresh-secret"

# Email & SMS
SMTP_HOST="smtp.gmail.com"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
TWILIO_ACCOUNT_SID="your-twilio-sid"
TWILIO_AUTH_TOKEN="your-twilio-token"

# Company Information
COMPANY_NAME="Your Company Name"
COMPANY_ADDRESS="Your Address"
COMPANY_PHONE="Your Phone"
COMPANY_EMAIL="contact@company.com"
```

### Role-Based Permissions

#### Owner (Super Admin)
- Full system access
- User management
- System settings
- All reports and analytics
- Audit log access

#### Manager
- Inventory management
- Staff management (limited)
- Sales and purchase operations
- Reporting and analytics
- Customer and supplier management

#### Salesperson
- POS interface access
- View product catalog
- Process sales
- Limited sales reports
- Customer management (limited)

## 🔌 API Documentation

### Authentication Endpoints
```
POST /api/auth/login
POST /api/auth/register
POST /api/auth/refresh
GET  /api/auth/profile
PUT  /api/auth/profile
POST /api/auth/logout
```

### Product Management
```
GET    /api/products
POST   /api/products
GET    /api/products/:id
PUT    /api/products/:id
DELETE /api/products/:id
POST   /api/products/:id/stock/adjust
```

### POS Operations
```
GET  /api/pos/products
GET  /api/pos/product/:identifier
POST /api/pos/sale/start
POST /api/pos/sale/:id/items
POST /api/pos/sale/:id/complete
```

### Real-time Events (Socket.io)
```
sale_started
sale_item_added
sale_item_removed
sale_completed
inventory_updated
stock_alert
notification
```

## 🔍 Analytics & Reporting

The system includes a dedicated Python analytics service that provides:

- **Sales Analytics** - Revenue trends, growth rates, top performers
- **Inventory Analytics** - Stock levels, turnover ratios, low stock alerts
- **Financial Analytics** - Cash flow, profit margins, cost analysis
- **Predictive Analytics** - Sales forecasting, demand planning
- **Interactive Charts** - Plotly-powered visualizations

### Available Reports
1. Daily/Weekly/Monthly sales reports
2. Inventory valuation reports
3. Profit & Loss statements
4. Customer purchase history
5. Supplier performance reports
6. User activity reports
7. Audit trail reports

## 🛠️ Development

### Project Structure
```
enterprise-erp-system/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable components
│   │   ├── pages/          # Page components
│   │   ├── services/       # API services
│   │   ├── hooks/          # Custom hooks
│   │   └── types/          # TypeScript types
├── server/                 # Node.js backend
│   ├── routes/             # API routes
│   ├── middleware/         # Custom middleware
│   ├── services/           # Business logic
│   ├── utils/              # Utility functions
│   └── config/             # Configuration files
├── analytics/              # Python analytics service
│   ├── reports/            # Analytics apps
│   ├── ml_insights/        # ML models
│   └── core/               # Core functionality
├── prisma/                 # Database schema
└── uploads/                # File uploads
```

### Adding New Features

1. **Backend Route**
   ```javascript
   // server/routes/newfeature.js
   const express = require('express');
   const router = express.Router();
   
   router.get('/', async (req, res) => {
     // Implementation
   });
   
   module.exports = router;
   ```

2. **Frontend Component**
   ```typescript
   // client/src/components/NewFeature.tsx
   import React from 'react';
   
   const NewFeature: React.FC = () => {
     return <div>New Feature</div>;
   };
   
   export default NewFeature;
   ```

3. **API Service**
   ```typescript
   // client/src/services/api.ts
   export const newFeatureApi = {
     getData: () => api.get('/newfeature'),
     createData: (data) => api.post('/newfeature', data)
   };
   ```

### Testing

```bash
# Run backend tests
npm test

# Run frontend tests
cd client && npm test

# Run Python tests
cd analytics && python manage.py test
```

## 📦 Deployment

### Production Deployment

1. **Build the application**
   ```bash
   npm run build
   ```

2. **Set production environment variables**
   ```bash
   NODE_ENV=production
   DATABASE_URL="your-production-db-url"
   ```

3. **Deploy with Docker**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

### Performance Optimization

- Enable Redis caching for frequently accessed data
- Use CDN for static assets
- Implement database indexing
- Enable gzip compression
- Use connection pooling
- Implement rate limiting

## 🔒 Security

### Implemented Security Features
- JWT authentication with refresh tokens
- Password hashing with bcrypt
- Role-based access control (RBAC)
- Request rate limiting
- Input validation and sanitization
- SQL injection prevention
- XSS protection
- CORS configuration
- Audit logging

### Security Best Practices
- Regular security updates
- Strong password policies
- Two-factor authentication (planned)
- Regular database backups
- SSL/TLS encryption
- Security monitoring

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow TypeScript best practices
- Write comprehensive tests
- Follow the existing code style
- Document new features
- Update API documentation

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support, email support@yourcompany.com or create an issue in the repository.

## 🗺️ Roadmap

### Version 2.0 (Planned)
- [ ] Mobile apps (React Native)
- [ ] Advanced ML forecasting
- [ ] Multi-location support
- [ ] Advanced reporting builder
- [ ] API marketplace integrations
- [ ] Blockchain supply chain tracking
- [ ] AI-powered chatbot support
- [ ] Advanced workflow automation

### Version 1.1 (Next Release)
- [ ] Two-factor authentication
- [ ] Advanced user permissions
- [ ] Backup and restore functionality
- [ ] Performance monitoring dashboard
- [ ] Advanced search and filtering
- [ ] Bulk operations support

---

**Built with ❤️ by the ERP Development Team**
