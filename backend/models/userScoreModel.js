import mongoose from "mongoose";

const scoreSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true
        },
        question: [
            {
                questionSet: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "QuestionSet",
                    required: true
                },
                topic: {
                    type: String,
                    required: true
                },
                score: {
                    type: Number,
                    required: true
                },
                date: {
                    type: Date,
                    default: Date.now
                }
            }
        ],
        weeklyScore: {
            type: Number,
            default: 0
        },
        overallScore: {
            type: Number,
            default: 0
        }
    },
    { timestamps: true }
);

const UserScore = mongoose.model("UserScore", scoreSchema);
export default UserScore;