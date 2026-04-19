/**
 * Barrel export for React Query-wrapped data hooks.
 * Usage: import { useCustomers, useCourierGroups } from "@/shared/hooks/queries";
 */

export {
  useCustomers,
  useCourierGroups,
  useAgents,
  usePackageStatuses,
  useTags,
  referenceDataKeys,
  type CustomerRef,
  type CourierGroupRef,
  type AgentRef,
  type PackageStatusRef,
  type TagRef,
} from "./useReferenceData";
