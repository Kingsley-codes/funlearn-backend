import express from "express";
import {
    registerUser,
    login,
    requestPasswordReset,
    verifyResetCode,
    resetPassword,
    resendResetCode,
    getCurrentUser,
} from "../controllers/userAuthController.js";
import { userAuthenticate } from "../middleware/authenticationMiddleware.js";

const userAuthRouter = express.Router();

// User Registration routes
userAuthRouter.post("/register", registerUser); // Step 2: Register user with form data

// User Login route
userAuthRouter.post("/login", login);
userAuthRouter.get("/me", userAuthenticate, getCurrentUser);


// Password reset routes
userAuthRouter.post('/forgot-password', requestPasswordReset); // Stage 1

userAuthRouter.post('/verify-reset-code', verifyResetCode);   // Stage 2

userAuthRouter.post('/reset-password', resetPassword);        // Stage 3

userAuthRouter.post('/resend-reset-code', resendResetCode);   // Resend code


export default userAuthRouter;
