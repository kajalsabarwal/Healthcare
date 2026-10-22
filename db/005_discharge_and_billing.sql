-- Apply once to an existing database. Never discards prior summaries or bills.
USE hospital;
ALTER TABLE bills ADD description VARCHAR(300) NOT NULL DEFAULT 'Consultation fee';
CREATE TABLE discharge_summaries (
 id INT PRIMARY KEY AUTO_INCREMENT,
 patient_id INT NOT NULL,
 previous_id INT NULL UNIQUE,
 diagnosis VARCHAR(1000) NOT NULL,
 treatment VARCHAR(2000) NOT NULL,
 discharge_advice VARCHAR(2000) NOT NULL,
 follow_up VARCHAR(1000) NOT NULL,
 discharge_date DATE NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY discharge_history(patient_id,id DESC),
 FOREIGN KEY(patient_id) REFERENCES patients(id),
 FOREIGN KEY(previous_id) REFERENCES discharge_summaries(id)
) ENGINE=InnoDB;
