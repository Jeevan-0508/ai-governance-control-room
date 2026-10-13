# Security and privacy boundaries

## Data handling

The project is a static browser application. The current code does not define an API, authentication flow, server-side database, analytics client, or telemetry endpoint. User-entered operator-console data is stored in browser `localStorage`.

This is a privacy boundary, not a security certification. A browser profile, machine, extension, or static hosting environment can still expose data to its own operators or compromise surface.

## Evidence and claims

The demo portfolio is fictional and the framework model is a crosswalk for inspection. The UI should not be interpreted as a legal conclusion, certification, or production compliance assessment.

## Deployment considerations

If the model is adapted for real organisational data, add access control, retention, encryption, audit logging, change control, and an explicit data-processing review before deployment. Those controls are outside the current static repository.
