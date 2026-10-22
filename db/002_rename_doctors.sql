-- For an existing database initialized with the original three demo doctors.
-- Run once manually; the Docker init directory only runs on a fresh volume.
USE hospital;
START TRANSACTION;
UPDATE doctors SET name='Dr Komal' WHERE id=1 AND name='Dr. Mira Shah';
UPDATE doctors SET name='Dr Gurdeep Singh' WHERE id=2 AND name='Dr. Arjun Rao';
UPDATE doctors SET name='Dr Balbir' WHERE id=3 AND name='Dr. Leena Das';
COMMIT;
