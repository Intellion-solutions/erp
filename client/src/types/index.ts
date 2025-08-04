export enum Role {
  OWNER = 'OWNER',
  MANAGER = 'MANAGER',
  SALESPERSON = 'SALESPERSON'
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED'
}

export enum TransactionType {
  SALE = 'SALE',
  PURCHASE = 'PURCHASE',
  RETURN = 'RETURN',
  ADJUSTMENT = 'ADJUSTMENT',
  TRANSFER = 'TRANSFER'
}

export enum PaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  BANK_TRANSFER = 'BANK_TRANSFER',
  MOBILE_MONEY = 'MOBILE_MONEY',
  CHEQUE = 'CHEQUE',
  CREDIT = 'CREDIT'
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED'
}

export enum ProductStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DISCONTINUED = 'DISCONTINUED'
}

export enum OrderStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED'
}

export interface User {
  id: string;
  email: string;
  username?: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: Role;
  status: UserStatus;
  lastLogin?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  parent?: Category;
  children?: Category[];
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  sku: string;
  barcode?: string;
  rfidTag?: string;
  price: number;
  cost: number;
  minStock: number;
  maxStock?: number;
  currentStock: number;
  unit: string;
  status: ProductStatus;
  categoryId: string;
  supplierId?: string;
  taxRate: number;
  image?: string;
  category?: Category;
  supplier?: Supplier;
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  contactPerson?: string;
  taxId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  taxId?: string;
  creditLimit?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Sale {
  id: string;
  saleNumber: string;
  customerId?: string;
  userId: string;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  notes?: string;
  terminalId?: string;
  customer?: Customer;
  user?: User;
  items?: SaleItem[];
  payments?: Payment[];
  createdAt: string;
  updatedAt: string;
}

export interface SaleItem {
  id: string;
  saleId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  total: number;
  product?: Product;
}

export interface Purchase {
  id: string;
  purchaseNumber: string;
  supplierId: string;
  userId: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  status: OrderStatus;
  expectedDate?: string;
  receivedDate?: string;
  notes?: string;
  supplier?: Supplier;
  user?: User;
  items?: PurchaseItem[];
  payments?: Payment[];
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseItem {
  id: string;
  purchaseId: string;
  productId: string;
  quantity: number;
  unitCost: number;
  taxRate: number;
  total: number;
  product?: Product;
}

export interface Payment {
  id: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  reference?: string;
  notes?: string;
  saleId?: string;
  purchaseId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  type: TransactionType;
  quantity: number;
  reference?: string;
  notes?: string;
  product?: Product;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId?: string;
  action: string;
  entity: string;
  entityId: string;
  oldValues?: any;
  newValues?: any;
  ipAddress?: string;
  userAgent?: string;
  user?: User;
  createdAt: string;
}

export interface Setting {
  id: string;
  key: string;
  value: any;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

export interface ApiResponse<T = any> {
  success?: boolean;
  message?: string;
  data?: T;
  error?: string;
  errors?: Array<{ field: string; message: string }>;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  user: User;
}

export interface SocketMessage {
  type: string;
  data: any;
  timestamp: string;
  from?: string;
}

export interface DashboardStats {
  todaySales: {
    total: number;
    count: number;
  };
  lowStockProducts: Product[];
  recentActivity: Sale[];
  timestamp: string;
}

export interface NotificationMessage {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
  discount: number;
  subtotal: number;
}

export interface POSSession {
  id: string;
  terminalId: string;
  sale?: Sale;
  cart: CartItem[];
  customer?: Customer;
  notes?: string;
}