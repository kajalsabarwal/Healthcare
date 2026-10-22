# Validation record

## Local checks completed

- Five Node.js test groups passed: authentication/CSRF/origin/input checks, priority and FIFO ordering, full patient-to-record-to-bill workflow, concurrent dispatch conflict, and registration/cancellation/invalid transitions.
- Browser check: administrator login, overview rendering, appointment navigation, emergency dispatch before a normal visit, saving a synthetic medical record, bill creation, visit completion, marking a bill paid, and retrieving patient history.
- Dashboard screenshot captured from the running in-memory demo.

The local machine did not have a usable JDK, MySQL server, or Docker. Local tests therefore used the in-memory repository and JavaScript ordering equivalent. These checks do not establish Java execution or MySQL correctness.

## Automated full-stack checks

The committed GitHub Actions workflow compiles and runs the Java collection tests and starts the real Docker Compose stack for integration checks. It verifies Java-backed emergency selection, MySQL-backed dispatch concurrency, medical history, billing creation, and completion.

**Both jobs passed** in [GitHub Actions run 39812213127](https://github.com/kajalsabarwal/Healthcare/actions/runs/39812213127) on October 22, 2026, for commit `4b1ef21cf19d5a8825138d4a2557848793a60101`. The unit job passed Node.js and Java tests; the full-stack job built and ran Java, Node.js, and MySQL and passed the integration script. Later documentation-only changes do not alter that tested implementation.

No load test, clinical validation, security audit, or measured query-performance comparison has been performed.

## Staff and password recovery update

Nine local test groups pass, including staff name/shift editing and mocked SMS/email recovery. The recovery suite checks wrong/expired approval rejection, short-password rejection, successful reset, one-time replay rejection, old-password rejection, and earlier-session invalidation. The adapter tests inspect channel selection without contacting a delivery provider. Browser checks confirmed the Forgot password screen, disabled delivery when credentials are missing, configured private contact display, staff shift listing, and prefilled name/shift editor.

Actual SMS/email delivery is not configured or tested. No personal recovery contact, private demo data, or provider credentials are included in the repository. The MySQL integration suite now exercises staff seed shifts and staff-name edits as well as patient records.
