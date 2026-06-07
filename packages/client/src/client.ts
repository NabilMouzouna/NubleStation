import { createVaultClient } from "@nublestation/vault";
import { createIdentityClient } from "@nublestation/identity";
import { createBlazeClient } from "@nublestation/blaze";
import type { Schema } from "@nublestation/blaze";
import type { IdentityClient } from "@nublestation/identity";
import type { BlazeClient } from "@nublestation/blaze";

export type VaultClient = ReturnType<typeof createVaultClient>;

export interface NubleOptions<S extends Schema<any>> {
  /** App slug as registered in the Console (required for identity session scoping). */
  app?: string;
  /** Direct URL to the Identity service for login/logout redirects.
   *  Defaults to url with "api." replaced by "identity." */
  identityUrl?: string;
  /** Schema from defineSchema() — enables typed blaze table access. */
  schema?: S;
}

export type NubleInstance<S extends Schema<any>> = {
  vault: VaultClient;
  identity: IdentityClient;
  blaze: BlazeClient<S>["db"];
};

/**
 * Creates the unified NubleStation client.
 *
 * @example
 * ```ts
 * import { nubleClient } from "@nublestation/client";
 * import { schema } from "./schema";
 *
 * const nuble = nubleClient("nbl_key", "http://api.clinic.local", { app: "bucket", schema });
 * const { vault, blaze, identity } = nuble;
 *
 * await vault.listMine();
 * await blaze.file_comments.list();
 * const session = await identity.getSession();
 * ```
 */
export function nubleClient<S extends Schema<any>>(
  apiKey: string,
  url: string,
  opts?: NubleOptions<S>,
): NubleInstance<S> {
  const identityUrl =
    opts?.identityUrl ?? url.replace("://api.", "://identity.");

  const vault = createVaultClient({ url, apiKey });

  const identity = createIdentityClient({
    url,
    identityUrl,
    app: opts?.app ?? "",
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blaze = createBlazeClient<S>({ baseUrl: url, apiKey, schema: opts?.schema as any }).db;

  return { vault, identity, blaze };
}

/** @deprecated Use nubleClient() instead. */
export function createClient(config: { url: string; apiKey: string; app?: string }) {
  return nubleClient(config.apiKey, config.url, { app: config.app });
}

export type { IdentityClient, BlazeClient };
