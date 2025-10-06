export class MockTimestamp {
  static now(): MockTimestamp {
    return this.fromDate(new Date());
  }

  static fromDate(date: Date): MockTimestamp {
    return new MockTimestamp(Math.floor(date.getTime() / 1000), date.getTime() % 1000 * 1000000);
  }

  static fromMillis(millis: number): MockTimestamp {
    return new MockTimestamp(Math.floor(millis / 1000), millis % 1000 * 1000000);
  }

  constructor(seconds: number, nanoseconds: number) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }

  readonly seconds: number;
  readonly nanoseconds: number;

  toDate(): Date {
    return new Date(this.seconds * 1000 + this.nanoseconds / 1000000);
  }

  toMillis(): number {
    return this.seconds * 1000 + this.nanoseconds / 1000000;
  }

  isEqual(other: MockTimestamp): boolean {
    return this.seconds === other.seconds && this.nanoseconds === other.nanoseconds;
  }
  
  valueOf(): string {
    return `${this.seconds}.${this.nanoseconds}`;
  }

  toString(): string {
    return this.valueOf();
  }
}
