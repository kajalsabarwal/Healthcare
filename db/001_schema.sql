USE hospital;
CREATE TABLE patients (
 id INT PRIMARY KEY AUTO_INCREMENT,
 name VARCHAR(100) NOT NULL,
 dob DATE NOT NULL,
 phone VARCHAR(20) NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
CREATE TABLE doctors (
 id INT PRIMARY KEY AUTO_INCREMENT,
 name VARCHAR(100) NOT NULL,
 specialty VARCHAR(80) NOT NULL,
 on_duty BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;
CREATE TABLE appointments (
 id INT PRIMARY KEY AUTO_INCREMENT,
 patient_id INT NOT NULL,
 doctor_id INT NOT NULL,
 priority TINYINT NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 3),
 reason VARCHAR(300) NOT NULL,
 status ENUM('waiting','in_progress','completed','cancelled') NOT NULL DEFAULT 'waiting',
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 completed_at TIMESTAMP(3) NULL,
 active_doctor INT GENERATED ALWAYS AS (CASE WHEN status='in_progress' THEN doctor_id ELSE NULL END) STORED,
 open_patient INT GENERATED ALWAYS AS (CASE WHEN status IN ('waiting','in_progress') THEN patient_id ELSE NULL END) STORED,
 UNIQUE KEY one_active_per_doctor(active_doctor),
 UNIQUE KEY one_open_per_patient(open_patient),
 KEY queue_lookup(doctor_id,status,priority,created_at,id),
 KEY patient_history(patient_id,created_at DESC,id DESC),
 FOREIGN KEY(patient_id) REFERENCES patients(id),
 FOREIGN KEY(doctor_id) REFERENCES doctors(id)
) ENGINE=InnoDB;
CREATE TABLE medical_records (
 id INT PRIMARY KEY AUTO_INCREMENT,
 appointment_id INT NULL,
 patient_id INT NOT NULL,
 diagnosis VARCHAR(1000) NOT NULL,
 treatment VARCHAR(2000) NOT NULL DEFAULT '',
 recovery_status ENUM('under_treatment','recovering','recovered','follow_up') NOT NULL DEFAULT 'under_treatment',
 notes VARCHAR(2000) NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY one_record_per_visit(appointment_id),
 KEY record_history(patient_id,id DESC),
 FOREIGN KEY(appointment_id) REFERENCES appointments(id),
 FOREIGN KEY(patient_id) REFERENCES patients(id)
) ENGINE=InnoDB;
CREATE TABLE bills (
 id INT PRIMARY KEY AUTO_INCREMENT,
 appointment_id INT NOT NULL UNIQUE,
 patient_id INT NOT NULL,
 amount_paise INT NOT NULL CHECK(amount_paise>0),
 status ENUM('unpaid','paid') NOT NULL DEFAULT 'unpaid',
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 paid_at TIMESTAMP(3) NULL,
 KEY bill_history(patient_id,id DESC),
 FOREIGN KEY(appointment_id) REFERENCES appointments(id),
 FOREIGN KEY(patient_id) REFERENCES patients(id)
) ENGINE=InnoDB;
INSERT INTO doctors(name,specialty) VALUES
 ('Dr Komal','General medicine'),('Dr Gurdeep Singh','Cardiology'),('Dr Balbir','Pediatrics');
INSERT INTO patients(name,dob,phone) VALUES
 ('Aarav Demo','1997-05-14','0000000001'),('Isha Demo','1985-09-03','0000000002'),
 ('Rohan Demo','2001-02-18','0000000003'),('Anaya Demo','2016-11-22','0000000004');
INSERT INTO appointments(patient_id,doctor_id,priority,reason) VALUES
 (1,1,0,'Routine follow-up'),(2,1,2,'Staff-assigned urgent review'),(3,2,0,'Scheduled follow-up');
