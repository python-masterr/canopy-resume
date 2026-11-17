# Canopy Security Specification (Phase 0)

## 1. Data Invariants
1. **User Isolation & PII Split**: Users may only read and write their own `/users/{userId}` profile and `/users/{userId}/private/info` PII document. Only the sole verified administrator (`pythonnmasterr@gmail.com`) may list `/users` and read `/users/{userId}/private/info` for user management. Non-owner, non-admin access is denied.
2. **Screening Ownership**: Every `/screenings/{screeningId}` document must have `ownerId == request.auth.uid`, validated on create, read, list, update, and delete.
3. **Candidate-Parent Sync**: Every `/screenings/{screeningId}/candidates/{candidateId}` document cannot exist without a valid parent `/screenings/{screeningId}` document whose `ownerId == request.auth.uid` (verified via `get()` on update/read and `existsAfter()`/`getAfter()` or `get()` on create for atomic batch writes).
4. **Immutable Ownership & Timestamps**: `ownerId`, `id`, `screeningId`, and `createdAt` are immutable after creation. All `createdAt` and `updatedAt` timestamps must strictly equal `request.time`.
5. **Bounded Arrays & Strict Keys**: Every collection enforces `keys().hasAll(...)` and `keys().hasOnly(...)` on create, `diff().affectedKeys().hasOnly(...)` on update, and `.size()` limits on all strings, IDs, and arrays.
6. **Sole Admin RBAC**: Only the verified sole administrator (`pythonnmasterr@gmail.com` with `email_verified == true`) has admin read/moderation privileges. `/admins` delegation is locked down (`allow read, write: if false`).

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Shadow Field Injection on Screening Create**: Payload includes `isAdmin: true` -> Rejected by `hasOnly(...)`.
2. **Identity Spoofing on Screening Create**: `ownerId` set to `"other_user_uid"` -> Rejected by `data.ownerId == request.auth.uid`.
3. **Unverified Email Write**: `request.auth.token.email_verified == false` -> Rejected by `isVerifiedUser()`.
4. **ID Poisoning**: Document ID `screeningId` of 200 characters or containing `/` or `$` -> Rejected by `isValidId(screeningId)`.
5. **Timestamp Spoofing**: `createdAt` set to client date `"2020-01-01T00:00:00Z"` instead of `request.time` -> Rejected by `data.createdAt == request.time`.
6. **Orphaned Candidate Write**: Creating a candidate under a non-existent or unowned `screeningId` -> Rejected by parent check.
7. **PII Cross-User Read**: User B attempts `get` on `/users/userA/private/info` -> Rejected by `isOwner(userId)`.
8. **Unbounded Array Exhaustion**: Sending 500 items in `customRole.skills` or `candidate.detectedSkills` -> Rejected by `.size() <= MAX`.
9. **Update-Gap Score Tampering**: Candidate update attempting to alter `score` or `ownerId` alongside `status` -> Rejected by `affectedKeys().hasOnly(['status', 'notes', 'updatedAt'])`.
10. **Terminal State Lock Bypass**: Updating an `'archived'` candidate's `notes` without unarchiving or modifying immutable `createdAt` -> Rejected by state check & immutability check.
11. **Value Poisoning**: Setting `candidate.notes` to a 10,000-char string or boolean -> Rejected by `isValidCandidate(incoming())`.
12. **Blanket List Query Scraping**: User B queries `/screenings` without `where('ownerId', '==', uid)` -> Rejected by `allow list: if isSignedIn() && resource.data.ownerId == request.auth.uid`.
