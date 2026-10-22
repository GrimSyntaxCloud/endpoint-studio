# Endpoint Studio

[Live demo](https://black-beach-00f091d0f.5.azurestaticapps.net) · [API guide](API.md)

An interactive REST API workbench recovered from Andres Macias's [WEB 420 coursework](https://github.com/GrimSyntaxCloud/web-420). Create a private demo workspace, choose a resource, send JSON requests and inspect real server responses. The design pairs a precise instrument-panel layout with a spirograph, kinetic heading, spring-like button feedback and split-flap-style response codes.

## What it preserves and repairs

- Composer list/detail/create/update/delete.
- People with roles, dependents and a birth date.
- Sports teams, player lists, player creation and team deletion.
- Customers and invoices, including line items, shipping date and tax.
- Signup and password verification as isolated API exercises.

The original API routes and schemas informed a modern Express implementation. The workbench itself is new. Password verification now hashes the submitted password using a unique salt and Node's scrypt, correcting the original signup exercise's fixed-password bug. Invoice subtotals are computed from validated line items. Unknown fields and query-selector objects are rejected. Samples are read-only; edits preserve customer invoices.

Each visitor workspace uses an unguessable token kept in sessionStorage, with only its hash stored on the server. The token is a capability: someone who obtains it can access that workspace. Visitor records and demo users expire **96 hours after workspace creation**, never renewed by edits. Fictional sample records are immutable source fixtures and remain available after cleanup. Signup/login demonstrates password verification within the workspace; it does not establish a production account or replace the workspace token.

## Local development

Use Node.js 22.22 or newer. `npm ci` installs the locked dependencies. `npm test` runs the regression suite. `npm run build` creates the deployment package. No global CLI or paid tool is required.

For a disposable local demo with no database account, run:

```sh
LOCAL_DEMO=true PORT=4391 npm start
```

For persistent local MongoDB, copy `.env.example` to `.env`, use a local development database, and run `npm start`. Node loads that file; it is ignored by Git. `LOCAL_DEMO=true` uses process memory, so restarting clears it. It is never enabled in the hosted app.

## Free deployment and data

GitHub Actions checks tests, dependency advisories and packaging before deploying to Azure Static Web Apps **Free**. Deployment credentials are in the repository's `azure` environment. Database settings are server-only Azure app settings. Cleanup uses a separate, collection-scoped credential in `DEMO_CLEANUP_MONGODB_URI`.

The app uses an isolated collection in the existing `portfolio-demos` database and shares its existing **400 RU/s** pool. It has no dedicated throughput. The Cosmos free tier, single-region configuration, account throughput cap and subscription spending limit must stay enabled. No subscription upgrade is authorized. If an Azure trial expires, stop rather than converting it to paid service.

Expiry is enforced by the API at the fixed deadline. Hourly cleanup physically deletes expired visitor documents on the next successful run; new-workspace/room creation also attempts cleanup. GitHub may delay scheduled runs or disable them after inactivity, so physical deletion is not guaranteed to occur at the exact deadline. Cleanup logs counts only and excludes permanent demo records.

## Design and accessibility

Original CSS, SVG and native Web Animations keep the animation layer dependency-free. System fonts, keyboard-operable controls, visible focus states, reduced-motion support and a pause-motion control are included. There are no analytics, paid assets or third-party font downloads.

## Attribution and validation

Original coursework: Andres Macias, WEB 420, with instructor Richard Krasso credited in the source repository. Recovery, new UI and security repairs developed by Andres with AI assistance. This repository contains fresh maintained source, not the historical Git history or embedded credential.

Tests cover workspace isolation and expiry, sample preservation, malformed input, teams, invoices, password handling and login attempt limits. Browser checks exercise actual JSON requests and responses. The old Atlas credential in `web-420` history still needs revocation by its owner; this application does not use it.
