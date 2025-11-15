import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    role: {
        type: String,
        enum: ['user', 'assistant'],
        required: true
    },
    content: {
        type: String,
        required: true
    },
});

const conversationSchema = new mongoose.Schema({
    userID: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }, // or use userId instead
    originalText: {
        type: String,
        default: ''
    },
    chatContext: {
        type: String
    },
    title: {
        type: String,
        required: true,
    },
    hasSummary: {
        type: Boolean,
        default: false
    },
    conversation: [messageSchema],
},
    { timestamps: true });

export const Conversation = mongoose.model('Conversation', conversationSchema);
