import { 
  Product, 
  StoreConfig, 
  AffiliateCampaign, 
  CampaignConflict, 
  Order, 
  OrderItemCommissionSnapshot, 
  OrderAffiliateSnapshot,
  CampaignStatus 
} from '../types';

/**
 * Checks if a campaign is valid and active at a specific timestamp.
 */
export function isCampaignActiveAt(campaign: AffiliateCampaign, atDate: Date = new Date()): boolean {
  if (!campaign) return false;
  if (campaign.status === 'PAUSED' || campaign.status === 'ENDED' || campaign.status === 'DRAFT') {
    return false;
  }
  const timestamp = atDate.getTime();
  const startTime = new Date(campaign.startDate).getTime();
  const endTime = new Date(campaign.endDate).getTime();

  return timestamp >= startTime && timestamp <= endTime;
}

/**
 * Computes live operational performance metrics for a campaign based on real orders.
 */
export function getCampaignPerformance(campaign: AffiliateCampaign, orders: Order[]) {
  // Only count orders that are not cancelled or rejected
  const eligibleOrders = orders.filter(o => 
    o.orderStatus !== 'CANCELLED' && 
    o.paymentStatus !== 'REJECTED' && 
    o.paymentStatus !== 'EXPIRED'
  );

  let usedCommission = 0;
  const matchedOrderIds = new Set<string>();

  for (const order of eligibleOrders) {
    if (!order.affiliateCommission) continue;
    let orderMatchedCampaign = false;
    for (const item of order.affiliateCommission.itemsCommission) {
      if (item.campaignId === campaign.id) {
        usedCommission += item.commissionAmount;
        orderMatchedCampaign = true;
      }
    }
    if (orderMatchedCampaign) {
      matchedOrderIds.add(order.id);
    }
  }

  const usedOrders = matchedOrderIds.size;
  const isBudgetExhausted = campaign.budgetLimit !== undefined && campaign.budgetLimit > 0 
    ? usedCommission >= campaign.budgetLimit 
    : false;
  const isQuotaExhausted = campaign.maxOrders !== undefined && campaign.maxOrders > 0 
    ? usedOrders >= campaign.maxOrders 
    : false;

  const now = new Date();
  const nowTime = now.getTime();
  const startTime = new Date(campaign.startDate).getTime();
  const endTime = new Date(campaign.endDate).getTime();

  let effectiveStatus: CampaignStatus = campaign.status;
  if (campaign.status !== 'PAUSED' && campaign.status !== 'DRAFT') {
    if (nowTime > endTime) {
      effectiveStatus = 'ENDED';
    } else if (nowTime < startTime) {
      effectiveStatus = 'SCHEDULED';
    } else if (isBudgetExhausted || isQuotaExhausted) {
      effectiveStatus = 'ENDED';
    } else {
      effectiveStatus = 'ACTIVE';
    }
  }

  const remainingBudget = campaign.budgetLimit !== undefined 
    ? Math.max(0, campaign.budgetLimit - usedCommission) 
    : null;
  const remainingOrders = campaign.maxOrders !== undefined 
    ? Math.max(0, campaign.maxOrders - usedOrders) 
    : null;

  return {
    usedOrders,
    usedCommission,
    remainingBudget,
    remainingOrders,
    isBudgetExhausted,
    isQuotaExhausted,
    isTimeActive: nowTime >= startTime && nowTime <= endTime,
    effectiveStatus
  };
}

/**
 * Validates date ranges and finds overlapping campaigns that target the same product.
 * Returns conflicts list to display to administrators before or during campaign management.
 */
export function detectCampaignConflicts(
  campaigns: AffiliateCampaign[], 
  products: Product[]
): CampaignConflict[] {
  const conflicts: CampaignConflict[] = [];
  const relevantCampaigns = campaigns.filter(c => c.status !== 'ENDED' && c.status !== 'DRAFT');

  for (let i = 0; i < relevantCampaigns.length; i++) {
    for (let j = i + 1; j < relevantCampaigns.length; j++) {
      const c1 = relevantCampaigns[i];
      const c2 = relevantCampaigns[j];

      const start1 = new Date(c1.startDate).getTime();
      const end1 = new Date(c1.endDate).getTime();
      const start2 = new Date(c2.startDate).getTime();
      const end2 = new Date(c2.endDate).getTime();

      // Check date overlap
      const hasDateOverlap = start1 <= end2 && end1 >= start2;
      if (!hasDateOverlap) continue;

      // Check common products
      const commonProductIds = c1.productIds.filter(id => c2.productIds.includes(id));
      for (const prodId of commonProductIds) {
        const prod = products.find(p => p.id === prodId);
        const productName = prod ? prod.name : `Produk ID: ${prodId}`;

        // Avoid duplicate conflict report for the same product
        const alreadyReported = conflicts.some(
          c => c.productId === prodId && 
          c.conflictingCampaignNames.includes(c1.name) && 
          c.conflictingCampaignNames.includes(c2.name)
        );

        if (!alreadyReported) {
          conflicts.push({
            productId: prodId,
            productName,
            conflictingCampaignNames: [c1.name, c2.name],
            message: `Produk "${productName}" terdaftar pada dua campaign bersamaan: "${c1.name}" (${c1.commissionRate}%) dan "${c2.name}" (${c2.commissionRate}%). Sistem menerapkan prioritas deterministik (persentase tertinggi).`
          });
        }
      }
    }
  }

  return conflicts;
}

export interface EffectiveCommissionResult {
  ratePercent: number;
  appliedType: 'campaign' | 'product_custom' | 'standard';
  campaign?: AffiliateCampaign;
  fallbackReason?: string;
  sourceLabel: string;
}

/**
 * Evaluates deterministic priority for a specific product at a given time:
 * Priority #1: Active campaign (matching product, active window, budget & quota available).
 * Priority #2: Product custom commission (if enabled on the product).
 * Priority #3: Standard store commission (default 15%).
 */
export function getEffectiveProductCommission(
  product: Product,
  storeConfig: StoreConfig,
  campaigns: AffiliateCampaign[],
  atDate: Date = new Date(),
  orders: Order[] = []
): EffectiveCommissionResult {
  const standardRate = storeConfig?.defaultAffiliateCommissionRate ?? 15;

  // 1. Check eligible active campaigns for this product
  const eligibleCampaigns = campaigns.filter(c => {
    if (!c.productIds.includes(product.id)) return false;
    return isCampaignActiveAt(c, atDate);
  });

  if (eligibleCampaigns.length > 0) {
    // Deterministic sort: highest commissionRate first; then newest startDate; then id
    eligibleCampaigns.sort((a, b) => {
      if (b.commissionRate !== a.commissionRate) {
        return b.commissionRate - a.commissionRate;
      }
      const bStart = new Date(b.startDate).getTime();
      const aStart = new Date(a.startDate).getTime();
      if (bStart !== aStart) return bStart - aStart;
      return a.id.localeCompare(b.id);
    });

    for (const campaign of eligibleCampaigns) {
      const perf = getCampaignPerformance(campaign, orders);
      if (perf.isBudgetExhausted) {
        // Fallback: check next or proceed down the chain
        continue;
      }
      if (perf.isQuotaExhausted) {
        continue;
      }

      // Valid campaign wins
      return {
        ratePercent: campaign.commissionRate,
        appliedType: 'campaign',
        campaign,
        sourceLabel: `Campaign: ${campaign.name} (${campaign.commissionRate}%)`
      };
    }
  }

  // 2. Priority #2: Product Custom Commission
  if (
    product.useCustomCommission && 
    typeof product.customCommissionRate === 'number' && 
    product.customCommissionRate >= 0
  ) {
    return {
      ratePercent: Math.min(100, Math.max(0, product.customCommissionRate)),
      appliedType: 'product_custom',
      sourceLabel: `Komisi Khusus Produk (${product.customCommissionRate}%)`
    };
  }

  // 3. Priority #3: Standard Store Commission
  return {
    ratePercent: Math.min(100, Math.max(0, standardRate)),
    appliedType: 'standard',
    sourceLabel: `Komisi Standar Toko (${standardRate}%)`
  };
}

/**
 * Calculates and creates an immutable snapshot of commission for an entire order.
 */
export function calculateOrderAffiliateCommission(
  items: { 
    productId: string; 
    name: string; 
    sku: string; 
    price: number; 
    quantity: number; 
    subtotal: number 
  }[],
  referralCode: string,
  storeConfig: StoreConfig,
  products: Product[],
  campaigns: AffiliateCampaign[],
  approvedAffiliate?: { id: string; fullName: string } | null,
  existingOrders: Order[] = []
): OrderAffiliateSnapshot {
  const atDate = new Date();
  const itemsCommission: OrderItemCommissionSnapshot[] = [];
  let totalCommission = 0;

  // Track budget consumed in this single order evaluation
  const localBudgetConsumed: Record<string, number> = {};

  for (const item of items) {
    const product = products.find(p => p.id === item.productId) || {
      id: item.productId,
      name: item.name,
      sku: item.sku,
      price: item.price,
      stock: 0,
      unit: 'pcs',
      images: [],
      categoryId: '',
      isActive: true,
      createdAt: '',
      updatedAt: '',
      description: ''
    };

    const effective = getEffectiveProductCommission(
      product,
      storeConfig,
      campaigns,
      atDate,
      existingOrders
    );

    let finalRate = effective.ratePercent;
    let finalType = effective.appliedType;
    let campaignId = effective.campaign?.id;
    let campaignName = effective.campaign?.name;
    let fallbackReason = effective.fallbackReason;

    // Check if this specific item pushes the campaign over budget
    if (effective.campaign && effective.campaign.budgetLimit !== undefined) {
      const perf = getCampaignPerformance(effective.campaign, existingOrders);
      const priorConsumed = localBudgetConsumed[effective.campaign.id] || 0;
      const potentialCost = Math.round(item.subtotal * (finalRate / 100));

      if (perf.usedCommission + priorConsumed + potentialCost > effective.campaign.budgetLimit) {
        // Fallback to priority #2 or #3
        if (
          product.useCustomCommission && 
          typeof product.customCommissionRate === 'number' && 
          product.customCommissionRate >= 0
        ) {
          finalRate = product.customCommissionRate;
          finalType = 'product_custom';
          campaignId = undefined;
          campaignName = undefined;
          fallbackReason = `Anggaran campaign "${effective.campaign.name}" tercapai; dialihkan ke komisi khusus produk`;
        } else {
          finalRate = storeConfig?.defaultAffiliateCommissionRate ?? 15;
          finalType = 'standard';
          campaignId = undefined;
          campaignName = undefined;
          fallbackReason = `Anggaran campaign "${effective.campaign.name}" tercapai; dialihkan ke komisi standar toko`;
        }
      } else {
        localBudgetConsumed[effective.campaign.id] = priorConsumed + potentialCost;
      }
    }

    const commissionAmount = Math.round(item.subtotal * (finalRate / 100));
    totalCommission += commissionAmount;

    itemsCommission.push({
      productId: item.productId,
      productName: item.name,
      sku: item.sku,
      price: item.price,
      quantity: item.quantity,
      subtotal: item.subtotal,
      appliedType: finalType,
      ratePercent: finalRate,
      commissionAmount,
      campaignId,
      campaignName,
      fallbackReason
    });
  }

  return {
    referralCode,
    affiliateId: approvedAffiliate?.id,
    affiliateName: approvedAffiliate?.fullName,
    totalCommission,
    itemsCommission,
    status: 'PENDING',
    calculatedAt: atDate.toISOString()
  };
}

/**
 * Synchronizes order affiliate snapshot status idempotently when order or payment status changes.
 */
export function syncOrderAffiliateStatus(order: Order): Order {
  if (!order.affiliateCommission) return order;

  let newStatus = order.affiliateCommission.status;

  if (
    order.orderStatus === 'CANCELLED' || 
    order.paymentStatus === 'REJECTED' || 
    order.paymentStatus === 'EXPIRED' ||
    order.paymentStatus === 'REFUNDED'
  ) {
    // If order is cancelled or refunded, revoke commission
    newStatus = 'CANCELLED';
  } else if (order.orderStatus === 'COMPLETED' || order.paymentStatus === 'PAID') {
    if (newStatus === 'PENDING') {
      newStatus = 'APPROVED';
    }
  }

  if (newStatus === order.affiliateCommission.status) {
    return order;
  }

  return {
    ...order,
    affiliateCommission: {
      ...order.affiliateCommission,
      status: newStatus
    }
  };
}
