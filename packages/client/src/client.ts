import { createVaultClient } from "@nublestation/vault";
import type { ClientConfig } from "@nublestation/vault";

export type { ClientConfig };

/**
 * Creates a unified NubleStation client.
 * One config, all services — only install the packages you use.
 *
 * @example
 * ```typescript
 * import { createClient } from "@nublestation/client";
 *
 * const nuble = createClient({
 *   url:    "http://api.clinic.local",
 *   apiKey: "nbl_<key_id>.<secret>",
 * });
 *
 * await nuble.vault.upload("reports", "q1.pdf", file);
 * const files = await nuble.vault.list("reports");
 * ```
 */
export function createClient(config: ClientConfig) {
  return {
    /** File storage — upload, download, list, public/private access */
    vault: createVaultClient(config),

    // Future services — uncomment as they are implemented:
    // /** Database — query your app's custom tables */
    // blaze: createBlazeClient(config),
    //
    // /** Auth — user sessions and SSO */
    // identity: createIdentityClient(config),
  };
}

export type NubleClient = ReturnType<typeof createClient>;
