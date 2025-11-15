import mongoose from "mongoose";

const chatroomSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    creator: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    members: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }],
    inviteLink: {
        type: String,
        unique: true
    }, // Example: /join/:token
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Chatroom = mongoose.model("Chatroom", chatroomSchema);
export default Chatroom;
