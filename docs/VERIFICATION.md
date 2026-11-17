# Verification and handoff

Completed on 17 November 2026 using Node.js 22.23.5 and Java 21.

## Checks performed

| Check | Result |
| --- | --- |
| Frontend `npm run build` | Passed TypeScript checks and Vite bundling |
| Frontend `npm run lint` | Passed with no errors or warnings |
| Backend `npm run build` | Passed |
| `npm test` and direct scheduling test run | Passed; 11 scheduling/validation tests |
| `npm run test:integration` | Passed; 5 tests against local Auth/Database emulators and the real Express API |
| Ignore-pattern check | Local environment files and common service-account filenames ignored; example files included |

The scheduling tests cover ownership, patient age/gender, time validation, recurring availability and daylight-saving boundaries, overlap rejection, adjacent appointments, cancellation reasons, payment ownership, absence conflicts, doctor permissions, private-data filtering, and legacy record IDs.

The integration tests confirm:

- A patient cannot change their role, read another profile, read raw schedule data, or write bookings directly to Firebase.
- Unauthenticated API requests and unauthorized schedule edits are rejected.
- Two concurrent booking requests for one slot produce one success and one conflict.
- An absence racing with a booking leaves no active appointment during the absence.
- Concurrent reviews from one patient produce only one saved review; public reviews omit login email addresses.

These tests use the disposable `demo-doctor-calendar` emulator project. No live profiles, appointments, security rules, or credentials were changed.

## Dependency audit

Results from `npm audit --json` and `npm audit --omit=dev --json` on 17 November 2026:

| Dependency set | Moderate | High | Critical |
| --- | ---: | ---: | ---: |
| Frontend, including development tools | 14 | 0 | 0 |
| Frontend, production only | 0 | 0 | 0 |
| Backend, including development tools | 8 | 0 | 0 |
| Backend, production only | 8 | 0 | 0 |

Compatible patches were applied to both lockfiles. A scoped override upgrades Firestore's transitive `@grpc/grpc-js` dependency within major version 1 to address the remaining high-severity findings. This application uses Realtime Database, not Firestore.

Remaining findings involve upstream development tooling and backend dependencies such as the Firebase Admin SDK's Google client/UUID dependency chains. Findings include affected dependents, not necessarily distinct vulnerabilities. Do not interpret these counts as proof of exploitability or as a clean security audit. Further remediation requires reviewing upstream upgrades; automatic breaking downgrades and blanket `--force` changes were not applied.

## Unverified and remaining limitations

- No browser was connected for visual checks, real screenshots, or interactive end-to-end testing.
- The GitHub Actions workflow is configured, but has not run on GitHub.
- No Git repository metadata is present in this workspace, so staged files and commit history could not be checked for previously committed credentials.
- Vite reports a bundle-size warning for the approximately 513 kB JavaScript chunk (about 154 kB gzipped). The build succeeds; code splitting remains a possible improvement.
- JSON/file-picker persistence was reviewed in source but not exercised through a browser. Local mode is a demonstration, not a secure multi-user data store.
- License selection remains the project owner's decision.

## Before a live deployment

1. Back up existing Firebase data and inspect existing user roles if the older permissive rules were deployed.
2. Configure the frontend environment and matching backend credentials. Never place service account credentials in `VITE_*` variables.
3. Deploy the matching API and the updated Firebase rules together. Old direct-write clients are incompatible with the new rules.
4. Initialize only a new development database from the sample JSON; do not overwrite existing records.
5. Configure the clinic time zone, API origin allowlist, and production SPA/API routing.
6. Verify patient, doctor, and administrator workflows in a browser, then add screenshots made with fictional data.
