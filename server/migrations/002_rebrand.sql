-- Rebrand: Little Pioneers Therapy -> Let'z Play Therapy
-- Safe & idempotent: only touches the row if it still holds the old default name.
-- Clinics that already customised their name in Settings are left untouched.

UPDATE clinic_settings
   SET name = 'Let''z Play Therapy',
       updated_at = now()
 WHERE id = 1
   AND name = 'Little Pioneers Therapy';

-- Seed the row if the clinic has none yet.
INSERT INTO clinic_settings (id, name, tagline, address, phone, email, updated_at)
SELECT 1, 'Let''z Play Therapy', 'Pediatric Occupational · Speech · Physiotherapy',
       '24 Wellness Way, Suite 300', '+60 3-2100 4400', 'care@lptclinic.com', now()
WHERE NOT EXISTS (SELECT 1 FROM clinic_settings WHERE id = 1);
