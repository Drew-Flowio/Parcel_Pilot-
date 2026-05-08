import type { ResourceAdapter, SkywalkResource } from "../types";
import { messagesAdapter } from "./messages";
import { contactsAdapter } from "./contacts";
import { propertiesAdapter } from "./properties";

const REGISTRY: Record<SkywalkResource, () => ResourceAdapter> = {
  messages: messagesAdapter,
  contacts: contactsAdapter,
  properties: propertiesAdapter,
};

export function getAdapter(resource: SkywalkResource): ResourceAdapter {
  const factory = REGISTRY[resource];
  if (!factory) throw new Error(`Unknown Skywalk resource: ${resource}`);
  return factory();
}

export function isSkywalkResource(value: string): value is SkywalkResource {
  return value === "messages" || value === "contacts" || value === "properties";
}

/**
 * Resource priority for the dashboard / health checks. Messages first because
 * conversation body text is the highest-value signal we can pull from Skywalk.
 */
export const RESOURCE_PRIORITY: SkywalkResource[] = ["messages", "contacts", "properties"];
