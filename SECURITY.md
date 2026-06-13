# Security and Data Handling

## Public demo boundary

Sutra is a hackathon portfolio project, not a production identity or secrets
platform. The deployed API is publicly reachable and uses an opaque browser ID
for demo-state separation. That ID is not authentication.

Do not connect a personal or work Google account containing sensitive calendar
or email data to a deployment you do not control.

## Outbound actions

Email sending, calendar creation, and calendar rescheduling use a two-phase
flow. The model prepares an action, stores it as pending, and the UI requires
an explicit confirmation before the API executes it.

## Credential storage

The current demo stores OAuth tokens in SQLite. Tokens are not encrypted at
rest, and Cloud Run's local filesystem is ephemeral and instance-local. A
production deployment should use:

- authenticated application sessions
- encrypted token storage in a managed database or secret store
- a shared OAuth state store
- strict per-user authorization on every data and action endpoint
- audit logs and token revocation

## Secrets

Never commit `.env`, OAuth client secrets, Gemini keys, database files, or
access tokens. Rotate a credential immediately if it appears in source
control, logs, screenshots, issues, or shared conversations.
