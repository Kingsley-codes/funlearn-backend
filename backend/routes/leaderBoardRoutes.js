import express from "express";
import { userAuthenticate } from "../middleware/authenticationMiddleware.js";
import { getLeaderboard, getFriendsLeaderboard } from "../controllers/leaderBoardController.js";

const leaderBoardRouter = express.Router();

leaderBoardRouter.get("/", getLeaderboard);
leaderBoardRouter.get("/friends", userAuthenticate, getFriendsLeaderboard);

export default leaderBoardRouter; 