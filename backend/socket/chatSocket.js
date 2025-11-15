import Chatroom from "../models/chatroomModel.js";
import Message from "../models/messageModel.js";
import User from "../models/userModel.js";
import { formatNotificationPayload } from "../utils/formatNotification.js";
import { sendPushNotification } from "../utils/webpush.js";

const chatSocket = (io) => {
    io.on('connection', (socket) => {
        console.log(`User connected: ${socket.id}`);

        socket.on('joinRoom', (roomId) => {
            socket.join(roomId);
            console.log(`User joined room ${roomId}`);
        });

        socket.on('leaveRoom', (roomId) => {
            socket.leave(roomId);
            console.log(`User ${socket.id} left room ${roomId}`);
        });

        socket.on("sendMessage", async (data) => {
            try {
                // Extract tempId sent by the client
                const { tempId, chatroomId, senderId, content, fileUrl, fileType } = data;

                // Save the real message to DB
                const message = await Message.create({
                    chatroom: chatroomId,
                    sender: senderId,
                    content,
                    fileUrl,
                    fileType,
                });

                // Populate sender info
                const populatedMessage = await Message.findById(message._id)
                    .populate('sender', 'userName profilePhoto')
                    .exec();

                // Attach tempId so frontend can replace the temporary message
                const messageToEmit = {
                    ...populatedMessage.toObject(),
                    tempId, // <-- added here
                };

                // Emit the final “confirmed” message to everyone in the room
                io.to(chatroomId).emit('receiveMessage', messageToEmit);

                // Fetch chatroom & sender for notification
                const chatroom = await Chatroom.findById(chatroomId).populate("members");
                const sender = await User.findById(senderId);

                const payload = formatNotificationPayload({
                    sender,
                    chatroom,
                    content,
                    fileType,
                });

                // Send push notifications to all other members
                for (const member of chatroom.members) {
                    if (member._id.toString() !== senderId.toString() && member.subscription) {
                        await sendPushNotification(member.subscription, payload);
                    }
                }
            } catch (error) {
                console.error('Error sending message:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.id}`);
        });
    });
};

export default chatSocket;
