// controllers/commitTimelineController.ts
import { Request, Response } from 'express';
import { getCommitTimelineService } from '../services/versionControlService'; // Import the service

export const getCommitTimelineController = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;  // Get roomId from request params

    // Ensure roomId is provided
    if (!roomId) {
      return res.status(400).json({ error: "Room ID is required" });
    }

    // Fetch the commit timeline for the room
    const timeline = await getCommitTimelineService(roomId);

    res.status(200).json({ message: "Commit timeline retrieved successfully", timeline });
  } catch (error) {
    console.error(error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Failed to fetch commit timeline', details: errorMessage });
  }
};
