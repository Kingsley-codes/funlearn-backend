import express from "express";
import {
    generateQuestions,
    getChatHistory,
    getUserConversations,
    handleAIChat
} from "../controllers/aiController.js";
import { userAuthenticate } from "../middleware/authenticationMiddleware.js";


const aiChatRouter = express.Router();

// Define your AI chat routes here

aiChatRouter.post("/chat", userAuthenticate, handleAIChat)
aiChatRouter.post("/questions", userAuthenticate, generateQuestions)
aiChatRouter.get("/chat", userAuthenticate, getUserConversations)
aiChatRouter.get("/chat/:chatId", userAuthenticate, getChatHistory)

export default aiChatRouter;