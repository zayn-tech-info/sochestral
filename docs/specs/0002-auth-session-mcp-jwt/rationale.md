# 0002 rationale: Auth session and MCP JWT issuance

## Context

Slice 1 needs a real tenant identity on the product side before orchestration can call SocialMCP without `user_local_default`. Spec 0001 created opaque `users.id` values and a local provision helper, but no password and no session. Without sign in, there is no safe way to know which SaaS user is acting. Without MCP JWT mint, orchestration cannot present `Authorization: Bearer` with `sub` equal to that user id using the shared `JWT_SECRET` contract.

The product and SocialMCP remain separate. Product login is for the SaaS app. The MCP JWT is only a short lived proof of which product user the orchestration layer is acting as when it calls SocialMCP tools. Public signup, password reset email, MFA, and social login for the product app are out of scope for this feature so the Tracer Bullet path stays thin: provision, set password, sign in, mint JWT.

## Options considered

### Option 1: Self hosted Argon2id + opaque DB sessions + jose MCP JWT

Product sessions in Postgres; MCP JWT minted separately with the shared secret SocialMCP already verifies.

**Pros**:
- Aligns with existing `JWT_SECRET` / HS256 / `sub` contract
- Revocable sessions; no hosted auth vendor in Slice 1
- Thin and explicit for Tracer Bullet

**Cons**:
- Team owns password hashing, cookie hardening, and session cleanup
- No built in password reset or MFA (deferred on purpose)

### Option 2: Full auth framework (e.g. Better Auth) on Postgres

Adopt a batteries included auth library for sessions and credentials.

**Pros**:
- Faster path to reset flows and more methods later

**Cons**:
- Heavier than Slice 1 needs; MCP JWT mint still custom
- Extra abstraction over a contract we already understand from SocialMCP

### Option 3: Hosted auth provider (Clerk or similar)

Outsource product identity to a vendor; map vendor user to `users.id`.

**Pros**:
- Less password security to operate

**Cons**:
- Couples private SaaS identity to a vendor early
- Still need a stable opaque `users.id` and MCP JWT bridge
- Overkill for provisioned only Slice 1

## Rationale

Slice 1 only needs “who is this SaaS user” and “mint a short lived MCP caller token.” Self hosted sessions keep identity in the same Postgres database as 0001 and match how SocialMCP already verifies Bearer JWTs. A full framework or hosted IdP would add surface area before the publish loop is proven. Separating the product cookie session from the MCP JWT avoids treating a long lived browser session as a SocialMCP credential and keeps platform tokens out of the product DB.
