# Security Specification for ForgeXplain Firestore Rules

## 1. Data Invariants
1. A prediction record cannot exist without an authenticated examiner `userId` that strictly matches `request.auth.uid`.
2. User profile records can only be created by the authenticated owner where `userId == request.auth.uid`.
3. Ordinary users cannot escalate their privileges or assign themselves the `admin` role upon creation or update. The admin role is restricted to bootstrapped runtime admin `naliniraju774@gmail.com` or verified admins in `/admins/`.
4. Prediction records are tamper-evident audit logs: once created, prediction outcomes and confidence scores are immutable.
5. All document IDs must conform to alphanumeric formatting (`^[a-zA-Z0-9_\-]+$`) and adhere to length bounds (&le; 128 characters).
6. List queries on predictions must enforce that unprivileged users can only query their own predictions (`resource.data.userId == request.auth.uid`).

## 2. The Dirty Dozen Payloads (Designed to break Identity, Integrity, and State)
1. **Ghost Field Injection**: User profile create with unauthorized `isAdmin: true` ghost field.
2. **Identity Spoofing**: Prediction creation with `userId: "victim-uid"` while logged in as attacker.
3. **Privilege Escalation**: User profile update attempting to modify `role: "admin"`.
4. **Denial-of-Wallet ID Poisoning**: Document creation with a 2KB junk string as the document ID.
5. **Prediction Outcome Tampering**: Updating an existing prediction's `prediction: "Genuine"` to forged.
6. **Confidence Injection**: Setting confidence score > 100 or negative.
7. **Cross-Tenant List Scraping**: Querying `/predictions` without `where('userId', '==', auth.uid)`.
8. **Unauthenticated Read**: Attempting to read `/predictions/{predictionId}` anonymously.
9. **Unauthenticated Signer Deletion**: Deleting registered signers without authentication.
10. **Shadow Key in Signer Card**: Registering a signer with arbitrary extra executable properties.
11. **Spoofed Email Admin Claim**: Attempting admin operations with an unverified email.
12. **Orphaned User Profile Deletion**: Deleting another user's profile as a non-admin.

## 3. Test Runner Specification
All 12 malicious payloads must be rejected with `PERMISSION_DENIED`.
