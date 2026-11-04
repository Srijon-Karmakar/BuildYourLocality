/**
 * The city's mood as the street-level simulation sees it. cityStats.ts writes it every couple of
 * seconds; the traffic and people code reads it (it lives apart so neither has to import the other).
 */
export const cityState = {
  /** There is at least one home placed, so the population follows the housing. */
  hasHousing: false,
  /** Residents as a share of what the housing can hold, 0..1. */
  occupancy: 1,
  /** 0..100. */
  happiness: 60,
  /** The treasury is empty: services cope badly. */
  broke: false,
  /** Emergencies going on right now, and how many recent ones nobody answered (fades with time). */
  incidentsActive: 0,
  unanswered: 0,
  /** Treasury cost of incidents since the stats last looked (fire damage, wrecks), then reset. */
  damage: 0,
  /** Running totals for this visit. */
  totals: { accidents: 0, fires: 0, crimes: 0, solved: 0, failed: 0 },
};
