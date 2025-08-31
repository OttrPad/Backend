// import { supabase } from "@packages/supabase";

// export interface ChatMessage {
//   id: number;
//   room_id: number;
//   user_id: string;
//   user_email: string;
//   content: string;
//   created_at: string;
// }

// export async function addChatMessage(
//   roomId: string,
//   userId: string,
//   userEmail: string,
//   content: string
// ): Promise<ChatMessage> {
//   const trimmed = (content || "").trim();
//   if (!trimmed) throw new Error("Message cannot be empty");

//   const { data, error } = await supabase
//     .from("chat_messages")
//     .insert([
//       {
//         room_id: parseInt(roomId, 10),
//         user_id: userId,
//         user_email: userEmail,
//         content: trimmed,
//       },
//     ])
//     .select("*")
//     .single();

//   if (error) throw error;
//   return data as ChatMessage;
// }

// export async function getRoomChatMessages(
//   roomId: string,
//   limit = 50,
//   before?: string // ISO timestamp cursor
// ): Promise<ChatMessage[]> {
//   let query = supabase
//     .from("chat_messages")
//     .select("*")
//     .eq("room_id", parseInt(roomId, 10))
//     .order("created_at", { ascending: false })
//     .limit(limit);

//   if (before) {
//     query = query.lt("created_at", before);
//   }

//   const { data, error } = await query;
//   if (error) throw error;

//   // Return ascending order in the UI
//   return (data as ChatMessage[]).reverse();
// }


import { supabase } from "@packages/supabase";  // Assuming the @packages/supabase package is correctly set up.
import { supabaseAdmin } from "../lib/supabaseServer";

export interface ChatMessage {
  // id: number;
  // room_id: number;
  // user_id: string;
  // user_email: string;
  // content: string;
  // created_at: string;

  message_id: number;
  room_id: number;
  uid: string;
  message: string;
  created_at: string;
}

// export async function addChatMessage(
//   // roomId: string,
//   // userId: string,
//   // userEmail: string,
//   // content: string
//   roomId: string,
//   uid: string, // user/message uuid
//   message: string
// ): Promise<ChatMessage> {

//   const room = Number.parseInt(roomId, 10);
//   const trimmed = (message ?? "").trim();
//   if (!trimmed) throw new Error("Message cannot be empty");

  
//   console.log("[chatService.addChatMessage] inserting", { room_id: room, uid, messageLen: trimmed.length });
//   const { data, error } = await supabaseAdmin
//     .from("Chat_messages")
//     .insert([{ room_id: room, uid, message: trimmed }])
//     .select("message_id, room_id, uid, message, created_at")
//     .single();

//   console.log("[chatService.addChatMessage] result", { hasData: !!data, hasError: !!error });

//   if (error) throw error;
//   return data as ChatMessage;
// }


export async function addChatMessage(
  roomId: number | string,
  uid: string,
  message: string
): Promise<ChatMessage> {
  const trimmed = (message ?? "").trim();
  if (!trimmed) throw new Error("Message cannot be empty");

  console.log("[chatService.addChatMessage] inserting", { room_id: roomId, uid, messageLen: trimmed.length });

  const { data, error } = await supabaseAdmin
    .from("chat_messages") // make sure this is lowercase unless you quoted it
    .insert([{ room_id: roomId, uid, message: trimmed }])
    .select("message_id, room_id, uid, message, created_at")
    .single();

  if (error) throw error;
  return data as ChatMessage;
}



export async function getRoomChatMessages(
  roomId: string,
  limit = 50,
  before?: string
): Promise<ChatMessage[]> {
  const room = Number.parseInt(roomId, 10);

  let q = supabaseAdmin
    .from("Chat_messages")
    .select("message_id, room_id, uid, message, created_at")
    .eq("room_id", room)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before) q = q.lt("created_at", before);

  const { data, error } = await q;
  if (error) throw error;

  // newest last
  return (data as ChatMessage[]).reverse();
}
