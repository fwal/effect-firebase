# effect-firebase

Mappings and utilities for using Firebase with Effect.

## Databases

### Firestore

The library provides schemas agnostic to the Firebase SDK meaning that you can use the same schemas for both client and server applications.

#### Schema

| Schema     |  Firestore Type   | Status |
| ---------- | ----------------- | ------ |
| Date       | Timestamp         | ✅     |
| ServerDate | serverTimestamp   | ✅     |
| GeoPoint   | GeoPoint          | ✅     |
| Reference  | DocumentReference | ✅     |
| -          | FieldValue        | -      |

#### Model and Repository

⌛️ _In progress_

### Data Connect

_Not started_

## Functions

| Function          | Description | Status |
| ----------------- | ----------- | ------ |
| onRequest         |             | ✅     |
| onCall            |             | ✅     |
| onDocumentCreated |             | -      |
| onDocumentUpdated |             | -      |
| onDocumentDeleted |             | -      |
| onDocumentWritten |             | -      |
