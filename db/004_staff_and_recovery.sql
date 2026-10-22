-- Apply once on an existing database before running the new app version.
USE hospital;
CREATE TABLE staff (
 id INT PRIMARY KEY AUTO_INCREMENT,
 name VARCHAR(100) NOT NULL,
 morning_shift BOOLEAN NOT NULL DEFAULT FALSE,
 night_shift BOOLEAN NOT NULL DEFAULT FALSE,
 CHECK(morning_shift OR night_shift)
) ENGINE=InnoDB;
INSERT INTO staff(name,morning_shift,night_shift) VALUES
 ('Harmeet',TRUE,FALSE),('Vansh',TRUE,TRUE),('Milli',TRUE,FALSE);
CREATE TABLE admin_credentials (
 username VARCHAR(100) PRIMARY KEY,
 password_hash CHAR(128) NOT NULL,
 salt VARCHAR(64) NOT NULL,
 version VARCHAR(64) NOT NULL
) ENGINE=InnoDB;
