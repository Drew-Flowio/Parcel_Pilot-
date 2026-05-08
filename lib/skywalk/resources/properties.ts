import { readSkywalkEnv } from "../env";
import {
  createRestAdapter,
  normalizeAddress,
  pickDate,
  pickNum,
  pickStr,
} from "./_rest";

export function propertiesAdapter() {
  const env = readSkywalkEnv();
  return createRestAdapter<Record<string, unknown>>({
    resource: "properties",
    tableName: "skywalk_properties",
    conflictColumn: "skywalk_property_id",
    path: env.paths.properties,
    byIdPath: env.paths.propertyById,
    defaultPageSize: 100,
    maxPageSize: 200,
    cursorMode: "token_or_timestamp",

    recordTimestamp(rec) {
      return pickDate(rec, "updated_at", "modified_at", "created_at");
    },

    toRow(rec) {
      const id =
        pickStr(rec, "id", "property_id", "listing_id", "skywalk_property_id") ??
        `synthetic:${Math.random()}`;

      const a1 = pickStr(rec, "address_line1", "address1", "street", "address");
      const a2 = pickStr(rec, "address_line2", "address2", "unit");
      const city = pickStr(rec, "city", "locality");
      const state = pickStr(rec, "state", "region", "province");
      const zip = pickStr(rec, "zip", "postal_code", "zip_code");

      return {
        skywalk_property_id: id,
        name: pickStr(rec, "name", "title"),
        address_line1: a1,
        address_line2: a2,
        city,
        state,
        zip,
        normalized_address: normalizeAddress([a1, a2, city, state, zip]),
        unit_count: pickNum(rec, "unit_count", "units"),
        status: pickStr(rec, "status", "stage"),
        raw: rec,
      };
    },
  });
}
