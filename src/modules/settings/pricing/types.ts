export type PricingTier = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  tier_type: "retail" | "commercial" | "agent";
  base_rate_per_lb: number;
  currency: string;
  delivery_fee: number;
  hazmat_fee: number;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CommodityRate = {
  id: string;
  pricing_tier_id: string;
  commodity_name: string;
  rate_per_lb: number;
  created_at: string;
};

export type Customer = {
  id: string;
  name: string;
  pricing_tier_id: string | null;
};

export type CommodityOverride = {
  id?: string;
  tempId?: string;
  commodity_name: string;
  rate_per_lb: number;
};

export const tierTypeColors = {
  retail: "bg-emerald-50 text-emerald-700 border-emerald-200",
  commercial: "bg-amber-50 text-amber-700 border-amber-200",
  agent: "bg-violet-50 text-violet-700 border-violet-200",
};

export const tierTypeLabels = {
  retail: "Retail",
  commercial: "Commercial",
  agent: "Agent",
};
