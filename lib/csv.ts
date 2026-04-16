import type { Parcel } from "./types";

/** Selected-row export (bulk action). */
export const BULK_EXPORT_COLUMNS: { key: keyof Parcel; header: string }[] = [
  { key: "owner_name", header: "owner_name" },
  { key: "property_address", header: "property_address" },
  { key: "mailing_address", header: "mailing_address" },
  { key: "market_value", header: "market_value" },
  { key: "unit_count", header: "unit_count" },
  { key: "desirability_score", header: "desirability_score" },
  { key: "contact_status", header: "contact_status" },
];

const COLUMNS: { key: keyof Parcel; header: string }[] = [
  { key: "owner_name", header: "Owner" },
  { key: "owner_phone", header: "Phone" },
  { key: "owner_email", header: "Email" },
  { key: "property_address", header: "Property Address" },
  { key: "mailing_address", header: "Mailing Address" },
  { key: "city", header: "City" },
  { key: "state", header: "State" },
  { key: "zip", header: "Zip" },
  { key: "market_value", header: "Market Value" },
  { key: "unit_count", header: "Units" },
  { key: "vacancy_status", header: "Vacancy" },
  { key: "days_vacant", header: "Days Vacant" },
  { key: "is_absentee_owner", header: "Absentee" },
  { key: "is_professionally_managed", header: "Pro Managed" },
  { key: "desirability_score", header: "Desirability" },
  { key: "contact_status", header: "Contact Status" },
  { key: "last_contacted_at", header: "Last Contacted" },
];

function escape(val: unknown): string {
  if (val == null) return "";
  const s = String(val);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function parcelsToCsv(rows: Parcel[]): string {
  const head = COLUMNS.map((c) => c.header).join(",");
  const body = rows
    .map((row) => COLUMNS.map((c) => escape(row[c.key])).join(","))
    .join("\n");
  return `${head}\n${body}\n`;
}

export function parcelsToCsvBulk(rows: Parcel[]): string {
  const head = BULK_EXPORT_COLUMNS.map((c) => c.header).join(",");
  const body = rows
    .map((row) => BULK_EXPORT_COLUMNS.map((c) => escape(row[c.key])).join(","))
    .join("\n");
  return `${head}\n${body}\n`;
}

/** Filtered export with portfolio grouping column (owner or mailing bucket label). */
export function parcelsToCsvPortfolio(
  rows: Array<{ parcel: Parcel; portfolio_group: string }>
): string {
  const head = ["portfolio_group", ...COLUMNS.map((c) => c.header)].join(",");
  const body = rows
    .map(({ parcel, portfolio_group }) =>
      [escape(portfolio_group), ...COLUMNS.map((c) => escape(parcel[c.key]))].join(
        ","
      )
    )
    .join("\n");
  return `${head}\n${body}\n`;
}
