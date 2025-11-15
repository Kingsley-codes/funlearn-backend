// models/QuestionSet.js
import mongoose from "mongoose";

const optionSchema = new mongoose.Schema(
    {
        label: {
            type: String,
            enum: ["A", "B", "C", "D", "E"],
            required: true
        },
        text: {
            type: String,
            required: true
        },
    },
    { _id: false } // ❌ Prevents _id for each option
);

const baseQuestionSchema = new mongoose.Schema(
    {
        question: {
            type: String,
            required: true
        },
        options: [optionSchema],
        correctAnswer: {
            type: String,
            enum: ["A", "B", "C", "D", "E"],
            required: true
        },
        explanation: {
            type: String,
        },
    },
    { _id: false } // ❌ Prevents _id for each option
);

const questionGroupSchema = new mongoose.Schema(
    {
        difficulty: {
            type: String,
            enum: ["easy", "hard"],
            required: true
        },
        list: [baseQuestionSchema],
    },
    { _id: false } // ❌ Prevents _id for each option
);

const questionSetSchema = new mongoose.Schema(
    {
        topic: { type: String, required: true },
        users: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
        ],
        questions: {
            easyQuestions: questionGroupSchema,
            hardQuestions: questionGroupSchema,
        },
    },
    { timestamps: true }
);

const QuestionSet = mongoose.model("QuestionSet", questionSetSchema);
export default QuestionSet;