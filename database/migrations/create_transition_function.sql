-- Create function to atomically transition user from Allowed_emails to room_users
-- This ensures no race conditions when a user joins a room

CREATE OR REPLACE FUNCTION public.transition_user_to_room(
    p_room_id INTEGER,
    p_user_id VARCHAR(255),
    p_user_email VARCHAR(255),
    p_access_level VARCHAR(20)
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSON;
    v_existing_member RECORD;
    v_email_access RECORD;
BEGIN
    -- Check if user is already a member
    SELECT * INTO v_existing_member 
    FROM public.Room_users 
    WHERE room_id = p_room_id AND uid = p_user_id;
    
    IF FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'User is already a member of this room'
        );
    END IF;
    
    -- Check if email access exists
    SELECT * INTO v_email_access 
    FROM public.Allowed_emails 
    WHERE room_id = p_room_id 
      AND email = LOWER(p_user_email) 
      AND user_id = p_user_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Email access not found for this user'
        );
    END IF;
    
    -- Begin atomic operation
    -- 1. Add user to Room_users
    INSERT INTO public.Room_users (room_id, uid, type, joined_at)
    VALUES (p_room_id, p_user_id, p_access_level, NOW());
    
    -- 2. Remove from Allowed_emails
    DELETE FROM public.Allowed_emails 
    WHERE room_id = p_room_id 
      AND email = LOWER(p_user_email) 
      AND user_id = p_user_id;
    
    -- Return success
    RETURN json_build_object(
        'success', true,
        'room_id', p_room_id,
        'user_id', p_user_id,
        'user_type', p_access_level,
        'message', 'User successfully transitioned from invitation to room member'
    );
    
EXCEPTION
    WHEN OTHERS THEN
        -- Return error details
        RETURN json_build_object(
            'success', false,
            'error', 'Database error: ' || SQLERRM
        );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.transition_user_to_room(INTEGER, VARCHAR(255), VARCHAR(255), VARCHAR(20)) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_user_to_room(INTEGER, VARCHAR(255), VARCHAR(255), VARCHAR(20)) TO service_role;

-- Add comment for documentation
COMMENT ON FUNCTION public.transition_user_to_room IS 'Atomically moves a user from Allowed_emails to Room_users when they join a room';
