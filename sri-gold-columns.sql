-- Sri Gold: percentage, stone weight, gram rate, and extra charge.
-- Run this once on the cloud database (phpMyAdmin / MySQL).
-- If a line says "Duplicate column", that column is already there — continue with the next line.

ALTER TABLE sri.prod_bill_details ADD COLUMN wastage_per DOUBLE(10,3) NOT NULL DEFAULT 0.000;
ALTER TABLE sri.prod_bill_details ADD COLUMN stone_wt DOUBLE(10,3) NOT NULL DEFAULT 0.000;
ALTER TABLE sri.prod_bill_details ADD COLUMN stone_wastage DOUBLE(10,3) NOT NULL DEFAULT 0.000;
ALTER TABLE sri.prod_bill_details ADD COLUMN stone_cost DOUBLE(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE sri.prod_bill_details ADD COLUMN gram_rate DOUBLE(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE sri.prod_bill_details ADD COLUMN charge_type VARCHAR(80) NULL;
ALTER TABLE sri.prod_bill_details ADD COLUMN charge_amt DOUBLE(12,2) NOT NULL DEFAULT 0.00;

ALTER TABLE sri.prod_quotation_details ADD COLUMN wastage_per DOUBLE(10,3) NOT NULL DEFAULT 0.000;
ALTER TABLE sri.prod_quotation_details ADD COLUMN stone_wt DOUBLE(10,3) NOT NULL DEFAULT 0.000;
ALTER TABLE sri.prod_quotation_details ADD COLUMN stone_wastage DOUBLE(10,3) NOT NULL DEFAULT 0.000;
ALTER TABLE sri.prod_quotation_details ADD COLUMN stone_cost DOUBLE(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE sri.prod_quotation_details ADD COLUMN gram_rate DOUBLE(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE sri.prod_quotation_details ADD COLUMN charge_type VARCHAR(80) NULL;
ALTER TABLE sri.prod_quotation_details ADD COLUMN charge_amt DOUBLE(12,2) NOT NULL DEFAULT 0.00;

-- Details notes on each bill / hold line. Run once on cloud.
ALTER TABLE sri.prod_bill_details ADD COLUMN item_details TEXT NULL;
ALTER TABLE sri.prod_quotation_details ADD COLUMN item_details TEXT NULL;
