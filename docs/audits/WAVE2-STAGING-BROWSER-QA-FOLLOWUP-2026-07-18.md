# Wave 2 Staging Browser QA Follow-Up

Date: 2026-07-18
Scope: staging browser QA failures reported after PR #366 went green.

## Reported Failures

1. PPDB page shows `Gagal memuat data`.
2. Student account creation fails with `Keycloak Admin API tidak tersedia — operasi dibatalkan`.
3. Class management page shows dashboard error boundary: `Terjadi Kesalahan`.

## Diagnosis

### PPDB page load

Root cause: code bug.

`apps/web/src/app/dashboard/ppdb/page.tsx` requested:

```ts
/ppdb/leads?limit=200
```

The API query DTO in `apps/api/src/ppdb/dto/list-leads.dto.ts` allows a maximum of 100:

```ts
limit: z.coerce.number().int().positive().max(100).default(20)
```

In staging this returns 400, `apiFetch()` converts the failed response to `null`, and the page renders the generic `LoadError`.

Fix applied:
- Added `apps/web/src/app/dashboard/ppdb/ppdb-query.ts`.
- Changed the PPDB dashboard page to request `/ppdb/leads?limit=100`.
- Added `apps/web/src/__tests__/ppdb-query.test.ts` to pin the web query below the API DTO maximum.

### Student provisioning / Keycloak Admin API

Root cause: code bug exposed by staging Keycloak password policy.

The provisioning flow calls `POST /provision/students`, which uses `KeycloakAdminService` and the `diis-api` client-credentials service account. The API container maps:

```yaml
KEYCLOAK_URL: http://keycloak:8080
KEYCLOAK_REALM: diis
KEYCLOAK_CLIENT_ID: diis-api
KEYCLOAK_CLIENT_SECRET: ${KEYCLOAK_API_CLIENT_SECRET}
```

The realm JSON and runbook expect `diis-api` to be confidential, service-account enabled, and assigned only `realm-management` roles `manage-users` and `view-users`.

VPS smoke test from inside `smk-staging-api` proved the realm/env/service account are usable:

```text
kc_base=http://keycloak:8080
kc_realm=diis
kc_client=diis-api
kc_secret_present=true
token_http=200
token_ok=true
role_lookup_http=200
create_user_http=201
assign_role_http=204
reset_password_http=204
admin_smoke=PASS
cleanup_delete_http=204
```

The first smoke test failed only at `reset-password` when the supplied password lacked a special character:

```text
reset_password_http=400
reset_password_error={"error":"invalidPasswordMinSpecialCharsMessage","error_description":"Invalid password: must contain at least 1 special characters."}
```

Application root cause:
- `apps/api/src/provisioning/provisioning.service.ts` generated temporary passwords from uppercase/lowercase/digit characters only.
- Staging Keycloak requires at least one special character.
- `KeycloakAdminService` wraps the resulting 400 into the generic unavailable message shown by the wizard.

Fix applied:
- `generateTempPassword()` now always includes uppercase, lowercase, digit, and one special character, then shuffles to keep the final 12-character temporary password non-predictable.
- `apps/api/src/__tests__/provisioning.spec.ts` now asserts the temporary password includes those required character classes.

Reference runbook:
- `docs/runbooks/keycloak-service-account.md`

## Recommended Staging Verification After Deploy

After this patch is deployed to staging, rerun browser QA:
- PPDB page load.
- Accepted PPDB lead to student wizard.
- Student account creation from the wizard.

Optional low-level Keycloak check from the staging API container:

```bash
curl -s -X POST \
  "https://auth.smkdarussalamsubah.sch.id/realms/diis/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=diis-api" \
  -d "client_secret=$KEYCLOAK_API_CLIENT_SECRET" | jq .
```

Expected: JSON contains `access_token`.

Then verify a least-privilege admin call or a create/assign/reset/delete smoke user. Do not print secrets or tokens.

## Status

PPDB web failure: fixed locally, pending verification after deployment.

Keycloak provisioning failure: fixed locally by aligning generated temporary passwords with staging Keycloak password policy, pending verification after deployment.

### Class management page

Root cause: code bug in the Wave 2 class-management UI.

`apps/web/src/app/dashboard/kelas/_components/KelasClient.tsx` used empty-string Radix/shadcn select items for the optional "kosongkan wali kelas" choice:

```tsx
<SelectItem value="">— kosongkan —</SelectItem>
```

Radix Select reserves empty string for clearing the selected value and does not allow `Select.Item` to use `value=""`. In staging, users with management access render the editable wali-kelas selects immediately, so the client page can crash into the dashboard error boundary.

Fix applied:
- Added `apps/web/src/app/dashboard/kelas/kelas-ui.ts`.
- Replaced empty-string select item values with non-empty sentinel `__none__`.
- Mapped the sentinel back to `null` before sending `teacherId` to the API.
- Added `apps/web/src/__tests__/kelas-ui.test.ts`.
- Added an explicit unauthenticated redirect to `/login` in `apps/web/src/app/dashboard/kelas/page.tsx`.

Status: fixed locally, pending verification after deployment.
