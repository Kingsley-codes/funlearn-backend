import QuestionSet from "../models/questionModel.js";
import User from "../models/userModel.js";
import UserScore from "../models/userScoreModel.js";
import mongoose from "mongoose";

const rankThresholds = [
    0, 20, 50, 90, 140, 200, 270, 350, 440, 540,
    650, 770, 900, 1040, 1190, 1350, 1520, 1700, 1890, 2090, 2500
];

const rankNames = [
    "Beginner", "Brain Sprout 🌱", "Curious Thinker 🔍", "Knowledge Explorer 🧭",
    "Idea Spark 💡", "Mind Mover 🌀", "Quiz Challenger 🎯",
    "Concept Crusher 💥", "Sharp Scholar 📘", "Logic Builder 🧩",
    "Insight Seeker 🔮", "Wisdom Warrior ⚔️", "Genius Guru 🧙‍♂️",
    "Study Strategist 🧠", "Mind Master 👑", "Genius Grove 🌳",
    "Brainstorm Pro ☁️", "Knowledge Commander 🚀", "Elite Intellect 🏆",
    "Legendary Luminary 🌟", "Sync Sage 🔱"
];


// 🧠 Helper that assigns rank based on score thresholds
async function updateUserRank(userId, overallScore) {
    // Find highest level the score qualifies for
    let newLevel = 1;

    for (let i = 0; i < rankThresholds.length; i++) {
        if (overallScore >= rankThresholds[i]) {
            newLevel = i + 1;
        }
    }

    const newRankName = rankNames[newLevel - 1];

    // Fetch user to compare old rank
    const user = await User.findById(userId);

    const oldRank = user.rank;
    const rankChanged = oldRank !== newRankName;

    // Update rank only if it changed
    if (rankChanged) {
        await User.findByIdAndUpdate(userId, { rank: newRankName });
    }

    return {
        rankChanged,
        oldRank,
        newRank: newRankName,
    };
}


export const getQuestionSet = async (req, res) => {
    try {
        const { questionSetId } = req.params;
        const userID = req.user;

        // Validate questionSetId
        if (!questionSetId || !mongoose.Types.ObjectId.isValid(questionSetId)) {
            return res.status(400).json({
                success: false,
                message: "Valid question set ID is required"
            });
        }
        if (!userID) {
            return res.status(403).json({
                success: false,
                message: "You are Unauthorized"
            });
        }
        // Find question set by both userID and questionSetId
        const questionSet = await QuestionSet.findOne({
            _id: questionSetId,
            users: userID
        });

        if (!questionSet) {
            return res.status(404).json({
                success: false,
                message: "Questions set not found"
            });
        }
        res.status(200).json({
            success: true,
            questionSet
        });
    } catch (error) {
        console.error("❌ Fetching question set failed:", error);
        res.status(500).json({
            success: false,
            error: error.message || "Something went wrong",
        });
    }
};


export const getAllQuestionSets = async (req, res) => {
    try {
        const userID = req.user;
        if (!userID) {
            return res.status(403).json({
                success: false,
                message: "You are Unauthorized"
            });
        }

        const questionSets = await QuestionSet.aggregate([
            // Match question sets for the current user
            { $match: { users: new mongoose.Types.ObjectId(userID) } },

            // Lookup user scores
            {
                $lookup: {
                    from: "userscores",
                    let: { questionSetId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$user", new mongoose.Types.ObjectId(userID)] },
                                        { $in: ["$$questionSetId", "$question.questionSet"] }
                                    ]
                                }
                            }
                        },
                        { $unwind: "$question" },
                        {
                            $match: {
                                $expr: { $eq: ["$question.questionSet", "$$questionSetId"] }
                            }
                        },
                        {
                            $project: {
                                score: "$question.score",
                                _id: 0
                            }
                        }
                    ],
                    as: "userScores"
                }
            },

            // Add computed fields
            {
                $addFields: {
                    totalEasyQuestions: {
                        $size: { $ifNull: ["$questions.easyQuestions.list", []] }
                    },
                    totalHardQuestions: {
                        $size: { $ifNull: ["$questions.hardQuestions.list", []] }
                    },
                    userScore: {
                        $ifNull: [{ $arrayElemAt: ["$userScores.score", 0] }, 0]
                    }
                }
            },

            // Calculate total questions
            {
                $addFields: {
                    totalQuestions: {
                        $add: ["$totalEasyQuestions", "$totalHardQuestions"]
                    }
                }
            },

            // Project final fields
            {
                $project: {
                    topic: 1,
                    totalQuestions: 1,
                    userScore: 1,
                    inviteToken: 1,
                    easyQuestionsCount: "$totalEasyQuestions",
                    hardQuestionsCount: "$totalHardQuestions",
                    createdAt: 1,
                    updatedAt: 1
                }
            }
        ]);

        res.status(200).json({
            success: true,
            questionSets
        });
    } catch (error) {
        console.error("❌ Fetching all question sets failed:", error);
        res.status(500).json({
            success: false,
            error: error.message || "Something went wrong",
        });
    }
};


export const addUserToQuestionSet = async (req, res) => {
    try {
        const { questionSetId } = req.body;
        const userID = req.user; // Auth middleware attaches userID

        // Validate questionSetId
        if (!questionSetId) {
            return res.status(400).json({
                success: false,
                message: "Valid question set ID is required",
            });
        }

        if (!userID) {
            return res.status(403).json({
                success: false,
                message: "You are Unauthorized",
            });
        }

        // Get the question set first
        const questionSet = await QuestionSet.findOne({ inviteToken: questionSetId });

        if (!questionSet) {
            return res.status(404).json({
                success: false,
                message: "Question set not found",
            });
        }

        // Extract all existing users in the question set
        const existingUsers = questionSet.users;

        // If user already exists, stop
        if (existingUsers.includes(userID)) {
            return res.status(200).json({
                success: true,
                message: "User already in this question set",
            });
        }

        // STEP 1: Update new user's friend list to include all existing users
        await User.findByIdAndUpdate(
            userID,
            { $addToSet: { friends: { $each: existingUsers } } }
        );

        // STEP 2: Update existing users' friend lists to include new user
        await User.updateMany(
            { _id: { $in: existingUsers } },
            { $addToSet: { friends: userID } }
        );

        // STEP 3: Add new user to question set
        questionSet.users.addToSet(userID);
        await questionSet.save();

        res.status(200).json({
            success: true,
            message: "User added and friendships updated",
        });

    } catch (error) {
        console.error("❌ Adding user to question set failed:", error);
        res.status(500).json({
            success: false,
            error: error.message || "Something went wrong",
        });
    }
};



export const updateUserScore = async (req, res) => {
    try {
        const { questionSetId, topic, newScore } = req.body;

        const userId = req.user;

        if (!userId) {
            return res.status(403).json({
                success: false,
                message: "You are Unauthorized",
            });
        }

        // Validate inputs
        if (!questionSetId || !topic || typeof newScore !== "number") {
            return res.status(400).json({ success: false, message: "Missing required fields." });
        }

        // Find existing UserScore document
        let userScore = await UserScore.findOne({ user: userId });

        // If user has no score record, create one
        if (!userScore) {
            userScore = new UserScore({
                user: userId,
                question: [
                    { questionSet: questionSetId, topic, score: newScore },
                ],
                weeklyScore: newScore,
                overallScore: newScore,
            });
            await userScore.save();

            // Update rank for new user
            const rankResult = await updateUserRank(userId, newScore);

            let message = "Score updated successfully.";
            let rankMessage = null;

            if (rankResult.rankChanged) {
                rankMessage = `🎉 Congratulations! You just advanced from ${rankResult.oldRank} to ${rankResult.newRank}! Keep going!`;
            }

            return res.status(201).json({
                success: true,
                message,
                rankMessage,
                data: {
                    weeklyScore: userScore.weeklyScore,
                    overallScore: userScore.overallScore,
                    score: newScore,
                    topic,
                }
            });
        }

        // Check if this questionSet already exists in their record
        const existingQuestion = userScore.question.find(
            (q) => q.questionSet.toString() === questionSetId
        );

        if (existingQuestion) {
            // If the score is already 30 or more, block updates
            if (existingQuestion.score >= 30) {
                return res.status(403).json({
                    success: false,
                    message: "Score for this question set cannot be updated (limit reached).",
                });
            }

            // Update the score only if newScore is higher (optional but safer)
            const increment = Math.max(0, newScore - existingQuestion.score);

            existingQuestion.score = newScore;
            existingQuestion.date = Date.now();
            userScore.weeklyScore += increment;
            userScore.overallScore += increment;
        } else {
            // Add a new question entry
            userScore.question.push({
                questionSet: questionSetId,
                topic,
                score: newScore,
            });
            userScore.weeklyScore += newScore;
            userScore.overallScore += newScore;
        }

        await userScore.save();

        // Update rank based on new overall score
        const rankResult = await updateUserRank(userId, userScore.overallScore);


        let message = "Score updated successfully.";
        let rankMessage = null;

        if (rankResult.rankChanged) {
            rankMessage = `🎉 Congratulations! You just advanced from ${rankResult.oldRank} to ${rankResult.newRank}! Keep going!`;
        }

        res.status(200).json({
            success: true,
            message,
            rankMessage,
            data: {
                weeklyScore: userScore.weeklyScore,
                overallScore: userScore.overallScore,
                score: newScore,
                topic,
            }
        });
    } catch (error) {
        console.error("Error updating user score:", error);
        res.status(500).json({
            success: false,
            message: "Server error.",
            error: error.message,
        });
    }
};
