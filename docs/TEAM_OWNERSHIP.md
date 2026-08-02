# Team Ownership

## Prinsip

Setiap area memiliki Responsible dan Approver. Satu orang boleh memegang beberapa peran pada project kecil, tetapi keputusan dan approval tetap harus tercatat pada PR.

| Area | Responsible | Approver | Consulted |
|---|---|---|---|
| Product requirements | Product owner | Repository owner | UX, QA |
| Frontend/UI | Frontend engineer | Frontend/code owner | UX, accessibility, QA |
| API/business service | Backend engineer | Backend/code owner | QA, security |
| Schema/migration | Database owner | Architect/repository owner | Backend, QA, operations |
| Auth/security | Backend/security reviewer | Repository owner | Frontend, QA |
| Google integration | Integration owner | Backend/code owner | Operations |
| CI/deployment/env | DevOps/repository owner | Release manager | Backend, QA |
| QA/release acceptance | QA | Product/release owner | Engineers |
| Backup/restore/incident | Operations | Incident commander/owner | Backend, security |

`CODEOWNERS` saat ini memakai `@vyo15` sebagai fallback sampai team alias GitHub tersedia.

## RACI guarded operations

- Schema migration: database owner Responsible, repository owner Accountable.
- Auth/role change: security/backend Responsible, repository owner Accountable.
- Production deploy: release manager Responsible, owner Accountable.
- Restore/import besar: operations Responsible, owner Accountable, backend/QA Consulted.
- Purge: owner-only maintenance workflow; tidak boleh dilakukan langsung melalui SQL.
