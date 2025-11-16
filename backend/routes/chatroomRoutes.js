import express from "express";
import {
    createChatroom,
    joinChatroom,
    getUserChatrooms,
    uploadFile,
    saveSubscription,
    getRoomMessages,
    getLatestMessages,
    exitChatroom
} from "../controllers/chatroomController.js";
import { userAuthenticate } from "../middleware/authenticationMiddleware.js";
import { upload } from "../middleware/uploadMiddleware.js";

const chatroomRouter = express.Router();

chatroomRouter.post("/", userAuthenticate, createChatroom);
chatroomRouter.post("/join/:token", userAuthenticate, joinChatroom);
chatroomRouter.get("/", userAuthenticate, getUserChatrooms);
chatroomRouter.post("/upload", userAuthenticate, upload.single("file"), uploadFile);
chatroomRouter.post("/subscribe", userAuthenticate, saveSubscription);
chatroomRouter.get("/messages/:roomId", userAuthenticate, getRoomMessages);
chatroomRouter.get("/messages/:roomId/latest", userAuthenticate, getLatestMessages);
chatroomRouter.post("/exit", userAuthenticate, exitChatroom);



export default chatroomRouter;
