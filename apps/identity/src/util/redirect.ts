/**
 * Open-redirect prevention (ADR 014): a redirect_uri is only honored if it
 * points at the org's own LAN — i.e. its host is `{org}.local` or any
 * `*.{org}.local` subdomain. Anything else (external hosts, other schemes,
 * malformed URLs) is rejected.
 */
export function isAllowedRedirect(uri: string, orgDomain: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const root = `${orgDomain}.local`;
  return url.hostname === root || url.hostname.endsWith(`.${root}`);
}
