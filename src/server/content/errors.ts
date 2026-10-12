/**
 * Bad input to a content write. `message` is plain English for the admin
 * panel; `field` names what was wrong ("lat", "workHours.days", "setup[3].key")
 * so a form can point at it.
 */
export class ContentError extends Error {
  readonly field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.name = "ContentError";
    this.field = field;
  }
}
