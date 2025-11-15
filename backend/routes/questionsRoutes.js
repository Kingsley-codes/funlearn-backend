import express from "express";
import { addUserToQuestionSet, getAllQuestionSets, getQuestionSet, updateUserScore } from "../controllers/questionsController.js";
import { userAuthenticate } from "../middleware/authenticationMiddleware.js";


const questionsRouter = express.Router();

questionsRouter.get("/", userAuthenticate, getAllQuestionSets);
questionsRouter.get("/:questionSetId", userAuthenticate, getQuestionSet);
questionsRouter.post("/questionSet", userAuthenticate, addUserToQuestionSet);
questionsRouter.patch("/score", userAuthenticate, updateUserScore);

export default questionsRouter;
