# Architecture and implementation decisions

## Scheduling

The Java service builds an `ArrayDeque` of normal visits sorted by arrival time and ID and a `PriorityQueue` of emergencies ordered by descending staff-set priority, then arrival time, then ID. Emergency selection precedes normal FIFO selection. Calling next does not interrupt an active visit.

Queue `offer`/`poll` are O(1) for the normal deque. Emergency queue insertion/removal is O(log n). The snapshot sort and queue reconstruction make the overall request O(n log n) in the worst case. Claims about high throughput would require benchmarking; none has been performed.

Doctor availability is computed from `on_duty && no active consultation`. The Java `/availability` handler replaces its synchronized HashMap with the latest database-derived snapshot and performs average O(1) per-doctor lookup. `/next` receives availability again inside the database transaction and refreshes that doctor's entry. The cache is not authoritative and survives neither restart nor node replacement; rebuilding makes this safe.

## Persistence and concurrency

Every doctor workflow takes a doctor-row lock before mutating that doctor's queue/visits. An in-progress-only generated key prevents two active appointments for one doctor even if an application bug bypasses dispatch. Another generated key prevents a patient from being simultaneously queued or active more than once, including across doctors.

Appointments are durable, while Java only sees IDs, priorities, and timestamps. A scheduler timeout causes rollback, preserving the waiting queue. Other doctors can proceed independently. The demo store serializes transactions globally and restores a snapshot on error to model rollback; it is not a database substitute.

## Patient history

`medical_records(patient_id, id DESC)` supports a bounded lookup by patient and older-than cursor. This avoids loading every patient's notes and avoids OFFSET cost for deep history. The SQL file includes EXPLAIN so index selection can be checked with representative data. No latency improvement is asserted without a baseline and measurement.

## Live availability

After successful mutations, the Node.js process emits an SSE `refresh` event. The authenticated browser refetches the dashboard and the Java availability snapshot. Reconnection triggers another refresh; heartbeats keep the stream alive. Each stream expires with its eight-hour session. There is no cross-replica event bus, and concurrent read queries may briefly observe different commits; subsequent refresh reconciles the view. A future scaled deployment should add shared invalidation and consistent read snapshots.

## Security boundary

One administrator role is implemented. Cookie payloads are HMAC-signed and expire, the cookie is HttpOnly and SameSite Strict, and writes validate CSRF and Origin. SQL values use parameters and table/column names are closed lists. HTML interpolation escapes user strings. Login throttling is in-memory per remote address. Logout clears the local cookie but does not revoke previously copied cookies; production requires server-side sessions/revocation. This educational baseline does not provide a clinical or regulatory security guarantee.

## Documentation references

- [Java PriorityQueue API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/PriorityQueue.html)
- [Java ArrayDeque API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/ArrayDeque.html)
- [Java HashMap API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/HashMap.html)
- [MySQL locking reads](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html)
