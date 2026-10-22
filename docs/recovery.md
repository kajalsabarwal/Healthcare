# Private password recovery setup

Keep contact information and credentials in an untracked local `.env`, a separate private env file, or a secret manager. Do not put personal contacts in source code, SQL seed files, README examples, screenshots, or commits.

Configure:

```text
RECOVERY_PHONE=<registered E.164 phone>
RECOVERY_EMAIL=<registered email>
TWILIO_ACCOUNT_SID=<account SID>
TWILIO_AUTH_TOKEN=<auth token>
TWILIO_VERIFY_SERVICE_SID=<Verify service SID>
```

Create a Twilio Verify service and enable the intended delivery channels. For email, configure the service's email integration as described in [Twilio Verify](https://www.twilio.com/docs/verify/api/verification). Supplying a Gmail address sets the recovery recipient; it does not grant the app access to Gmail or configure an email sender.

The service sends codes using [Verifications](https://www.twilio.com/docs/verify/api/verification) and validates them through [Verification Check](https://www.twilio.com/docs/verify/api/verification-check). The app never stores or returns the OTP. Expiration, provider attempt limits, and one-time approval are delegated to Verify. The app also limits code requests and reset attempts per address and per account window.

The recovery screen displays the configured phone because the owner requested it. This makes the number visible to anyone who can access that login page. Avoid exposing this local demo publicly with personal recovery configuration. The configured email is masked in the page display. The API does not accept arbitrary delivery destinations; it sends only to exact configured contacts.

Successful password changes use a fresh scrypt salt and are saved in MySQL `admin_credentials`. The environment administrator password is only a bootstrap fallback when no saved credential exists. Password changes rotate a credential version, making earlier session cookies invalid. Existing SSE streams are closed by the resetting process. In multiple API replicas, other open SSE streams receive invalidation only after their next authenticated request; a shared session/event mechanism is required for stronger guarantees.

For existing databases, apply `db/004_staff_and_recovery.sql` once before starting this app version. New databases are already initialized with that table. Never reset a real credential by deleting data just to reuse the bootstrap password.

No provider token or account is configured in the public project. Real SMS/email delivery has not been exercised. Unit tests inject a fake provider to verify wrong-code rejection, successful reset, replay rejection, old-password rejection, session invalidation, and channel selection.
