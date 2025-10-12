// src/version-control-service/controllers/commitController.ts
import { Request, Response } from "express";
import * as commitService from "../services/commitService";  // Importing commit service

export const createCommitHandler = async (req: Request, res: Response) => {
  try {
    const { roomId, blockId, commitMessage } = req.body;
    const userId = req.headers["x-gateway-user-id"] as string;

    const result = await commitService.createCommit(roomId, blockId, commitMessage, userId);
    
    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to create commit", details: err.message || err });
  }
};

export const deleteCommitHandler = async (req: Request, res: Response) => {
  try {
    const { commitId } = req.params; // Extract commitId from request parameters
    const userId = req.headers["x-gateway-user-id"] as string; // Extract userId from headers

    // Call the service to delete the commit
    await commitService.deleteCommit(commitId, userId);

    // Respond with success message
    res.status(200).json({ message: "Commit deleted successfully" });
  } catch (err: any) {
    // Handle errors and respond with appropriate error message
    res.status(500).json({ error: "Failed to delete commit", details: err.message || err });
  }
};
