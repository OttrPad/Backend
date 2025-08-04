import { Router } from 'express';
import {
  createRoomHandler,
  joinRoomHandler,
  leaveRoomHandler,
  deleteRoomHandler
} from '../controllers/room.Controller';

const router = Router();

router.post('/rooms', createRoomHandler);
router.post('/rooms/:id/join', joinRoomHandler);
router.delete('/rooms/:id/leave', leaveRoomHandler);
router.delete('/rooms/:id', deleteRoomHandler);

export default router;
