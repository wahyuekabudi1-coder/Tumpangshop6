import { Category, Product, StoreConfig } from '../types';

/**
 * Initial categories array.
 * Dynamically managed via Admin Dashboard by store administrators.
 * No dummy vegetable or unapproved default categories.
 */
export const initialCategories: Category[] = [];

/**
 * Initial products array.
 * Dynamically managed via Admin Dashboard by store administrators.
 */
export const initialProducts: Product[] = [];

export const initialStoreConfig: StoreConfig = {
  storeName: 'Tumpang Shop',
  storeTagline: 'Pilihan Produk Berkualitas',
  storeAddress: 'Jl. Raya Tumpang No. 45, Kecamatan Tumpang, Kabupaten Malang, Jawa Timur 65156',
  storePhone: '+62 821-4321-7890',
  isOpen: true,
  minOrderAmount: 10000,
  defaultDeliveryFee: 15000,
  airFreightDeliveryFee: 15000,
  airFreightEstimatedDays: 14,
  serviceFee: 1500,
  defaultAffiliateCommissionRate: 15,
  qrisImageUrl: 'https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=400&auto=format&fit=crop&q=60'
};

export const INDONESIA_PROVINCES = [
  'Jawa Timur',
  'Jawa Barat',
  'DKI Jakarta',
  'Jawa Tengah',
  'Banten',
  'DI Yogyakarta',
  'Bali',
  'Sumatera Utara',
  'Sumatera Barat',
  'Riau',
  'Kepulauan Riau',
  'Sumatera Selatan',
  'Lampung',
  'Jambi',
  'Bengkulu',
  'Bangka Belitung',
  'Aceh',
  'Kalimantan Barat',
  'Kalimantan Timur',
  'Kalimantan Selatan',
  'Kalimantan Tengah',
  'Kalimantan Utara',
  'Sulawesi Selatan',
  'Sulawesi Utara',
  'Sulawesi Tengah',
  'Sulawesi Tenggara',
  'Gorontalo',
  'Sulawesi Barat',
  'Nusa Tenggara Barat',
  'Nusa Tenggara Timur',
  'Maluku',
  'Maluku Utara',
  'Papua',
  'Papua Barat',
  'Papua Selatan',
  'Papua Tengah',
  'Papua Pegunungan',
  'Papua Barat Daya'
];

export const DISTRICTS = [
  'Kecamatan Tumpang',
  'Kecamatan Poncokusumo',
  'Kecamatan Pakis',
  'Kecamatan Jabung',
  'Kecamatan Wajak',
  'Kecamatan Tajinan',
  'Kecamatan Malang Kota / Sekitarnya'
];

/**
 * Category Photo generator with clean, quality-oriented image mapping.
 */
export function getCategoryPhotoAuto(name: string): string {
  const q = name.toLowerCase();
  if (q.includes('elektronik') || q.includes('gadget') || q.includes('hp') || q.includes('komputer')) {
    return 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80';
  }
  if (q.includes('fashion') || q.includes('pakaian') || q.includes('baju') || q.includes('celana') || q.includes('kain')) {
    return 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=600&auto=format&fit=crop&q=80';
  }
  if (q.includes('makanan') || q.includes('minuman') || q.includes('snack') || q.includes('kopi') || q.includes('kuliner')) {
    return 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&auto=format&fit=crop&q=80';
  }
  if (q.includes('rumah') || q.includes('dekorasi') || q.includes('perabot') || q.includes('dapur')) {
    return 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=600&auto=format&fit=crop&q=80';
  }
  if (q.includes('kesehatan') || q.includes('kecantikan') || q.includes('perawatan') || q.includes('skincare')) {
    return 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600&auto=format&fit=crop&q=80';
  }
  if (q.includes('hobi') || q.includes('olahraga') || q.includes('buku') || q.includes('aksesoris')) {
    return 'https://images.unsplash.com/photo-1511556532299-8f662fc26c06?w=600&auto=format&fit=crop&q=80';
  }
  return 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=600&auto=format&fit=crop&q=80';
}

/**
 * Returns a URL-friendly slug for a product.
 */
export function getProductSlug(product: Product): string {
  if (product.slug) return product.slug;
  return product.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
