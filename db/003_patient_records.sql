-- Apply once to existing databases before starting the updated application.
-- Existing diagnoses and notes are retained; no recovery is inferred.
USE hospital;
ALTER TABLE medical_records
 MODIFY appointment_id INT NULL,
 ADD treatment VARCHAR(2000) NOT NULL DEFAULT '',
 ADD recovery_status ENUM('under_treatment','recovering','recovered','follow_up') NOT NULL DEFAULT 'under_treatment';
