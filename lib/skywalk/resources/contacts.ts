import { readSkywalkEnv } from "../env";
import {
  createRestAdapter,
  normalizeEmail,
  normalizePhone,
  pickDate,
  pickStr,
} from "./_rest";

export function contactsAdapter() {
  const env = readSkywalkEnv();
  return createRestAdapter<Record<string, unknown>>({
    resource: "contacts",
    tableName: "skywalk_contacts",
    conflictColumn: "skywalk_contact_id",
    path: env.paths.contacts,
    byIdPath: env.paths.contactById,
    defaultPageSize: 100,
    maxPageSize: 200,
    cursorMode: "token_or_timestamp",

    recordTimestamp(rec) {
      return pickDate(rec, "updated_at", "modified_at", "created_at");
    },

    toRow(rec) {
      const id =
        pickStr(rec, "id", "contact_id", "lead_id", "skywalk_contact_id") ??
        // synthetic fallback to keep ingestion alive
        `synthetic:${typeof rec.email === "string" ? rec.email : Math.random()}`;

      return {
        skywalk_contact_id: id,
        first_name: pickStr(rec, "first_name", "given_name"),
        last_name: pickStr(rec, "last_name", "family_name", "surname"),
        full_name:
          pickStr(rec, "full_name", "name") ??
          (
            [
              pickStr(rec, "first_name", "given_name"),
              pickStr(rec, "last_name", "family_name"),
            ]
              .filter(Boolean)
              .join(" ") || null
          ),
        email: normalizeEmail(pickStr(rec, "email", "email_address")),
        phone: normalizePhone(pickStr(rec, "phone", "phone_number", "mobile", "cell")),
        role: pickStr(rec, "role", "type"),
        status: pickStr(rec, "status", "stage", "lifecycle"),
        primary_property_id: pickStr(rec, "property_id", "primary_property_id", "listing_id"),
        raw: rec,
      };
    },
  });
}
