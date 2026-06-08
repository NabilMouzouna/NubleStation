/** Thrown for any invalid schema definition (bad identifier, reserved name, etc.). */
export class SchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaError";
  }
}
