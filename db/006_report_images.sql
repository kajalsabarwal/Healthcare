USE hospital;
CREATE TABLE attachments (
 id INT PRIMARY KEY AUTO_INCREMENT,
 patient_id INT NOT NULL,
 summary_id INT NULL,
 filename VARCHAR(120) NOT NULL,
 mime VARCHAR(30) NOT NULL,
 content_base64 MEDIUMTEXT NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY attachment_history(patient_id,id DESC),
 FOREIGN KEY(patient_id) REFERENCES patients(id),
 FOREIGN KEY(summary_id) REFERENCES discharge_summaries(id)
) ENGINE=InnoDB;
