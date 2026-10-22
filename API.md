# API workbench guide

Create a workspace with `POST /api/workspaces` and an empty JSON object. The response contains a `token` and immutable `expiresAt`. Supply `Authorization: Bearer <token>` on all following workspace requests. The browser workbench handles this for you; never paste a real database credential into it.

| Method             | Path                                                             | Behavior                                                    |
| ------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| GET                | `/api/catalog`                                                   | Public fictional samples and request examples               |
| GET / DELETE       | `/api/workspace`                                                 | Inspect expiry and visitor records / delete your workspace  |
| GET / POST         | `/api/composers`, `/api/persons`, `/api/teams`, `/api/customers` | List samples plus visitor records / create a visitor record |
| GET / PUT / DELETE | `/api/{resource}/{id}`                                           | Read / update / delete one record                           |
| GET / POST         | `/api/teams/{id}/players`                                        | Read / append a validated player                            |
| GET / POST         | `/api/customers/{username}/invoices`                             | Read / create an invoice                                    |
| POST               | `/api/signup`                                                    | Create a demo user within this workspace                    |
| POST               | `/api/login`                                                     | Verify that demo user's submitted password                  |

Use the workbench's scenario chooser for complete example bodies. Create a record before choosing “Use returned ID.” Samples have IDs beginning with `sample-` and reject changes. `persons` have `firstName`, `lastName`, `birthDate`, `roles` and `dependents`; teams contain `name`, `mascot` and optional `players`; customers contain `firstName`, `lastName` and `userName`. Add invoices through their dedicated endpoint. Each invoice's subtotal is computed from `lineItems`; `tax` is a non-negative amount and `dateShipped` is optional.

Limits: 60 visitor records and 8 demo users per workspace, 12 players per team, 10 invoices per customer, 20 line items per invoice, 40 KB request bodies and 120 KB workspaces. Amounts require up to two decimal places, dates must be real ISO calendar dates, and server-owned fields cannot be supplied. Login is limited to five attempts per minute per workspace. Errors use HTTP 400/401/403/404/409/413/429/503 as appropriate.

No credentials or production data from the original coursework are used. Password hashes and workspace token hashes are never returned by the API.
