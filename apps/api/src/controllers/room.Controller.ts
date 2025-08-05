import { Request, Response } from 'express';
import { createRoom, deleteRoom, findRoomByName } from '@core/services/roomService';
import { addUserToRoom, removeUserFromRoom } from '@core/services/roomUserService';


export const createRoomHandler = async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Room name is required' });
    // Check if room already exists
    const existingRoom = await findRoomByName(name);
    if (existingRoom) {
      return res.status(400).json({ error: 'Room with this name already exists' });
    }
    const room = await createRoom(name);
    res.status(201).json({ message: 'Room created successfully', room });
  } catch (err: any) {
    console.error('Error creating room:', err.message || err);
    res.status(500).json({ error: 'Failed to create room', details: err.message || err });
  }
};

export const joinRoomHandler = async (req: Request, res: Response) => {
  try {
    const { id: roomId } = req.params;
    const { user_id } = req.body;

    if (!roomId || !user_id)
      return res.status(400).json({ error: 'roomId and user_id are required' });

    await addUserToRoom(roomId, user_id);
    res.status(200).json({ message: 'User added to room' });
  } catch (err: any) {
    console.error('Error joining room:', err.message || err);
    res.status(500).json({ error: 'Failed to join room', details: err.message || err });
  }
};

export const leaveRoomHandler = async (req: Request, res: Response) => {
  try {
    const { id: roomId } = req.params;
    const { user_id } = req.body;

    if (!roomId || !user_id)
      return res.status(400).json({ error: 'roomId and user_id are required' });

    await removeUserFromRoom(roomId, user_id);
    res.status(200).json({ message: 'User removed from room' });
  } catch (err: any) {
    console.error('Error leaving room:', err.message || err);
    res.status(500).json({ error: 'Failed to leave room', details: err.message || err });
  }
};

export const deleteRoomHandler = async (req: Request, res: Response) => {
  try {
    const { id: roomId } = req.params;
    if (!roomId) return res.status(400).json({ error: 'roomId is required' });

    await deleteRoom(roomId);
    res.status(200).json({ message: 'Room deleted successfully' });
  } catch (err: any) {
    console.error('Error deleting room:', err.message || err);
    res.status(500).json({ error: 'Failed to delete room', details: err.message || err });
  }
};