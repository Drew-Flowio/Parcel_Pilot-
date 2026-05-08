/**
 * Parcel-intelligence enrichment for AppFolio payloads.
 *
 * The Skywalk side carries operational data (conversations, leads), the
 * Hennepin parcels layer carries the deep intelligence (score_v2, owner,
 * vacancy, sos_intel, contact_status). Until those two are joined for the
 * downstream consumer, AppFolio receives a stream of conversations that
 * can't be prioritized against the 31k-parcel target list.
 *
 * This module reads the link populated by the
 * `skywalk_parcel_linking` migration:
 *
 *   skywalk_properties.parcel_id  →  parcels_intel.id
 *   skywalk_contacts.parcel_id    →  parcels_intel.id
 *
 * and returns a compact, stable shape for the payload mapper. We pull from
 * `parcels_intel` (not `parcels_raw`) because that view already joins
 * portfolio_groups, sos_intel, and the v2 score.
 *
 * Failure mode: if no linked parcel exists, we return `null`. Push proceeds
 * unchanged. Enrichment is purely additive; it never blocks a push.
 */

import { getSupabaseServer } from "@/lib/supabaseClient";

/** Compact slice of parcels_intel attached to AppFolio metadata. */
export interface LinkedParcelIntel {
  id: string;
  property_address: string | null;
  owner_name: string | null;
  owner_type: string | null;
  market_value: number | null;
  unit_count: number | null;
  contact_status: string | null;
  vacancy_status: string | null;
  days_vacant: number | null;
  score_v2: number | null;
  desirability_score: number | null;
  sos_agent_name: string | null;
  sos_agent_address: string | null;
  /** Where the link came from: 'property' = via skywalk_properties.parcel_id,
   *  'contact'  = via skywalk_contacts.parcel_id, 'both' if they agree. */
  link_source: "property" | "contact" | "both";
}

const PARCEL_FIELDS =
  "id, property_address, owner_name, owner_type, market_value, unit_count, " +
  "contact_status, vacancy_status, days_vacant, score_v2, desirability_score, " +
  "sos_agent_name, sos_agent_address";

/**
 * Resolve the linked parcel for a given Skywalk property + contact pair.
 *
 * Strategy:
 *   1. If the rollup has a `skywalk_property_id`, look up its `parcel_id`.
 *   2. If the rollup has a `skywalk_contact_id`, look up its `parcel_id`.
 *   3. If both agree → `link_source = 'both'`.
 *      If only one resolves → use it.
 *      If they disagree → property wins (it's the more specific link).
 *   4. If neither resolves → return null.
 *
 * Two round-trips at worst (property lookup + contact lookup), all by
 * indexed PK. ~1ms each.
 */
export async function resolveLinkedParcel(args: {
  skywalkPropertyId: string | null;
  skywalkContactId: string | null;
}): Promise<LinkedParcelIntel | null> {
  const { skywalkPropertyId, skywalkContactId } = args;
  if (!skywalkPropertyId && !skywalkContactId) return null;

  const supabase = getSupabaseServer();

  let propertyParcelId: string | null = null;
  let contactParcelId: string | null = null;

  if (skywalkPropertyId) {
    const { data, error } = await supabase
      .from("skywalk_properties")
      .select("parcel_id")
      .eq("skywalk_property_id", skywalkPropertyId)
      .maybeSingle();
    if (error) return null;
    propertyParcelId = (data?.parcel_id as string | null) ?? null;
  }

  if (skywalkContactId) {
    const { data, error } = await supabase
      .from("skywalk_contacts")
      .select("parcel_id")
      .eq("skywalk_contact_id", skywalkContactId)
      .maybeSingle();
    if (error) return null;
    contactParcelId = (data?.parcel_id as string | null) ?? null;
  }

  if (!propertyParcelId && !contactParcelId) return null;

  // Property link wins on disagreement; "both" only when they match.
  let resolvedId: string;
  let source: LinkedParcelIntel["link_source"];
  if (propertyParcelId && contactParcelId && propertyParcelId === contactParcelId) {
    resolvedId = propertyParcelId;
    source = "both";
  } else if (propertyParcelId) {
    resolvedId = propertyParcelId;
    source = "property";
  } else {
    resolvedId = contactParcelId as string;
    source = "contact";
  }

  const { data, error } = await supabase
    .from("parcels_intel")
    .select(PARCEL_FIELDS)
    .eq("id", resolvedId)
    .maybeSingle();
  if (error || !data) return null;

  // Supabase's typed builder treats a comma-list select with no inferred
  // schema as a string error union; we know the shape and cast through.
  const parcel = data as unknown as Record<string, unknown>;

  return {
    id: (parcel.id as string | undefined) ?? resolvedId,
    property_address: (parcel.property_address as string | null) ?? null,
    owner_name: (parcel.owner_name as string | null) ?? null,
    owner_type: (parcel.owner_type as string | null) ?? null,
    market_value: (parcel.market_value as number | null) ?? null,
    unit_count: (parcel.unit_count as number | null) ?? null,
    contact_status: (parcel.contact_status as string | null) ?? null,
    vacancy_status: (parcel.vacancy_status as string | null) ?? null,
    days_vacant: (parcel.days_vacant as number | null) ?? null,
    score_v2: (parcel.score_v2 as number | null) ?? null,
    desirability_score: (parcel.desirability_score as number | null) ?? null,
    sos_agent_name: (parcel.sos_agent_name as string | null) ?? null,
    sos_agent_address: (parcel.sos_agent_address as string | null) ?? null,
    link_source: source,
  };
}

/**
 * Build a tag set from a linked parcel for AppFolio routing/filtering.
 * These tags appear alongside `skywalk:*` so the receiver can lane:
 *   - "parcel:linked"
 *   - "parcel:score:high|mid|low"
 *   - "parcel:owner-type:entity|institutional|individual"
 *   - "parcel:contact-status:cold|warm|engaged|won|lost"
 *   - "parcel:vacant" / "parcel:vacant-90+"
 *   - "parcel:portfolio:large|medium" (when sos_agent_name + many parcels exist)
 */
export function tagsForParcel(parcel: LinkedParcelIntel | null): string[] {
  if (!parcel) return [];
  const tags = new Set<string>(["parcel:linked"]);

  if (typeof parcel.score_v2 === "number") {
    if (parcel.score_v2 >= 70) tags.add("parcel:score:high");
    else if (parcel.score_v2 >= 50) tags.add("parcel:score:mid");
    else tags.add("parcel:score:low");
  }

  if (parcel.owner_type) tags.add(`parcel:owner-type:${parcel.owner_type}`);

  if (parcel.contact_status) {
    tags.add(`parcel:contact-status:${parcel.contact_status.toLowerCase()}`);
  }

  if (parcel.vacancy_status === "vacant" || (parcel.days_vacant ?? 0) > 0) {
    tags.add("parcel:vacant");
    if ((parcel.days_vacant ?? 0) >= 90) tags.add("parcel:vacant-90+");
  }

  return [...tags];
}
