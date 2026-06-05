export class IdentityError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(`IdentityError ${status}: ${code}`);
    this.name = "IdentityError";
  }
}
