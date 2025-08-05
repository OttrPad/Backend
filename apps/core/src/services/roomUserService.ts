import { supabase } from '../supabase/client';

// Room_users service
export const addUserToRoom = async (roomId: string, user_id: string) => {
  const { data, error } = await supabase
    .from('Room_users')
    .insert([{ room_id: roomId, user_id: user_id }])
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const removeUserFromRoom = async (roomId: string, user_id: string) => {
  const { error } = await supabase
    .from('Room_users')
    .delete()
    .match({ room_id: roomId, user_id: user_id });

  if (error) throw error;
};