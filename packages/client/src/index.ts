export { nubleClient, createClient } from "./client.js";
export type { NubleOptions, NubleInstance, VaultClient, IdentityClient, BlazeClient } from "./client.js";

// Re-export schema DSL so consumers only need this one package
export { defineSchema, t, serializeSchema } from "@nublestation/blaze";
export type { SerializedSchema } from "@nublestation/blaze";

// Re-export common service types
export { VaultError } from "@nublestation/vault";
export type { FileResult, Grant, GrantRole } from "@nublestation/vault";
export type { IdentityUser } from "@nublestation/identity";
