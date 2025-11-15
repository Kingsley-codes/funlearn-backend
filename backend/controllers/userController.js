import User from "../models/userModel.js";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import UserScore from "../models/userScoreModel.js";



export const getRankInfo = (overallScore) => {
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

    const rankDescriptions = [
        "You’re just starting out.",
        "You’re just beginning to grow your thinking skills.",
        "Your questions are becoming sharper every day.",
        "You move through ideas with growing confidence.",
        "Your mind creates fresh thoughts with ease.",
        "You shift through problems with steady direction.",
        "You face each question with bold energy.",
        "You break down tricky ideas with steady focus.",
        "You learn fast and apply what you know.",
        "You connect thoughts in smart ways that work.",
        "You look deeper and notice details others miss.",
        "You handle tough challenges with clear judgment.",
        "You guide your own thinking with real skill.",
        "You plan how to improve and follow through.",
        "You stay calm and think with strong control.",
        "Your thoughts grow wide and deep at the same time.",
        "You produce ideas quickly and refine them well.",
        "You move through learning with powerful direction.",
        "You solve problems with clean precision.",
        "Your thinking shines and inspires progress.",
        "Your mind moves in harmony, steady and advanced."
    ];

    // determine current and next level
    let currentLevel = 1;
    let nextLevel = null;

    for (let i = rankThresholds.length - 1; i >= 0; i--) {
        if (overallScore >= rankThresholds[i]) {
            currentLevel = i + 1;
            nextLevel = rankThresholds[i + 1] ? i + 2 : null;
            break;
        }
    }

    const currentMin = rankThresholds[currentLevel - 1];
    const nextMin = nextLevel ? rankThresholds[nextLevel - 1] : null;

    // progress calculation
    let progress = 100;
    if (nextMin !== null) {
        progress = ((overallScore - currentMin) / (nextMin - currentMin)) * 100;
    }

    return {
        level: currentLevel,
        title: rankNames[currentLevel - 1],
        desc: rankDescriptions[currentLevel - 1],
        nextLevelMin: nextMin,
        progress: Math.min(100, Math.max(0, Math.round(progress))),
    };
};




export const getUserProfile = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId).select('-password -subscription -__v');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const userScore = await UserScore.findOne({ user: userId });


        const rankInfo = getRankInfo(userScore.overallScore);
        console.log("Rank Info:", userScore.overallScore);
        res.json({
            success: true,
            user,
            rankInfo
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


export const updateUserProfile = async (req, res) => {
    try {
        const userId = req.user._id;
        const { bio, school, level, userName, interests } = req.body;
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        if (bio !== undefined) user.bio = bio;
        if (school !== undefined) user.school = school;
        if (level !== undefined) user.level = level;
        if (interests !== undefined) {
            if (Array.isArray(interests)) {
                user.interests = interests;
            }
        }
        if (userName !== undefined) {
            let existingUser = await User.findOne({ userName });
            if (existingUser && existingUser._id.toString() !== userId.toString()) {
                return res.status(400).json({
                    success: false,
                    message: 'Username already taken'
                });
            }
            user.userName = userName;
        }

        // Handle logo upload if a file is provided
        if (req.file) {

            try {
                // Delete old logo from Cloudinary if it exists
                if (user.profilePhoto && user.profilePhoto.publicId) {
                    await cloudinary.uploader.destroy(user.profilePhoto.publicId);
                }

                // Upload new logo to Cloudinary
                const result = await new Promise((resolve, reject) => {
                    cloudinary.uploader.upload_stream(
                        {
                            folder: "FunLearn/profilePhotos",
                            width: 500,
                            height: 500,
                            crop: "fill",
                        },
                        (error, uploaded) => {
                            if (error) reject(error);
                            else resolve(uploaded);
                        }
                    ).end(req.file.buffer); // ⬅ THIS IS THE FIX
                });

                // Update logo in profile
                user.profilePhoto = {
                    publicId: result.public_id,
                    url: result.secure_url
                };
                // Delete the temporary file after successful upload
                if (fs.existsSync(req.file.path)) {
                    fs.unlinkSync(req.file.path);
                }
            } catch (uploadErr) {

                // Clean up the file if upload fails
                if (req.file.path && fs.existsSync(req.file.path)) {
                    fs.unlinkSync(req.file.path);
                }
                return res.status(500).json({
                    success: false,
                    message: `Failed to upload image: ${uploadErr.message}`
                });
            }
        };

        await user.save();

        res.json({
            success: true,
            message: 'Profile updated successfully',
            user
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};