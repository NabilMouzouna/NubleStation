/**
 * Builds a real multipart/form-data request body with a single `file` field.
 * Returns the raw bytes and the content-type header (which includes the boundary).
 */
export async function makeFileUploadRequest(
  content: Uint8Array | string,
  filename = "test.txt",
  mimeType = "text/plain",
): Promise<{ bodyBytes: Uint8Array<ArrayBuffer>; contentType: string }> {
  const blob = new Blob(
    [typeof content === "string" ? new TextEncoder().encode(content) : Buffer.from(content)],
    { type: mimeType },
  );
  const form = new FormData();
  form.append("file", blob, filename);

  const tmp         = new Request("http://localhost/upload", { method: "POST", body: form });
  const ab          = await tmp.arrayBuffer();           // ArrayBuffer
  const bodyBytes   = new Uint8Array(ab);                // Uint8Array<ArrayBuffer>
  const contentType = tmp.headers.get("content-type")!;

  return { bodyBytes, contentType };
}
