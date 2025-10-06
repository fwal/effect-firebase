export class MockGeoPoint {
  constructor(latitude: number, longitude: number) {
    this.latitude = latitude;
    this.longitude = longitude;
  }

  readonly latitude: number;
  readonly longitude: number;

  isEqual(other: MockGeoPoint): boolean {
    return this.latitude === other.latitude && this.longitude === other.longitude;
  }

  valueOf(): string {
    return `${this.latitude},${this.longitude}`;
  }
}
