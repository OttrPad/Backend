-- Debug script to check Room_users and authorization
-- Replace 'YOUR_ROOM_ID' and 'YOUR_USER_ID' with actual values from the error logs

-- Check what's in Room_users table for a specific room
SELECT 
  room_id,
  uid,
  type,
  joined_at
FROM public.Room_users
WHERE room_id = 1  -- Replace with your actual room_id
ORDER BY joined_at DESC;

-- Check what's in Allowed_emails table for a specific room
SELECT 
  room_id,
  email,
  access_level,
  invited_at
FROM public.Allowed_emails
WHERE room_id = 1  -- Replace with your actual room_id
ORDER BY invited_at DESC;

-- Check the Rooms table to see who created the room
SELECT 
  room_id,
  name,
  created_by,
  room_code,
  created_at
FROM public.Rooms
WHERE room_id = 1  -- Replace with your actual room_id;

-- Check if a specific user exists in auth.users
-- SELECT id, email FROM auth.users WHERE id = 'YOUR_USER_ID';
