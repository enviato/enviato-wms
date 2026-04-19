"use client";

import { useState, useEffect } from "react";
import { logger } from "@/shared/lib/logger";
import { createClient } from "@/lib/supabase";
import { PricingTier, CommodityRate, Customer, CommodityOverride } from "../types";

export function usePricingTiers() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [tierCustomerCounts, setTierCustomerCounts] = useState<Record<string, number>>({});
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(""), 3000);
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(""), 4000);
  };

  // Load org ID and tiers on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          const { data: userData } = await supabase
            .from("users")
            .select("org_id")
            .eq("id", authUser.id)
            .single();
          if (userData?.org_id) setOrgId(userData.org_id);
        }
      } catch (error) {
        logger.error("Error loading user data:", error);
        showError("Failed to load user data");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Load tiers when orgId is available
  useEffect(() => {
    if (!orgId) return;

    const loadTiers = async () => {
      try {
        const { data: tiersData } = await supabase
          .from("pricing_tiers")
          .select("*")
          .eq("org_id", orgId)
          .order("created_at", { ascending: false });
        if (tiersData) {
          setTiers(tiersData);
          await loadCustomerCounts(tiersData);
        }
      } catch (error) {
        logger.error("Error loading pricing tiers:", error);
        showError("Failed to load pricing tiers");
      }
    };

    loadTiers();
  }, [orgId]);

  const loadCustomerCounts = async (tiersList: PricingTier[]) => {
    try {
      const counts: Record<string, number> = {};
      for (const tier of tiersList) {
        const { count } = await supabase
          .from("users")
          .select("*", { count: "exact", head: true })
          .eq("pricing_tier_id", tier.id);
        counts[tier.id] = count || 0;
      }
      setTierCustomerCounts(counts);
    } catch (error) {
      logger.error("Error loading customer counts:", error);
    }
  };

  const loadCommodityRates = async (tierId: string): Promise<CommodityOverride[]> => {
    try {
      const { data } = await supabase
        .from("pricing_tier_commodity_rates")
        .select("*")
        .eq("pricing_tier_id", tierId);
      if (data) {
        return data.map((d) => ({
          id: d.id,
          commodity_name: d.commodity_name,
          rate_per_lb: d.rate_per_lb,
        }));
      }
      return [];
    } catch (error) {
      logger.error("Error loading commodity rates:", error);
      return [];
    }
  };

  const updateCommodityOverrides = async (tierId: string, commodityOverrides: CommodityOverride[]) => {
    try {
      // Get existing commodity rates
      const { data: existing } = await supabase
        .from("pricing_tier_commodity_rates")
        .select("id")
        .eq("pricing_tier_id", tierId);

      const existingIds = existing?.map((e) => e.id) || [];
      const currentIds = commodityOverrides
        .filter((c) => c.id)
        .map((c) => c.id || "");

      // Delete removed commodities
      const toDelete = existingIds.filter((id) => !currentIds.includes(id));
      if (toDelete.length > 0) {
        await supabase
          .from("pricing_tier_commodity_rates")
          .delete()
          .in("id", toDelete);
      }

      // Insert new commodities (without id field)
      const toInsert = commodityOverrides.filter((c) => !c.id);
      if (toInsert.length > 0) {
        await supabase.from("pricing_tier_commodity_rates").insert(
          toInsert.map((c) => ({
            pricing_tier_id: tierId,
            commodity_name: c.commodity_name,
            rate_per_lb: c.rate_per_lb,
          }))
        );
      }

      // Update existing commodities
      for (const commodity of commodityOverrides.filter((c) => c.id)) {
        if (commodity.id) {
          await supabase
            .from("pricing_tier_commodity_rates")
            .update({
              commodity_name: commodity.commodity_name,
              rate_per_lb: commodity.rate_per_lb,
            })
            .eq("id", commodity.id);
        }
      }
    } catch (error) {
      logger.error("Error updating commodity overrides:", error);
      throw error;
    }
  };

  const saveTier = async (
    tierId: string | null,
    tierForm: any,
    commodityOverrides: CommodityOverride[]
  ) => {
    if (!tierForm.name || !orgId) {
      showError("Please fill in required fields");
      return false;
    }

    try {
      if (tierId) {
        // Update tier
        const { error } = await supabase
          .from("pricing_tiers")
          .update({
            name: tierForm.name,
            description: tierForm.description || null,
            tier_type: tierForm.tier_type,
            base_rate_per_lb: tierForm.base_rate_per_lb,
            currency: tierForm.currency,
            delivery_fee: tierForm.delivery_fee,
            hazmat_fee: tierForm.hazmat_fee,
            is_default: tierForm.is_default,
            is_active: tierForm.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq("id", tierId);

        if (error) {
          logger.error("Error updating tier:", error);
          showError("Failed to update tier: " + error.message);
          return false;
        }

        // Update commodity overrides
        await updateCommodityOverrides(tierId, commodityOverrides);
      } else {
        // Insert new tier
        const { data: newTier, error } = await supabase
          .from("pricing_tiers")
          .insert({
            org_id: orgId,
            name: tierForm.name,
            description: tierForm.description || null,
            tier_type: tierForm.tier_type,
            base_rate_per_lb: tierForm.base_rate_per_lb,
            currency: tierForm.currency,
            delivery_fee: tierForm.delivery_fee,
            hazmat_fee: tierForm.hazmat_fee,
            is_default: tierForm.is_default,
            is_active: tierForm.is_active,
          })
          .select()
          .single();

        if (error) {
          logger.error("Error adding tier:", error);
          showError("Failed to add tier: " + error.message);
          return false;
        }

        if (newTier && commodityOverrides.length > 0) {
          const { error: commodityError } = await supabase
            .from("pricing_tier_commodity_rates")
            .insert(
              commodityOverrides.map((c) => ({
                pricing_tier_id: newTier.id,
                commodity_name: c.commodity_name,
                rate_per_lb: c.rate_per_lb,
              }))
            );
          if (commodityError) {
            logger.error("Error adding commodity rates:", commodityError);
            showError("Tier added but commodity rates failed");
          }
        }
      }

      // Reload tiers
      const { data: updatedTiers } = await supabase
        .from("pricing_tiers")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      if (updatedTiers) {
        setTiers(updatedTiers);
        await loadCustomerCounts(updatedTiers);
      }

      showSuccess(tierId ? "Tier updated" : "Tier added");
      return true;
    } catch (error) {
      logger.error("Error saving tier:", error);
      showError("Failed to save tier");
      return false;
    }
  };

  const deleteTier = async (id: string) => {
    try {
      // Clear pricing_tier_id on all customers assigned to this tier
      await supabase
        .from("users")
        .update({ pricing_tier_id: null })
        .eq("pricing_tier_id", id);

      // Delete commodity rates
      await supabase
        .from("pricing_tier_commodity_rates")
        .delete()
        .eq("pricing_tier_id", id);

      // Delete the tier
      const { error } = await supabase.from("pricing_tiers").delete().eq("id", id);

      if (error) {
        logger.error("Delete tier error:", error);
        showError("Failed to delete: " + error.message);
        return false;
      }

      setTiers(tiers.filter((t) => t.id !== id));
      showSuccess("Pricing tier deleted");
      return true;
    } catch (error) {
      logger.error("Error deleting tier:", error);
      showError("Failed to delete tier");
      return false;
    }
  };

  const loadCustomersForManagement = async () => {
    try {
      const { data: customerData } = await supabase
        .from("users")
        .select("id, first_name, last_name, pricing_tier_id")
        .order("first_name");

      if (customerData) {
        const mapped: Customer[] = customerData.map((c: { id: string; first_name: string; last_name: string; pricing_tier_id: string | null }) => ({
          id: c.id,
          name: `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Unnamed",
          pricing_tier_id: c.pricing_tier_id,
        }));
        setCustomers(mapped);
        return mapped;
      }
      return [];
    } catch (error) {
      logger.error("Error loading customers:", error);
      showError("Failed to load customers");
      return [];
    }
  };

  const assignCustomers = async (tierId: string, selectedCustomerIds: string[]) => {
    if (!tierId || selectedCustomerIds.length === 0) {
      showError("Please select at least one customer");
      return false;
    }

    try {
      const { error } = await supabase
        .from("users")
        .update({ pricing_tier_id: tierId })
        .in("id", selectedCustomerIds);

      if (error) {
        logger.error("Error assigning customers:", error);
        showError("Failed to assign customers: " + error.message);
        return false;
      }

      // Reload tier data
      const { data: updatedTiers } = await supabase
        .from("pricing_tiers")
        .select("*")
        .eq("org_id", orgId || "")
        .order("created_at", { ascending: false });
      if (updatedTiers) {
        setTiers(updatedTiers);
        await loadCustomerCounts(updatedTiers);
      }

      showSuccess(`Assigned ${selectedCustomerIds.length} customer(s) to this tier`);
      return true;
    } catch (error) {
      logger.error("Error assigning customers:", error);
      showError("Failed to assign customers");
      return false;
    }
  };

  return {
    loading,
    tiers,
    tierCustomerCounts,
    successMessage,
    errorMessage,
    showSuccess,
    showError,
    orgId,
    customers,
    saveTier,
    deleteTier,
    loadCommodityRates,
    loadCustomersForManagement,
    assignCustomers,
  };
}
