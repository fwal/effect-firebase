export class MockReference {
  constructor(id: string, path: string) {
    this.id = id;
    this.path = path;
  }

  readonly id: string;
  readonly path: string;
}
