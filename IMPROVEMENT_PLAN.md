# Portfolio readiness plan

The goal is a reproducible, tested educational application with working English UI, safer authorization, and reliable booking. Preserve the existing design, routes, data identifiers, and local JSON option. No production deployment or live-data migration is part of this work.

- [x] 1. Resolve frontend build/lint failures and verify the backend build.
- [x] 2. Protect role profiles and private scheduling data; enforce permissions and booking conflicts on the server with atomic writes.
- [x] 3. Surface persistence failures, retain cancellation reasons and patient details, and make payment/schedule actions await saves.
- [x] 4. Add environment-based Firebase configuration, credential ignore rules, a Node version declaration, and accurate setup instructions.
- [x] 5. Add focused regression tests and GitHub Actions; review dependency updates and run the complete checks.
- [x] 6. Replace starter branding and update the README.
- [ ] Follow-up: visually verify screens and add real screenshots when a browser is connected.

Implementation and automated verification are complete. See [verification results](docs/VERIFICATION.md) for the passing checks, remaining moderate dependency findings, and runtime limitations. GitHub Actions is configured but has not been run on GitHub.

Publishing a live demo requires applying the updated Firebase rules and deploying the matching backend together. License selection remains the project owner's choice. Screenshots must come from the actual application; do not invent images or claim unperformed runtime checks.
