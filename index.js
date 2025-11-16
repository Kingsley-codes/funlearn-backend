import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import 'dotenv/config';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import chatSocket from './backend/socket/chatSocket.js';
import userAuthRouter from './backend/routes/userAuthRoutes.js';
import aiChatRouter from './backend/routes/aiChatRoutes.js';
import chatroomRouter from './backend/routes/chatroomRoutes.js';
import { initPinecone } from './backend/scripts/initPinecone.js';
import questionsRouter from './backend/routes/questionsRoutes.js';
import leaderBoardRouter from './backend/routes/leaderBoardRoutes.js';
import userRouter from './backend/routes/userRoutes.js';
import cron from "node-cron";
import axios from "axios";
import { scheduleWeeklyReset } from './backend/controllers/leaderBoardController.js';


dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL,
        credentials: true,
    },
});

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

scheduleWeeklyReset();


const apis = [
    "https://help-a-child-africa.onrender.com",
    "https://drivenest-se33.onrender.com",
    "https://forever-backend-w1tn.onrender.com",
    "https://blog-backend-dav9.onrender.com"
];

let nextRunInMinutes = getRandomMinutes();
let counter = 0;

function getRandomMinutes() {
    return Math.floor(Math.random() * (14 - 10 + 1)) + 10; // 10–14
}

async function callApis() {
    try {
        console.log("⏳ Calling APIs...");

        for (const url of apis) {
            try {
                const res = await axios.get(url);
                console.log(`✓ ${url} =>`, res.status);
            } catch (err) {
                console.log(`✗ ${url} failed`, err.message);
            }
        }

    } catch (err) {
        console.error("Main error:", err);
    }
}

// Runs every 1 minute
cron.schedule("* * * * *", async () => {
    counter++;

    if (counter >= nextRunInMinutes) {
        await callApis();
        counter = 0;
        nextRunInMinutes = getRandomMinutes();
        console.log("Next run in:", nextRunInMinutes, "minutes");
    }
});


// Use separate file for socket events
chatSocket(io);

// Initialize Pinecone when server starts
initPinecone().then(() => {
    console.log('Pinecone initialization completed');
});

// ✅ Middlewares (before routes)
app.use(cors({
    origin: [
        process.env.FRONTEND_URL,
        "http://localhost:3000"
    ],
    credentials: true
}));
app.use(express.json({ limit: '10mb' })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded form data


// ✅ MongoDB Connection
try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB Connected");
} catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
    process.exit(1);
}

// Basic route for testing
app.get('/', (req, res) => {
    res.json({
        status: "success",
        message: "Welcome to StudySync API"
    });
});

// Routes
app.use('/api/auth', userAuthRouter);
app.use('/api/ai', aiChatRouter);
app.use('/api/questions', questionsRouter);
app.use('/api/chatroom', chatroomRouter);
app.use('/api/leaderboard', leaderBoardRouter);
app.use('/api/users', userRouter);


// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        status: "error",
        message: "Internal server error"
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
