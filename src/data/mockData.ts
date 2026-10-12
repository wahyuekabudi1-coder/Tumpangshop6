import { Category, Product, StoreConfig } from '../types';

export const initialCategories: Category[] = [
  {
    id: 'cat-sembako',
    name: 'Sembako & Dapur',
    slug: 'sembako',
    description: 'Beras pandan wangi, minyak goreng, gula pasir, dan kebutuhan bumbu pokok.',
    imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&auto=format&fit=crop&q=80',
    icon: 'Package',
    orderIndex: 1,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'cat-sayur-buah',
    name: 'Sayur Segar & Buah',
    slug: 'sayur-buah',
    description: 'Petikan langsung dari lereng Bromo Semeru dan Pasar Sayur Tumpang.',
    imageUrl: 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=600&auto=format&fit=crop&q=80',
    icon: 'Apple',
    orderIndex: 2,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'cat-umkm-khas',
    name: 'Oleh-Oleh & UMKM',
    slug: 'umkm-khas',
    description: 'Kopi Robusta Dampit, keripik tempe khas Malang, madu murni, olahan lokal.',
    imageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80',
    icon: 'Coffee',
    orderIndex: 3,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'cat-lauk-daging',
    name: 'Daging, Unggas & Ikan',
    slug: 'daging-ikan',
    description: 'Ayam kampung potong segar, ikan nila tawar Tumpang, dan daging pilihan.',
    imageUrl: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=600&auto=format&fit=crop&q=80',
    icon: 'Beef',
    orderIndex: 4,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'cat-snack-minuman',
    name: 'Camilan & Minuman',
    slug: 'camilan-minuman',
    description: 'Kerupuk puli, rengginang gurih, sari apel alami, dan wedang rempah.',
    imageUrl: 'https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?w=600&auto=format&fit=crop&q=80',
    icon: 'Cookie',
    orderIndex: 5,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export const initialProducts: Product[] = [
  {
    id: 'prod-beras-pandan',
    sku: 'SMB-BRS-01',
    name: 'Beras Premium Pandan Wangi Tumpang 5kg',
    slug: 'beras-premium-pandan-wangi-tumpang-5kg',
    description: 'Beras pulen harum alami tanpa pemutih dan tanpa pengawet sintesis. Hasil panen petani sawah beririgasi teknis lereng Tumpang Malang. Cocok untuk hidangan nasi keluarga maupun usaha kuliner.',
    categoryId: 'cat-sembako',
    price: 76000,
    originalPrice: 82000,
    stock: 45,
    unit: 'karung 5kg',
    isActive: true,
    isFeatured: true,
    viewCount: 0,
    salesCount: 0,
    images: [
      'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1536304929831-ee1ca9d44906?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1551462147-37885acc36f1?w=800&auto=format&fit=crop&q=80'
    ],
    variations: [
      {
        id: 'var-berat',
        name: 'Kemasan',
        options: [
          { id: 'opt-5kg', name: '5 kg (Standar)', priceDelta: 0, stock: 45, sku: 'SMB-BRS-01-5K' },
          { id: 'opt-10kg', name: '10 kg (Hemat)', priceDelta: 72000, stock: 20, sku: 'SMB-BRS-01-10K' },
          { id: 'opt-25kg', name: '25 kg (Grosir)', priceDelta: 290000, stock: 10, sku: 'SMB-BRS-01-25K' }
        ]
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-apel-manalagi',
    sku: 'FRT-APL-02',
    name: 'Apel Manalagi Super Manis Poncokusumo',
    slug: 'apel-manalagi-super-manis-poncokusumo',
    description: 'Apel hijau manis segar khas lereng Bromo Poncokusumo. Daging buah renyah, manis alami dengan sedikit aroma harum menyegarkan. Dipetik di hari pengiriman untuk menjaga nutrisi dan tekstur garing.',
    categoryId: 'cat-sayur-buah',
    price: 28000,
    originalPrice: 32000,
    stock: 60,
    unit: 'kg',
    isActive: true,
    isFeatured: true,
    viewCount: 0,
    salesCount: 0,
    images: [
      'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1570913149827-d2ac84ab3f9a?w=800&auto=format&fit=crop&q=80'
    ],
    variations: [
      {
        id: 'var-grade',
        name: 'Pilihan Grade',
        options: [
          { id: 'opt-g1', name: 'Grade A (Besar & Mulus)', priceDelta: 0, stock: 35, sku: 'FRT-APL-02-GRA' },
          { id: 'opt-g2', name: 'Grade B (Sedang/Juice)', priceDelta: -6000, stock: 25, sku: 'FRT-APL-02-GRB' }
        ]
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-kopi-dampit',
    sku: 'UMK-KOP-03',
    name: 'Kopi Robusta Petik Merah Lereng Semeru 250gr',
    slug: 'kopi-robusta-petik-merah-lereng-semeru-250gr',
    description: 'Biji kopi robusta pilihan dari perkebunan lereng Gunung Semeru Tumpang Dampit. Diproses petik merah dan di-roasting medium-to-dark. Memiliki aroma cokelat karamel khas dengan body tebal dan keasaman rendah.',
    categoryId: 'cat-umkm-khas',
    price: 38000,
    stock: 80,
    unit: 'pouch 250g',
    isActive: true,
    isFeatured: true,
    viewCount: 0,
    salesCount: 0,
    images: [
      'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=800&auto=format&fit=crop&q=80'
    ],
    variations: [
      {
        id: 'var-giling',
        name: 'Bentuk Olahan',
        options: [
          { id: 'opt-biji', name: 'Biji Sangrai (Whole Bean)', priceDelta: 0, stock: 30, sku: 'UMK-KOP-03-BJ' },
          { id: 'opt-bubuk-halus', name: 'Bubuk Halus (Espresso/Tubruk)', priceDelta: 0, stock: 30, sku: 'UMK-KOP-03-HLS' },
          { id: 'opt-bubuk-kasar', name: 'Bubuk Kasar (French Press/V60)', priceDelta: 0, stock: 20, sku: 'UMK-KOP-03-KSR' }
        ]
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-keripik-tempe',
    sku: 'UMK-TMP-04',
    name: 'Keripik Tempe Sagu Renyah Gurih Daun Jeruk',
    slug: 'keripik-tempe-sagu-renyah-gurih-daun-jeruk',
    description: 'Camilan legendaris khas Malang buatan perajin UMKM lokal Tumpang. Irisan tempe kedelai berpadu sagu renyah dengan racikan bumbu bawang putih dan aroma daun jeruk purut segar. Bebas bahan pengawet.',
    categoryId: 'cat-umkm-khas',
    price: 18000,
    originalPrice: 20000,
    stock: 50,
    unit: 'bungkus 200g',
    isActive: true,
    isFeatured: true,
    viewCount: 0,
    salesCount: 0,
    images: [
      'https://images.unsplash.com/photo-1541544741938-0af808871cc0?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?w=800&auto=format&fit=crop&q=80'
    ],
    variations: [
      {
        id: 'var-rasa',
        name: 'Rasa Bumbu',
        options: [
          { id: 'opt-original', name: 'Original Bawang Jeruk', priceDelta: 0, stock: 25, sku: 'UMK-TMP-04-ORI' },
          { id: 'opt-pedas', name: 'Pedas Manis Balado', priceDelta: 1000, stock: 15, sku: 'UMK-TMP-04-PDS' },
          { id: 'opt-keju', name: 'Keju Bakar Spesial', priceDelta: 2000, stock: 10, sku: 'UMK-TMP-04-KJU' }
        ]
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-minyak-goreng',
    sku: 'SMB-MYK-05',
    name: 'Minyak Goreng Sawit Pilihan 2 Liter Kemasan Pouch',
    slug: 'minyak-goreng-sawit-pilihan-2-liter',
    description: 'Minyak goreng sawit bening murni dua kali penyaringan, kaya vitamin A. Memiliki kestabilan panas tinggi sehingga masakan lebih renyah tanpa cepat hitam.',
    categoryId: 'cat-sembako',
    price: 34500,
    stock: 35,
    unit: 'pouch 2L',
    isActive: true,
    isFeatured: false,
    viewCount: 0,
    salesCount: 0,
    images: [
      'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=800&auto=format&fit=crop&q=80'
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-sayur-paket-sop',
    sku: 'SYR-SOP-06',
    name: 'Paket Sayur Segar Sop Komplit Pasar Tumpang',
    slug: 'paket-sayur-segar-sop-komplit-pasar-tumpang',
    description: 'Paket racikan sayur segar belanjaan pagi langsung dari Pasar Tumpang. Berisi: wortel manis, kentang granola, kol kubis renyah, daun bawang, seledri wangi, buncis, dan tomat merah.',
    categoryId: 'cat-sayur-buah',
    price: 12000,
    stock: 25,
    unit: 'paket komplit',
    isActive: true,
    isFeatured: false,
    viewCount: 0,
    salesCount: 0,
    images: [
      'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=800&auto=format&fit=crop&q=80'
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-madu-murni',
    sku: 'UMK-MDU-07',
    name: 'Madu Murni Nektar Randu Lereng Gunung Semeru 350ml',
    slug: 'madu-murni-nektar-randu-lereng-gunung-semeru-350ml',
    description: 'Madu asli tanpa pasteurisasi dan tanpa campuran pemanis gula. Dihasilkan peternakan lebah Apis Mellifera pada musim bunga pohon randu lereng Gunung Semeru. Berkhasiat meningkatkan daya tahan tubuh keluarga.',
    categoryId: 'cat-umkm-khas',
    price: 65000,
    originalPrice: 75000,
    stock: 20,
    unit: 'botol kaca 350ml',
    isActive: true,
    isFeatured: true,
    viewCount: 0,
    salesCount: 0,
    images: [
      'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=800&auto=format&fit=crop&q=80'
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-telur-ayam',
    sku: 'SMB-TLR-08',
    name: 'Telur Ayam Negeri Segar Peternakan Lokal 1kg',
    slug: 'telur-ayam-negeri-segar-peternakan-lokal-1kg',
    description: 'Telur ayam negeri segar langsung dari peternak kemitraan Tumpang. Cangkang bersih, tebal, dengan kuning telur padat cerah. Isi sekitar 15-16 butir per kilogram.',
    categoryId: 'cat-sembako',
    price: 27500,
    stock: 50,
    unit: 'tray 1kg',
    isActive: true,
    isFeatured: false,
    viewCount: 0,
    salesCount: 0,
    images: [
      'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=800&auto=format&fit=crop&q=80'
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export const initialStoreConfig: StoreConfig = {
  storeName: 'Tumpang Shop',
  storeTagline: 'Pasar Lokal, Pilihan Hebat UMKM Malang',
  storeAddress: 'Jl. Raya Tumpang No. 45, Kecamatan Tumpang, Kabupaten Malang, Jawa Timur 65156',
  storePhone: '+62 821-4321-7890',
  isOpen: true,
  minOrderAmount: 15000,
  defaultDeliveryFee: 6000,
  serviceFee: 1500,
  qrisImageUrl: 'https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=400&auto=format&fit=crop&q=60'
};

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
 * Intelligent Category Photo generator with reliable fallback mapping.
 */
export function getCategoryPhotoAuto(name: string): string {
  const q = name.toLowerCase();
  if (q.includes('beras') || q.includes('sembako') || q.includes('pokok') || q.includes('dapur')) {
    return 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&auto=format&fit=crop&q=80';
  }
  if (q.includes('sayur') || q.includes('buah') || q.includes('apel') || q.includes('kebun') || q.includes('organik')) {
    return 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=600&auto=format&fit=crop&q=80';
  }
  if (q.includes('kopi') || q.includes('umkm') || q.includes('oleh') || q.includes('madu') || q.includes('tempe')) {
    return 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80';
  }
  if (q.includes('ayam') || q.includes('daging') || q.includes('ikan') || q.includes('lauk') || q.includes('seafood')) {
    return 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=600&auto=format&fit=crop&q=80';
  }
  if (q.includes('snack') || q.includes('camilan') || q.includes('kue') || q.includes('minuman') || q.includes('roti')) {
    return 'https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?w=600&auto=format&fit=crop&q=80';
  }
  if (q.includes('bumbu') || q.includes('rempah') || q.includes('bawang') || q.includes('cabai')) {
    return 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&auto=format&fit=crop&q=80';
  }
  if (q.includes('fashion') || q.includes('pakaian') || q.includes('batik') || q.includes('kain')) {
    return 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=600&auto=format&fit=crop&q=80';
  }
  if (q.includes('kerajinan') || q.includes('anyaman') || q.includes('kayu') || q.includes('souvenir')) {
    return 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=600&auto=format&fit=crop&q=80';
  }
  return 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&auto=format&fit=crop&q=80';
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
