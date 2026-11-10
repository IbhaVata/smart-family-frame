/**
 * Re-exports the household calculation engine from shared/household/calculations.ts, which is now the
 * single canonical implementation (also used by the Family PWA and the `getHouseholdSummary` Cloud
 * Function in V2, so the payment/attendance math is never duplicated — see FUTURE.md and V2_SYNC.md).
 * Public API (names, signatures, behavior) is unchanged from V1, so every existing caller and test
 * keeps working without modification.
 */
export * from '../../shared/household/calculations';
