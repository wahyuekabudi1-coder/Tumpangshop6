export interface ProductVariationOption {
  id: string;
  name: string;
  priceDelta: number;
  stock: number;
  sku?: string;
}

export interface ProductVariation {
  id: string;
  name: string;
  options: ProductVariationOption[];
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  categoryId: string;
  subcategoryId?: string;
  price: number;
  originalPrice?: number;
  stock: number;
  images: string[];
  unit: string;
  isActive: boolean;
  isFeatured?: boolean;
  slug?: string;
  variations?: ProductVariation[];
  viewCount?: number;
  salesCount?: number;
  useCustomCommission?: boolean;
  customCommissionRate?: number; // 0 - 100 percentage
  createdAt: string;
  updatedAt: string;
}

export interface ProductReview {
  id: string;
  productId: string;
  userId: string;
  userName: string;
  userEmail?: string;
  orderId?: string;
  isVerifiedPurchase: boolean;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface AffiliateApplication {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  promotionChannel: string;
  notes?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  referralCode: string;
  passwordHash?: string;
  userId?: string;
  createdAt: string;
}

export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'PAUSED' | 'ENDED';

export interface AffiliateCampaign {
  id: string;
  name: string;
  description: string;
  productIds: string[]; // List of included product IDs
  commissionRate: number; // Commission percentage (e.g. 25%)
  startDate: string; // ISO string 'YYYY-MM-DDTHH:mm:ss'
  endDate: string; // ISO string 'YYYY-MM-DDTHH:mm:ss'
  status: CampaignStatus;
  budgetLimit?: number; // Optional max commission budget (Rp)
  maxOrders?: number; // Optional max order count
  createdAt: string;
  updatedAt: string;
}

export interface CampaignConflict {
  productId: string;
  productName: string;
  conflictingCampaignNames: string[];
  message: string;
}

export interface OrderItemCommissionSnapshot {
  productId: string;
  productName: string;
  sku: string;
  price: number;
  quantity: number;
  subtotal: number;
  appliedType: 'campaign' | 'product_custom' | 'standard';
  ratePercent: number;
  commissionAmount: number;
  campaignId?: string;
  campaignName?: string;
  fallbackReason?: string;
}

export interface OrderAffiliateSnapshot {
  referralCode: string;
  affiliateId?: string;
  affiliateName?: string;
  totalCommission: number;
  itemsCommission: OrderItemCommissionSnapshot[];
  status: 'PENDING' | 'APPROVED' | 'PAID' | 'CANCELLED';
  calculatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  imagePath?: string;
  icon?: string;
  orderIndex: number;
  isActive: boolean;
  parentId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  cartItemId: string;
  product: Product;
  selectedOption?: ProductVariationOption;
  selectedVariationName?: string;
  unitPrice: number;
  quantity: number;
}

export type OrderStatus = 
  | 'NEW'                            // Menunggu Pembayaran
  | 'PAYMENT_VERIFIED'              // Pembayaran Terverifikasi
  | 'WAITING_SUPPLIER_CONFIRMATION' // Menunggu Konfirmasi Ketersediaan Pemasok
  | 'SUPPLIER_PROCESSING'           // Diproses Pemasok
  | 'PROCESSING'                    // (Alias) Diproses
  | 'PACKED'                        // (Alias) Dikemas
  | 'SHIPPED'                       // Dalam Pengiriman (Kargo Udara)
  | 'IN_TRANSIT_AIR'                // (Alias) Dalam Penerbangan / Logistik Udara
  | 'DELIVERED'                     // Terkirim
  | 'COMPLETED'                     // Selesai / Terkirim
  | 'CANCELLED';                    // Dibatalkan / Refund

export type PaymentStatus = 'UNPAID' | 'PENDING' | 'WAITING_VERIFICATION' | 'PAID' | 'REJECTED' | 'STANDBY' | 'EXPIRED' | 'REFUNDED';

export type ShippingMethod = 'AIR_REGULAR' | 'REGULAR' | 'INSTANT' | 'PICKUP';

export interface OrderItem {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  variationInfo?: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  deliveryAddress: string;
  customerProvince?: string;
  customerCity?: string;
  customerDistrict: string;
  customerPostalCode?: string;
  deliveryNotes?: string;
  shippingMethod: ShippingMethod;
  shippingCost: number;
  estimatedAirDeliveryDays?: number; // e.g. 14 days
  shippingCarrier?: string;
  items: OrderItem[];
  subtotal: number;
  serviceFee: number;
  discountAmount?: number;
  uniqueCode?: number; // Kode unik Rp 1 - Rp 200 yang dibuat server
  total: number;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  paymentProofUrl?: string;
  paymentMethod: string;
  paymentLinkUrl?: string;
  paymentGateway?: string;
  paymentReference?: string;
  artopayPaymentId?: string;
  artopayCustomerToken?: string;
  artopayClientSecret?: string;
  isTestTransaction?: boolean;
  simulationNote?: string;
  paymentExpiresAt: string;
  trackingNumber?: string;
  trackingUrl?: string;
  paidAt?: string;
  referralCode?: string;
  affiliateCommission?: OrderAffiliateSnapshot;
  createdAt: string;
  updatedAt: string;
}

export interface StoreConfig {
  storeName: string;
  storeTagline: string;
  storeAddress: string;
  storePhone: string;
  isOpen: boolean;
  minOrderAmount: number;
  defaultDeliveryFee: number;
  airFreightDeliveryFee?: number; // Biaya Pengiriman Reguler via Udara
  airFreightEstimatedDays?: number; // Estimasi hari (default: 14 hari)
  serviceFee: number;
  defaultAffiliateCommissionRate: number; // Standard default 15%
  qrisImageUrl?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  address?: string;
  role: 'customer' | 'admin';
}

