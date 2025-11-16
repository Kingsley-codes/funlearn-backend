import crypto from "crypto";
import User from "../models/userModel.js";
import Chatroom from "../models/chatroomModel.js";
import Message from "../models/messageModel.js";
import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";


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


export const exitChatroom = async (req, res) => {
    try {
        const { roomId } = req.body;
        const userId = req.user;
        if (!userId) {
            return res.status(403).json({
                success: false,
                message: "You are Unauthorized",
            });
        }
        // Remove user from chatroom members
        await Chatroom.findByIdAndUpdate(roomId, { $pull: { members: userId } });

        // Remove chatroom from user's list
        await User.findByIdAndUpdate(userId, { $pull: { chatrooms: roomId } });

        res.json({ success: true, message: "Exited chatroom successfully" });
    } catch (error) {
        console.error("❌ Exit chatroom failed:", error);
        res.status(500).json({ success: false, message: error.message || "Something went wrong" });
    }
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
        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded" });
        }

        const uploadStream = cloudinary.uploader.upload_stream(
            { resource_type: "auto" },
            (error, result) => {
                if (error) {
                    console.error("Cloudinary upload error:", error);
                    return res.status(500).json({ message: "Upload failed" });
                }

                return res.status(200).json({
                    url: result.secure_url,
                    public_id: result.public_id,
                });
            }
        );

        // Convert buffer to stream and pipe into Cloudinary upload stream
        streamifier.createReadStream(req.file.buffer).pipe(uploadStream);

    } catch (error) {
        console.error("Server error:", error);
        return res.status(500).json({ message: error.message });
    }
};



export const saveSubscription = async (req, res) => {
    try {
        const userId = req.user; // assuming authentication middleware
        const subscription = req.body;

        if (!subscription) {
            return res.status(400).json({
                success: false,
                message: "Subscription is required"
            });
        }

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



// Get all messages for a specific chatroom
export const getRoomMessages = async (req, res) => {
    try {
        const { roomId } = req.params;

        // Check if the chatroom exists
        const chatroom = await Chatroom.findById(roomId);
        if (!chatroom) {
            return res.status(404).json({
                success: false,
                message: "Chatroom not found"
            });
        }

        // Check if user is a member of the chatroom
        if (!chatroom.members.includes(req.user._id)) {
            return res.status(403).json({
                success: false,
                message: "Access denied. You are not a member of this chatroom"
            });
        }

        // Fetch messages for the room, populated with sender info
        const messages = await Message.find({ chatroom: roomId })
            .populate('sender', 'userName profilePhoto')
            .sort({ createdAt: 1 })
            .exec();

        // Transform profilePhoto to avatar for frontend compatibility
        const transformedMessages = messages.map(message => ({
            ...message.toObject(),
            sender: {
                ...message.sender.toObject(),
                avatar: message.sender.profilePhoto // Rename here
            }
        }));

        res.status(200).json({
            success: true,
            messages: transformedMessages
        });
    } catch (error) {
        console.error("Get room messages error:", error);
        res.status(500).json({
            success: false,
            message: "Server error while fetching messages"
        });
    }
};


// Get latest messages (for preview)
export const getLatestMessages = async (req, res) => {
    try {
        const { roomId } = req.params;
        const limit = parseInt(req.query.limit) || 10;

        // Check if the chatroom exists
        const chatroom = await Chatroom.findById(roomId);
        if (!chatroom) {
            return res.status(404).json({
                success: false,
                message: "Chatroom not found"
            });
        }

        // Check if user is a member of the chatroom
        if (!chatroom.members.includes(req.user._id)) {
            return res.status(403).json({
                success: false,
                message: "Access denied. You are not a member of this chatroom"
            });
        }

        // Fetch latest messages
        const messages = await Message.find({ chatroom: roomId })
            .populate('sender', 'userName profilePhoto')
            .sort({ createdAt: -1 })
            .limit(limit)
            .exec();

        res.status(200).json({
            success: true,
            messages: messages.reverse() // Reverse to get chronological order
        });
    } catch (error) {
        console.error("Get latest messages error:", error);
        res.status(500).json({
            success: false,
            message: "Server error while fetching latest messages"
        });
    }
};