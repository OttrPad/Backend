import jwt from "jsonwebtoken";
import { supabase } from "@packages/supabase";
import { AuthenticatedUser, RoomAccess } from "../types";

export class AuthService {
  /**
   * Convert room code to room ID
   */
  private async getRoomIdFromCode(roomCode: string): Promise<number | null> {
    try {
      console.log(`🔍 Converting room code ${roomCode} to room ID`);

      const { data, error } = await supabase
        .from("Rooms")
        .select("room_id")
        .eq("room_code", roomCode)
        .single();

      if (error || !data) {
        console.log(`❌ Room not found for code: ${roomCode}`, error?.message);
        return null;
      }

      console.log(`✅ Found room ID: ${data.room_id} for code: ${roomCode}`);
      return data.room_id;
    } catch (error) {
      console.error("❌ Error converting room code to ID:", error);
      return null;
    }
  }

  /**
   * Validate JWT token and extract user information
   */
  async validateToken(token: string): Promise<AuthenticatedUser | null> {
    try {
      // Remove 'Bearer ' prefix if present
      const cleanToken = token.replace("Bearer ", "");
      console.log(`🔐 Validating token (length: ${cleanToken.length})`);

      // Verify the JWT token with Supabase
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(cleanToken);

      console.log(`🔐 Supabase auth result:`, {
        user: user ? { id: user.id, email: user.email } : null,
        error,
      });

      if (error || !user) {
        console.warn("❌ Token validation failed:", error?.message);
        return null;
      }

      const authenticatedUser = {
        userId: user.id,
        email: user.email || "",
        name:
          user.user_metadata?.name ||
          user.user_metadata?.full_name ||
          user.email,
      };

      console.log(
        `✅ Token validated successfully for user:`,
        authenticatedUser
      );
      return authenticatedUser;
    } catch (error) {
      console.error("❌ Token validation error:", error);
      return null;
    }
  }

  /**
   * Check if user has access to a specific room using room code
   */
  async checkRoomAccess(
    userId: string,
    roomCode: string,
    userEmail?: string
  ): Promise<RoomAccess> {
    try {
      console.log(
        `🔍 Checking room access for user ${userId} (${userEmail}) to room ${roomCode}`
      );

      // First, convert room code to room ID
      const roomId = await this.getRoomIdFromCode(roomCode);
      if (!roomId) {
        console.log(`❌ Invalid room code: ${roomCode}`);
        return {
          hasAccess: false,
          role: "viewer",
        };
      }

      // Check if user is in room_users table (actual member)
      console.log(
        `📋 Checking Room_users table for room_id: ${roomId}, uid: ${userId}`
      );
      const { data: roomUser, error: roomUserError } = await supabase
        .from("Room_users")
        .select("type")
        .eq("room_id", roomId)
        .eq("uid", userId)
        .single();

      console.log(`📋 Room_users query result:`, {
        data: roomUser,
        error: roomUserError,
      });

      if (!roomUserError && roomUser) {
        console.log(`✅ User found in Room_users with role: ${roomUser.type}`);
        return {
          hasAccess: true,
          role: roomUser.type as "admin" | "editor" | "viewer",
        };
      }

      // Check if user is the room creator
      console.log(`👤 Checking if user is room creator for room_id: ${roomId}`);
      const { data: room, error: roomError } = await supabase
        .from("Rooms")
        .select("created_by")
        .eq("room_id", roomId)
        .single();

      console.log(`👤 Room creator query result:`, {
        data: room,
        error: roomError,
      });

      if (!roomError && room && room.created_by === userId) {
        console.log(`✅ User is room creator`);
        return {
          hasAccess: true,
          role: "admin",
        };
      }

      // Check if user is in allowed_emails table (invited but not yet joined)
      if (userEmail) {
        console.log(
          `📧 Checking Allowed_emails table for room_id: ${roomId}, email: ${userEmail}`
        );
        const { data: allowedEmail, error: emailError } = await supabase
          .from("Allowed_emails")
          .select("access_level")
          .eq("room_id", roomId)
          .eq("email", userEmail.toLowerCase())
          .single();

        console.log(`📧 Allowed_emails query result:`, {
          data: allowedEmail,
          error: emailError,
        });

        if (!emailError && allowedEmail) {
          console.log(
            `✅ User found in Allowed_emails with access level: ${allowedEmail.access_level}`
          );
          return {
            hasAccess: true,
            role: allowedEmail.access_level as "editor" | "viewer",
          };
        }
      }

      console.log(
        `❌ No access found for user ${userId} to room ${roomCode} (ID: ${roomId})`
      );
      return {
        hasAccess: false,
        role: "viewer",
      };
    } catch (error) {
      console.error("❌ Room access check error:", error);
      return {
        hasAccess: false,
        role: "viewer",
      };
    }
  }
}
