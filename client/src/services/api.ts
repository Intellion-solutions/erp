import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import toast from 'react-hot-toast';
import { 
  User, 
  Product, 
  Category, 
  Supplier, 
  Customer, 
  Sale, 
  Purchase, 
  Payment,
  StockMovement,
  AuditLog,
  Setting,
  PaginationParams,
  PaginationResult,
  ApiResponse
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

class ApiService {
  private axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor to add auth token
    this.axiosInstance.interceptors.request.use(
      (config) => {
        const tokens = localStorage.getItem('erp_tokens');
        if (tokens) {
          const { accessToken } = JSON.parse(tokens);
          config.headers.Authorization = `Bearer ${accessToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor to handle token refresh
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const tokens = localStorage.getItem('erp_tokens');
            if (tokens) {
              const { refreshToken } = JSON.parse(tokens);
              const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
                refreshToken
              });

              const newTokens = {
                accessToken: response.data.accessToken,
                refreshToken: response.data.refreshToken
              };

              localStorage.setItem('erp_tokens', JSON.stringify(newTokens));
              originalRequest.headers.Authorization = `Bearer ${newTokens.accessToken}`;

              return this.axiosInstance(originalRequest);
            }
          } catch (refreshError) {
            localStorage.removeItem('erp_tokens');
            localStorage.removeItem('erp_user');
            window.location.href = '/login';
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  // Generic API methods
  private async request<T>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    try {
      return await this.axiosInstance.request<T>(config);
    } catch (error: any) {
      if (error.response?.status >= 500) {
        toast.error('Server error. Please try again later.');
      }
      throw error;
    }
  }

  async get<T>(url: string, params?: any): Promise<AxiosResponse<T>> {
    return this.request<T>({ method: 'GET', url, params });
  }

  async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ method: 'POST', url, data, ...config });
  }

  async put<T>(url: string, data?: any): Promise<AxiosResponse<T>> {
    return this.request<T>({ method: 'PUT', url, data });
  }

  async patch<T>(url: string, data?: any): Promise<AxiosResponse<T>> {
    return this.request<T>({ method: 'PATCH', url, data });
  }

  async delete<T>(url: string): Promise<AxiosResponse<T>> {
    return this.request<T>({ method: 'DELETE', url });
  }
}

const api = new ApiService();

// Authentication API
export const authApi = {
  login: (credentials: { email: string; password: string }) =>
    api.post<{ user: User; accessToken: string; refreshToken: string }>('/auth/login', credentials),
  
  register: (userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: string;
    phone?: string;
  }) => api.post<{ user: User }>('/auth/register', userData),
  
  refreshToken: (refreshToken: string) =>
    api.post<{ accessToken: string; refreshToken: string }>('/auth/refresh', { refreshToken }),
  
  getProfile: () => api.get<{ user: User }>('/auth/profile'),
  
  updateProfile: (data: Partial<User>) =>
    api.put<{ user: User }>('/auth/profile', data),
  
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.put('/auth/change-password', data),
  
  logout: () => api.post('/auth/logout'),
};

// Users API
export const usersApi = {
  getUsers: (params?: PaginationParams & { search?: string; role?: string }) =>
    api.get<PaginationResult<User>>('/users', params),
  
  getUser: (id: string) => api.get<{ user: User }>(`/users/${id}`),
  
  createUser: (userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>) =>
    api.post<{ user: User }>('/users', userData),
  
  updateUser: (id: string, userData: Partial<User>) =>
    api.put<{ user: User }>(`/users/${id}`, userData),
  
  deleteUser: (id: string) => api.delete(`/users/${id}`),
};

// Products API
export const productsApi = {
  getProducts: (params?: PaginationParams & {
    search?: string;
    category?: string;
    supplier?: string;
    status?: string;
    lowStock?: boolean;
  }) => api.get<{ products: Product[]; pagination: any }>('/products', params),
  
  getProduct: (id: string) => api.get<{ product: Product }>(`/products/${id}`),
  
  createProduct: (productData: FormData | any) =>
    api.post<{ product: Product }>('/products', productData),
  
  updateProduct: (id: string, productData: FormData | any) =>
    api.put<{ product: Product }>(`/products/${id}`, productData),
  
  deleteProduct: (id: string) => api.delete(`/products/${id}`),
  
  adjustStock: (id: string, adjustment: {
    quantity: number;
    type: string;
    reference?: string;
    notes?: string;
  }) => api.post<{ product: Product; stockMovement: StockMovement }>(`/products/${id}/stock/adjust`, adjustment),
  
  getStockMovements: (id: string, params?: PaginationParams) =>
    api.get<{ movements: StockMovement[]; pagination: any }>(`/products/${id}/stock/movements`, params),
};

// Categories API
export const categoriesApi = {
  getCategories: (params?: { search?: string }) =>
    api.get<{ categories: Category[] }>('/categories', params),
  
  getCategory: (id: string) => api.get<{ category: Category }>(`/categories/${id}`),
  
  createCategory: (categoryData: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>) =>
    api.post<{ category: Category }>('/categories', categoryData),
  
  updateCategory: (id: string, categoryData: Partial<Category>) =>
    api.put<{ category: Category }>(`/categories/${id}`, categoryData),
  
  deleteCategory: (id: string) => api.delete(`/categories/${id}`),
};

// Suppliers API
export const suppliersApi = {
  getSuppliers: (params?: PaginationParams & { search?: string }) =>
    api.get<{ suppliers: Supplier[]; pagination: any }>('/suppliers', params),
  
  getSupplier: (id: string) => api.get<{ supplier: Supplier }>(`/suppliers/${id}`),
  
  createSupplier: (supplierData: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>) =>
    api.post<{ supplier: Supplier }>('/suppliers', supplierData),
  
  updateSupplier: (id: string, supplierData: Partial<Supplier>) =>
    api.put<{ supplier: Supplier }>(`/suppliers/${id}`, supplierData),
  
  deleteSupplier: (id: string) => api.delete(`/suppliers/${id}`),
};

// Customers API
export const customersApi = {
  getCustomers: (params?: PaginationParams & { search?: string }) =>
    api.get<{ customers: Customer[]; pagination: any }>('/customers', params),
  
  getCustomer: (id: string) => api.get<{ customer: Customer }>(`/customers/${id}`),
  
  createCustomer: (customerData: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>) =>
    api.post<{ customer: Customer }>('/customers', customerData),
  
  updateCustomer: (id: string, customerData: Partial<Customer>) =>
    api.put<{ customer: Customer }>(`/customers/${id}`, customerData),
  
  deleteCustomer: (id: string) => api.delete(`/customers/${id}`),
};

// Sales API
export const salesApi = {
  getSales: (params?: PaginationParams & {
    search?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    userId?: string;
    customerId?: string;
  }) => api.get<{ sales: Sale[]; pagination: any }>('/sales', params),
  
  getSale: (id: string) => api.get<{ sale: Sale }>(`/sales/${id}`),
  
  createSale: (saleData: any) => api.post<{ sale: Sale }>('/sales', saleData),
  
  updateSale: (id: string, saleData: Partial<Sale>) =>
    api.put<{ sale: Sale }>(`/sales/${id}`, saleData),
  
  deleteSale: (id: string) => api.delete(`/sales/${id}`),
};

// POS API
export const posApi = {
  getProducts: (params?: { search?: string; category?: string; barcode?: string }) =>
    api.get<{ products: Product[] }>('/pos/products', params),
  
  getProductByIdentifier: (identifier: string) =>
    api.get<{ product: Product }>(`/pos/product/${identifier}`),
  
  startSale: (data: { customerId?: string; terminalId?: string }) =>
    api.post<{ sale: Sale }>('/pos/sale/start', data),
  
  addItemToSale: (saleId: string, item: {
    productId: string;
    quantity: number;
    discount?: number;
  }) => api.post<{ item: any; sale: Sale }>(`/pos/sale/${saleId}/items`, item),
  
  removeItemFromSale: (saleId: string, itemId: string) =>
    api.delete<{ sale: Sale }>(`/pos/sale/${saleId}/items/${itemId}`),
  
  completeSale: (saleId: string, payment: {
    paymentMethod: string;
    amountPaid: number;
    paymentReference?: string;
    notes?: string;
  }) => api.post<{ sale: Sale; payment: Payment; change: number }>(`/pos/sale/${saleId}/complete`, payment),
  
  getSale: (saleId: string) => api.get<{ sale: Sale }>(`/pos/sale/${saleId}`),
  
  generateQR: (saleId: string) =>
    api.get<{ qrCode: string; receiptData: any }>(`/pos/sale/${saleId}/qr`),
};

// Purchases API
export const purchasesApi = {
  getPurchases: (params?: PaginationParams & {
    search?: string;
    status?: string;
    supplierId?: string;
  }) => api.get<{ purchases: Purchase[]; pagination: any }>('/purchases', params),
  
  getPurchase: (id: string) => api.get<{ purchase: Purchase }>(`/purchases/${id}`),
  
  createPurchase: (purchaseData: any) => api.post<{ purchase: Purchase }>('/purchases', purchaseData),
  
  updatePurchase: (id: string, purchaseData: Partial<Purchase>) =>
    api.put<{ purchase: Purchase }>(`/purchases/${id}`, purchaseData),
  
  deletePurchase: (id: string) => api.delete(`/purchases/${id}`),
  
  receivePurchase: (id: string) => api.post(`/purchases/${id}/receive`),
};

// Reports API
export const reportsApi = {
  getDashboardStats: (params?: { startDate?: string; endDate?: string }) =>
    api.get<any>('/reports/dashboard', params),
  
  getSalesReport: (params?: {
    startDate?: string;
    endDate?: string;
    groupBy?: string;
  }) => api.get<any>('/reports/sales', params),
  
  getInventoryReport: () => api.get<any>('/reports/inventory'),
  
  getFinancialReport: (params?: {
    startDate?: string;
    endDate?: string;
  }) => api.get<any>('/reports/financial', params),
};

// Audit API
export const auditApi = {
  getAuditLogs: (params?: PaginationParams & {
    userId?: string;
    action?: string;
    entity?: string;
    startDate?: string;
    endDate?: string;
  }) => api.get<{ logs: AuditLog[]; pagination: any }>('/audit', params),
  
  getAuditStats: (params?: {
    startDate?: string;
    endDate?: string;
  }) => api.get<any>('/audit/stats', params),
};

// Settings API
export const settingsApi = {
  getSettings: () => api.get<{ settings: Setting[] }>('/settings'),
  
  getSetting: (key: string) => api.get<{ setting: Setting }>(`/settings/${key}`),
  
  updateSetting: (key: string, value: any) =>
    api.put<{ setting: Setting }>(`/settings/${key}`, { value }),
  
  createSetting: (settingData: { key: string; value: any; description?: string }) =>
    api.post<{ setting: Setting }>('/settings', settingData),
  
  deleteSetting: (key: string) => api.delete(`/settings/${key}`),
};

export default api;