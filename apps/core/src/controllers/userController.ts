import { Request, Response } from "express";
import { supabase } from "@packages/supabase";

/**
 * Get current user profile information
 */
export const getCurrentUserProfileHandler = async (
  req: Request,
  res: Response
) => {
  try {
    // Get user info from API Gateway headers
    const userId = req.headers["x-gateway-user-id"] as string;
    const userEmail = req.headers["x-gateway-user-email"] as string;

    if (!userId) {
      return res.status(400).json({ error: "User authentication required" });
    }

    // Get additional user details from Supabase auth
    let userProfile = {
      id: userId,
      email: userEmail,
      name: null, // Default if no display name
    };

    try {
      // First try using admin client
      const { data: userData, error: userError } =
        await supabase.auth.admin.getUserById(userId);

      if (!userError && userData?.user) {
        userProfile = {
          id: userData.user.id,
          email: userData.user.email || userEmail,
          name:
            userData.user.user_metadata?.name ||
            userData.user.user_metadata?.full_name ||
            userData.user.user_metadata?.display_name ||
            null,
        };
        console.log(`✅ Successfully fetched profile for ${userId}`);
      } else {
        console.warn(`⚠️ Admin getUserById failed for ${userId}:`, userError);

        // Fallback: Try using RPC function
        try {
          const { data: rpcData, error: rpcError } = await supabase.rpc(
            "get_user_info",
            {
              user_id: userId,
            }
          );

          if (!rpcError && rpcData && !rpcData.error) {
            userProfile = {
              id: rpcData.id,
              email: rpcData.email || userEmail,
              name: rpcData.name,
            };
            console.log(`✅ RPC fallback successful for ${userId}`);
          } else {
            console.warn(
              `⚠️ RPC fallback failed for ${userId}:`,
              rpcError || rpcData.error
            );
          }
        } catch (rpcError) {
          console.warn(`⚠️ RPC exception for ${userId}:`, rpcError);
        }
      }
    } catch (error) {
      console.warn(
        `❌ Complete failure fetching profile for ${userId}:`,
        error
      );
      // Continue with basic profile from headers
    }

    res.status(200).json({
      message: "User profile retrieved successfully",
      user: userProfile,
    });
  } catch (err: any) {
    console.error("Error fetching user profile:", err.message || err);
    res.status(500).json({
      error: "Failed to fetch user profile",
      details: err.message || err,
    });
  }
};
