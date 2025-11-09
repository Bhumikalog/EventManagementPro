-- Seed example resources
INSERT INTO resources (id, name, type, location, capacity, status, allocated_to, created_at) VALUES
  (gen_random_uuid(), 'Catering Service', 'Service', 'External', 500, 'available', NULL, now()),
  (gen_random_uuid(), 'Conference Hall A', 'Venue', 'Building 1, Floor 2', 200, 'available', NULL, now()),
  (gen_random_uuid(), 'Conference Hall B', 'Venue', 'Building 2, Floor 1', 150, 'available', NULL, now()),
  (gen_random_uuid(), 'Laptop Set (10 units)', 'Equipment', 'IT Department', 10, 'available', NULL, now()),
  (gen_random_uuid(), 'Meeting Room 101', 'Venue', 'Building 1, Floor 1', 20, 'available', NULL, now()),
  (gen_random_uuid(), 'Outdoor Stage', 'Venue', 'Campus Grounds', 1000, 'available', NULL, now()),
  (gen_random_uuid(), 'Projector System', 'Equipment', 'AV Department', 1, 'available', NULL, now()),
  (gen_random_uuid(), 'Small meeting room', 'room', 'HR Department', 5, 'available', NULL, now()),
  (gen_random_uuid(), 'Sound System', 'Equipment', 'AV Department', 1, 'available', NULL, now());
