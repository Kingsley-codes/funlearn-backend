import crypto from "crypto";
import User from "../models/userModel.js";
import Chatroom from "../models/chatroomModel.js";
import { v2 as cloudinary } from "cloudinary";


cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const createChatroom = async (req, res) => {
    const { name } = req.body;
    const userId = req.user;

    if (!userId) {
        return res.status(403).json({
            success: false,
            message: "You are Unauthorized",
        });
    }

    const token = crypto.randomBytes(6).toString("hex");
    const chatroom = await Chatroom.create({
        name,
        creator: userId,
        members: [userId],
        inviteLink: token,
    });

    await User.findByIdAndUpdate(userId, { $push: { chatrooms: chatroom._id } });
    res.json(chatroom);
};



export const joinChatroom = async (req, res) => {
    try {
        const { token } = req.params;
        const userId = req.user;

        if (!userId) {
            return res.status(403).json({
                success: false,
                message: "You are Unauthorized",
            });
        }

        // Find chatroom by invite token
        const chatroom = await Chatroom.findOne({ inviteLink: token });
        if (!chatroom) {
            return res.status(404).json({
                success: false,
                message: "Chatroom not found"
            });
        }

        // Step 1: Existing members before join
        const existingMembers = chatroom.members;

        // If user is already a member, return chatroom
        if (existingMembers.includes(userId)) {
            return res.json({
                success: true,
                chatroom,
                message: "Already in this chatroom"
            });
        }

        // Step 2: Add user to chatroom members
        chatroom.members.addToSet(userId);
        await chatroom.save();

        // Step 3: Add chatroom to user's list
        await User.findByIdAndUpdate(
            userId,
            { $addToSet: { chatrooms: chatroom._id } }
        );

        // Step 4: Add new user to all existing members' friends
        if (existingMembers.length > 0) {
            await User.updateMany(
                { _id: { $in: existingMembers } },
                { $addToSet: { friends: userId } }
            );
        }

        // Step 5: Add all existing members to new user's friends
        await User.findByIdAndUpdate(
            userId,
            { $addToSet: { friends: { $each: existingMembers } } }
        );

        return res.json({
            success: true,
            chatroom,
            message: "Joined chatroom and friendships updated"
        });

    } catch (error) {
        console.error("❌ Join chatroom failed:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Something went wrong"
        });
    }
};



export const getUserChatrooms = async (req, res) => {
    const userId = req.user;
    if (!userId) {
        return res.status(403).json({
            success: false,
            message: "You are Unauthorized",
        });
    }
    const user = await User.findById(userId).populate("chatrooms");
    res.json(user.chatrooms);
};


export const uploadFile = async (req, res) => {
    try {
        const result = await cloudinary.uploader.upload_stream(
            { resource_type: "auto" },
            (error, result) => {
                if (error) return res.status(500).json(error);
                res.json({ url: result.secure_url });
            }
        );
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


export const saveSubscription = async (req, res) => {
    try {
        const userId = req.user; // assuming authentication middleware
        const subscription = req.body;

        await User.findByIdAndUpdate(userId, { subscription });

        res.status(200).json({
            success: true,
            message: "Subscription saved"
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: "Failed to save subscription"
        });
    }
};