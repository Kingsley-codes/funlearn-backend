import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
    chatroom: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Chatroom"
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    content: { type: String },
    fileUrl: { type: String },  // If it's an uploaded image/PDF
    fileType: {
        type: String,
        enum: ["image", "pdf", null],
        default: null
    },
    createdAt: { type: Date, default: Date.now }
});

const Message = mongoose.model("Message", messageSchema);
export default Message;
