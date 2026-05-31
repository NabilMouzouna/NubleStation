/**
 * Copies text to clipboard.
 * Falls back to execCommand for HTTP contexts where navigator.clipboard is unavailable.
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback for HTTP (non-secure) origins
  const el = document.createElement("textarea");
  el.value = text;
  el.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
  document.body.appendChild(el);
  el.focus();
  el.select();
  document.execCommand("copy");
  document.body.removeChild(el);
}
