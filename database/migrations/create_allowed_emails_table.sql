-- Create Allowed_emails table for room access management
-- This table stores email invitations for rooms before users actually join

CREATE TABLE IF NOT EXISTS public.Allowed_emails (
    id BIGSERIAL PRIMARY KEY,
    room_id INTEGER NOT NULL,
    email VARCHAR(255) NOT NULL,
    access_level VARCHAR(20) NOT NULL CHECK (access_level IN ('viewer', 'editor')),
    invited_by VARCHAR(255) NOT NULL,
    invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_id VARCHAR(255) NOT NULL,
    
    -- Foreign key constraint to rooms table
    CONSTRAINT fk_allowed_emails_room 
        FOREIGN KEY (room_id) 
        REFERENCES public.Rooms(room_id) 
        ON DELETE CASCADE,
    
    -- Unique constraint to prevent duplicate invitations for same email/room/user combination
    CONSTRAINT unique_email_room_user 
        UNIQUE (room_id, email, user_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_Allowed_emails_room_id ON public.Allowed_emails(room_id);
CREATE INDEX IF NOT EXISTS idx_Allowed_emails_email ON public.Allowed_emails(email);
CREATE INDEX IF NOT EXISTS idx_Allowed_emails_user_id ON public.Allowed_emails(user_id);

-- Add RLS (Row Level Security) policies if needed
ALTER TABLE public.Allowed_emails ENABLE ROW LEVEL SECURITY;

-- Grant necessary permissions
GRANT ALL ON public.Allowed_emails TO authenticated;
GRANT ALL ON public.Allowed_emails TO service_role;

-- Grant usage on the sequence
GRANT USAGE, SELECT ON SEQUENCE public.Allowed_emails_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.Allowed_emails_id_seq TO service_role;

-- Comments for documentation
COMMENT ON TABLE public.Allowed_emails IS 'Stores email invitations for room access before users join';
COMMENT ON COLUMN public.Allowed_emails.room_id IS 'Reference to the room';
COMMENT ON COLUMN public.Allowed_emails.email IS 'Email address of the invited user';
COMMENT ON COLUMN public.Allowed_emails.access_level IS 'Permission level: viewer or editor';
COMMENT ON COLUMN public.Allowed_emails.invited_by IS 'User ID who sent the invitation';
COMMENT ON COLUMN public.Allowed_emails.invited_at IS 'Timestamp when invitation was sent';
COMMENT ON COLUMN public.Allowed_emails.user_id IS 'Target user ID for the invitation';
