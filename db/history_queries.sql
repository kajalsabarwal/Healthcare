-- Bounded history pagination. Use the last returned record ID as the next cursor.
SELECT id,appointment_id,diagnosis,notes,created_at
FROM medical_records WHERE patient_id=1 AND id<2147483647
ORDER BY id DESC LIMIT 20;
EXPLAIN SELECT id,appointment_id,diagnosis,notes,created_at
FROM medical_records WHERE patient_id=1 AND id<2147483647
ORDER BY id DESC LIMIT 20;
-- queue_lookup bounds doctor/status scans. Sort matches the Java ordering.
SELECT id,priority,created_at FROM appointments
WHERE doctor_id=1 AND status='waiting'
ORDER BY (priority>0) DESC,priority DESC,created_at,id;
-- Report only. Not a benchmark or evidence of measured query-speed improvements.
SELECT d.name,COUNT(a.id) completed_visits
FROM doctors d LEFT JOIN appointments a ON a.doctor_id=d.id AND a.status='completed'
GROUP BY d.id,d.name;
