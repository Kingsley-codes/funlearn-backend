import Chatroom from "../models/chatroomModel.js";
import Message from "../models/messageModel.js";
import User from "../models/userModel.js";
import { formatNotificationPayload } from "../utils/formatNotification.js";

const chatSocket = (io) => {
    io.on('connection', (socket) => {
        console.log(`User connected: ${socket.id}`);

        socket.on('joinRoom', (roomId) => {
            socket.join(roomId);
            console.log(`User joined room ${roomId}`);
        });

        socket.on("sendMessage", async (data) => {
            const { chatroomId, senderId, content, fileUrl, fileType } = data;

            const message = await Message.create({
                chatroom: chatroomId,
                sender: senderId,
                content,
                fileUrl,
                fileType,
            });

            // Emit the message to all clients in the chatroom
            io.to(chatroomId).emit('receiveMessage', message);

            // Fetch chatroom & sender details
            const chatroom = await Chatroom.findById(chatroomId).populate("members");
            const sender = await User.findById(senderId);

            // Prepare notification payload
            const payload = formatNotificationPayload({
                sender,
                chatroom,
                content,
                fileType,
            });

            // Send push notification to other members
            for (const member of chatroom.members) {
                if (member._id.toString() !== senderId.toString() && member.subscription) {
                    await sendPushNotification(member.subscription, payload);
                }
            }
        });

        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.id}`);
        });
    });
};

export default chatSocket;
