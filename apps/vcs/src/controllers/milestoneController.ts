// src/version-control-service/controllers/milestoneController.ts
import { Request, Response } from "express";
import * as milestoneService from "../services/milestoneService"; // Importing milestone service
import { log } from "@ottrpad/logger";

export const createMilestoneHandler = async (req: Request, res: Response) => {
  try {
    const { roomId, milestoneName, milestoneNotes, commitId } = req.body as {
      roomId: string;
      milestoneName: string;
      milestoneNotes?: string;
      commitId?: string;
    };
    const userId = req.headers["x-gateway-user-id"] as string;
    const userEmail = req.headers["x-gateway-user-email"] as string | undefined;

    // Call the createMilestone service
    const result = await milestoneService.createMilestone(
      roomId,
      milestoneName,
      milestoneNotes || "",
      userId,
      commitId,
      userEmail
    );

    res.status(201).json(result); // Return the milestone creation result
  } catch (err: any) {
    log.error("vcs.milestone.create_error", { error: err });
    res
      .status(500)
      .json({
        error: "Failed to create milestone",
        details: err.message || err,
      });
  }
};

export const deleteMilestoneHandler = async (req: Request, res: Response) => {
  try {
    const { milestoneId } = req.params; // Extract milestoneId from request parameters
    const userId = req.headers["x-gateway-user-id"] as string; // Extract userId from headers

    // Call the service to delete the milestone
    await milestoneService.deleteMilestone(milestoneId, userId);

    // Respond with success message
    res.status(200).json({ message: "Milestone deleted successfully" });
  } catch (err: any) {
    log.error("vcs.milestone.delete_error", { error: err });
    res
      .status(500)
      .json({
        error: "Failed to delete milestone",
        details: err.message || err,
      });
  }
};

export const getMilestonesHandler = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params; // Get roomId from request params

    // Ensure roomId is provided
    if (!roomId) {
      return res.status(400).json({ error: "Room ID is required" });
    }

    // Fetch milestones for the room
    const result = await milestoneService.getMilestones(roomId);

    res.status(200).json(result); // Return the fetched milestones
  } catch (err: any) {
    log.error("vcs.milestone.list_error", { error: err });
    res
      .status(500)
      .json({
        error: "Failed to fetch milestones",
        details: err.message || err,
      });
  }
};
