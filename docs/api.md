# REST API

JSON requests and responses. IDs are positive integers. Write requests require `Content-Type: application/json`. After login, send the returned `hospital_session` cookie and the returned CSRF value in `X-CSRF-Token` on writes. The browser handles these automatically. All resource routes require administrator authentication.

| Method | Path | Body / behavior |
| --- | --- | --- |
| GET | `/api/health` | Storage/scheduler mode, no patient details |
| POST | `/api/login` | `{ "username":"admin", "password":"your-local-password" }` |
| GET | `/api/session` | Current user, CSRF token, mode |
| POST | `/api/logout` | `{}`; clears browser cookie |
| GET | `/api/state` | Newest 1,000 patients/doctors/appointments/bills, computed doctor availability |
| GET | `/api/events` | Authenticated SSE invalidations, no medical contents |
| GET | `/api/patients` | Patient collection, max 1,000 |
| POST | `/api/patients` | `{ "name":"Demo", "dob":"2000-01-01", "phone":"0000000000" }` |
| GET | `/api/patients/:id/history?before=123&limit=20` | Descending record-ID cursor, max page size 100 |
| GET | `/api/doctors` | Doctor collection, max 1,000 |
| POST | `/api/doctors` | `{ "name":"Dr. Demo", "specialty":"General medicine" }` |
| PATCH | `/api/doctors/:id/duty` | `{ "on_duty":false }`; blocked during an active visit |
| POST | `/api/doctors/:id/next` | `{}`; atomic queue selection/start |
| GET | `/api/appointments` | Appointment collection, max 1,000 |
| POST | `/api/appointments` | `{ "patient_id":4, "doctor_id":3, "priority":0, "reason":"Demo" }` |
| POST | `/api/appointments/:id/complete` | `{}`; only from in_progress |
| POST | `/api/appointments/:id/cancel` | `{}`; only from waiting |
| POST | `/api/records` | `{ "appointment_id":2, "diagnosis":"Synthetic review", "notes":"Demo" }` |
| GET | `/api/bills` | Bill collection, max 1,000 |
| POST | `/api/bills` | `{ "appointment_id":2, "amount_paise":50000 }`; ₹500.00 |
| POST | `/api/bills/:id/paid` | `{}`; idempotent paid status, no funds transferred |

Responses use 201 for creation, 200 for reads/transitions, 400 for invalid input, 401 for missing/invalid login, 403 for CSRF/origin rejection, 404 for missing resources, 409 for workflow conflicts, 413 for oversized requests, 415 for wrong content type, 429 for login throttling, and 503 for unavailable/invalid Java responses. Errors have `{ "error":"message" }`.

Patients and doctors are registered rather than deleted, preserving referenced visit data. Visit records and bills are append-only with one of each per appointment. No arbitrary appointment status edits are exposed.

The internal Java service exposes `GET /health`, `POST /next`, and `POST /availability`. It uses tab-delimited primitive snapshots, not public patient APIs, and is not published to the host. Keep it on the private service network.
