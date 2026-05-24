export interface UploadResult {
  ok: boolean;
  version?: string;
  appSlug?: string;
  error?: string;
}

/**
 * POSTs a zip buffer as multipart/form-data to the Gateway deploy endpoint.
 * Returns the parsed JSON response body.
 */
export async function uploadBundle(
  orgUrl: string,
  apiKey: string,
  zipBuffer: Buffer,
): Promise<UploadResult> {
  const form = new FormData();
  form.append(
    "bundle",
    new Blob([new Uint8Array(zipBuffer)], { type: "application/zip" }),
    "bundle.zip",
  );

  const res = await fetch(`${orgUrl}/v1/orbit/deploy`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  const body = (await res.json()) as UploadResult;
  return body;
}

export interface StatusResult {
  reachable: boolean;
  status?: number;
  error?: string;
}

export async function checkGatewayHealth(orgUrl: string): Promise<StatusResult> {
  try {
    const res = await fetch(`${orgUrl}/healthz`, { signal: AbortSignal.timeout(5_000) });
    return { reachable: res.ok, status: res.status };
  } catch (err) {
    return { reachable: false, error: (err as Error).message };
  }
}
