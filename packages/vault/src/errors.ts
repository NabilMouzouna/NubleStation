export class VaultError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(`VaultError ${status}: ${code}`);
    this.name = "VaultError";
  }
}
