# Validation record

## Local checks completed

- Five Node.js test groups passed: authentication/CSRF/origin/input checks, priority and FIFO ordering, full patient-to-record-to-bill workflow, concurrent dispatch conflict, and registration/cancellation/invalid transitions.
- Browser check: administrator login, overview rendering, appointment navigation, emergency dispatch before a normal visit, and saving a synthetic medical record.
- Dashboard screenshot captured from the running in-memory demo.

The local machine did not have a usable JDK, MySQL server, or Docker. Local tests therefore used the in-memory repository and JavaScript ordering equivalent. These checks do not establish Java execution or MySQL correctness.

## Automated full-stack checks

The committed GitHub Actions workflow compiles and runs the Java collection tests and starts the real Docker Compose stack for integration checks. It verifies Java-backed emergency selection, MySQL-backed dispatch concurrency, medical history, billing creation, and completion. Consult the repository Actions page for the actual run result; inclusion of a workflow is not itself a passing result.

No load test, clinical validation, security audit, or measured query-performance comparison has been performed.
