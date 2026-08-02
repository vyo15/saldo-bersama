# ADR-0003 Firebase Google Auth dan server session

**Status:** Accepted  
**Date:** 2026-08-02

## Decision
Google sign-in memakai Firebase. Backend memverifikasi ID token dan menerbitkan signed HttpOnly session.

## Consequences
Allowlist, role, origin, session secret, dan binding user diverifikasi server. Frontend guard bukan authorization.
