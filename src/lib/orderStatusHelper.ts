import { OrderStatus, ShippingMethod, PaymentStatus } from '../types';

export interface OrderStatusInfo {
  label: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  dotColor: string;
  stepIndex: number; // 1 to 6 for active workflow steps, -1 for cancelled
  description: string;
}

export const ORDER_STATUS_MAP: Record<OrderStatus, OrderStatusInfo> = {
  NEW: {
    label: 'Menunggu Pembayaran',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-800',
    badgeBorder: 'border-amber-200',
    dotColor: 'bg-amber-500',
    stepIndex: 1,
    description: 'Pesanan baru dibuat dan menunggu penyelesaian pembayaran melalui gateway resmi.'
  },
  PAYMENT_VERIFIED: {
    label: 'Pembayaran Terverifikasi',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-800',
    badgeBorder: 'border-emerald-200',
    dotColor: 'bg-emerald-600',
    stepIndex: 2,
    description: 'Pembayaran telah sukses diverifikasi secara resmi. Menunggu verifikasi ketersediaan pemasok.'
  },
  WAITING_SUPPLIER_CONFIRMATION: {
    label: 'Menunggu Konfirmasi Ketersediaan Pemasok',
    badgeBg: 'bg-sky-50',
    badgeText: 'text-sky-800',
    badgeBorder: 'border-sky-200',
    dotColor: 'bg-sky-500',
    stepIndex: 3,
    description: 'Pesanan impor diteruskan ke pemasok luar negeri untuk konfirmasi ketersediaan stok & alokasi kargo.'
  },
  SUPPLIER_PROCESSING: {
    label: 'Diproses Pemasok',
    badgeBg: 'bg-indigo-50',
    badgeText: 'text-indigo-800',
    badgeBorder: 'border-indigo-200',
    dotColor: 'bg-indigo-600',
    stepIndex: 4,
    description: 'Barang sedang dipersiapkan dan dikemas oleh pemasok luar negeri sebelum diserahkan ke kargo udara.'
  },
  PROCESSING: {
    label: 'Diproses Pemasok',
    badgeBg: 'bg-indigo-50',
    badgeText: 'text-indigo-800',
    badgeBorder: 'border-indigo-200',
    dotColor: 'bg-indigo-600',
    stepIndex: 4,
    description: 'Barang sedang disiapkan oleh pemasok luar negeri.'
  },
  PACKED: {
    label: 'Siap Dikirim via Kargo Udara',
    badgeBg: 'bg-indigo-50',
    badgeText: 'text-indigo-800',
    badgeBorder: 'border-indigo-200',
    dotColor: 'bg-indigo-600',
    stepIndex: 4,
    description: 'Barang telah dikemas rapi dan siap diberangkatkan ke bandara kargo udara.'
  },
  IN_TRANSIT_AIR: {
    label: 'Dalam Pengiriman (Kargo Udara)',
    badgeBg: 'bg-purple-50',
    badgeText: 'text-purple-800',
    badgeBorder: 'border-purple-200',
    dotColor: 'bg-purple-600',
    stepIndex: 5,
    description: 'Barang dalam penerbangan internasional dan proses clearance kepabeanan kargo udara.'
  },
  SHIPPED: {
    label: 'Dalam Pengiriman (Kargo Udara)',
    badgeBg: 'bg-purple-50',
    badgeText: 'text-purple-800',
    badgeBorder: 'border-purple-200',
    dotColor: 'bg-purple-600',
    stepIndex: 5,
    description: 'Barang sedang dalam perjalanan logistik kargo udara menuju alamat penerima.'
  },
  DELIVERED: {
    label: 'Terkirim',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-800',
    badgeBorder: 'border-emerald-300',
    dotColor: 'bg-emerald-600',
    stepIndex: 6,
    description: 'Paket kargo udara telah sampai di alamat tujuan dan diterima dengan aman oleh pembeli.'
  },
  COMPLETED: {
    label: 'Terkirim & Selesai',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-800',
    badgeBorder: 'border-emerald-300',
    dotColor: 'bg-emerald-600',
    stepIndex: 6,
    description: 'Pesanan telah selesai secara tuntas.'
  },
  CANCELLED: {
    label: 'Dibatalkan / Pengembalian Dana',
    badgeBg: 'bg-rose-50',
    badgeText: 'text-rose-800',
    badgeBorder: 'border-rose-200',
    dotColor: 'bg-rose-600',
    stepIndex: -1,
    description: 'Pesanan dibatalkan atau dalam proses pengembalian dana.'
  }
};

export const ORDER_TIMELINE_STEPS = [
  { key: 'NEW', title: 'Menunggu Pembayaran', step: 1 },
  { key: 'PAYMENT_VERIFIED', title: 'Pembayaran Terverifikasi', step: 2 },
  { key: 'WAITING_SUPPLIER_CONFIRMATION', title: 'Konfirmasi Pemasok', step: 3 },
  { key: 'SUPPLIER_PROCESSING', title: 'Diproses Pemasok', step: 4 },
  { key: 'IN_TRANSIT_AIR', title: 'Kargo Udara', step: 5 },
  { key: 'DELIVERED', title: 'Terkirim', step: 6 }
];

export function getOrderStatusInfo(status: OrderStatus): OrderStatusInfo {
  return ORDER_STATUS_MAP[status] || {
    label: status,
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-700',
    badgeBorder: 'border-slate-200',
    dotColor: 'bg-slate-400',
    stepIndex: 1,
    description: 'Status pesanan'
  };
}

export function formatShippingMethod(method: ShippingMethod | string): string {
  if (method === 'AIR_REGULAR' || method === 'REGULAR') {
    return 'Pengiriman Reguler via Udara';
  }
  if (method === 'INSTANT') {
    return 'Pengiriman Reguler via Udara'; // Standardized to air freight only
  }
  if (method === 'PICKUP') {
    return 'Pengiriman Reguler via Udara'; // Standardized to air freight only
  }
  return 'Pengiriman Reguler via Udara';
}

export const AIR_SHIPPING_ESTIMATE_DAYS = 14;

export const AIR_SHIPPING_DISCLAIMER = 
  'Estimasi sekitar 14 hari kalender setelah pembayaran terverifikasi dan pesanan dikonfirmasi untuk diproses. ' +
  'Estimasi merupakan perkiraan operasional dan dapat berubah karena kesiapan stok pemasok luar negeri, ' +
  'pemeriksaan bea cukai kepabeanan, serta kendala logistik kargo udara (bukan merupakan janji tanggal tiba pasti).';
