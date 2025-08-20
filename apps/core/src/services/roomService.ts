import { supabase } from "@packages/supabase";

// Rooms service
export const createRoom = async (name: string, createdBy?: string) => {
  const roomData: any = { name };

  // Add creator if provided
  if (createdBy) {
    roomData.created_by = createdBy;
  }

  const { data, error } = await supabase
    .from("Rooms")
    .insert([roomData])
    .select()
    .single();

  console.log("createRoom data:", data);
  console.log("createRoom error:", error);

  if (error) throw error;
  return data;
};

export const deleteRoom = async (roomId: string) => {
  const { error } = await supabase.from("Rooms").delete().eq("id", roomId); // or 'room_id' if that is your PK column

  if (error) throw error;
};
export const findRoomByName = async (name: string) => {
  const { data, error } = await supabase
    .from("Rooms")
    .select("*")
    .eq("name", name)
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") throw error; // ignore "no rows found" error
  return data;
};
