import express from "express";
import { userAuthenticate } from "../middleware/authenticationMiddleware.js";
import { getUserProfile, updateUserProfile } from "../controllers/userController.js";
import { singleUpload } from "../middleware/uploadMiddleware.js";


const userRouter = express.Router();

userRouter.get("/profile", userAuthenticate, getUserProfile);
userRouter.patch("/profile", userAuthenticate, singleUpload.single("profilePhoto"), updateUserProfile);


export default userRouter;