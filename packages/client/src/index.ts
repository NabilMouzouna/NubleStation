export { createClient } from "./client.js";
export type { ClientConfig, NubleClient } from "./client.js";

// Re-export service types so consumers don't need to import from individual packages
export { VaultError } from "@nublestation/vault";
export type { FileResult } from "@nublestation/vault";
