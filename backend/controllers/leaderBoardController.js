import UserScore from "../models/userScoreModel.js";
import User from "../models/userModel.js";
import cron from "node-cron";


export const getLeaderboard = async (req, res) => {
    try {
        const scores = await UserScore.find()
            .populate("user", "fullName userName profilePhoto")
            .sort({ weeklyScore: -1 })
            .lean();

        const leaderboard = scores.map((s, index) => ({
            position: index + 1,
            user: s.user,
            weeklyScore: s.weeklyScore,
        }));

        res.json({ success: true, leaderboard });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: "Failed to load leaderboard",
        });
    }
};


export const getFriendsLeaderboard = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId).populate("friends", "name userName profilePhoto");

        const friendIds = user.friends.map(friend => friend._id);
        friendIds.push(userId); // Include the user themselves

        const scores = await UserScore.find({ user: { $in: friendIds } })
            .populate("user", "fullName userName profilePhoto")
            .sort({ weeklyScore: -1 })
            .lean();

        const leaderboard = scores.map((s, index) => ({
            position: index + 1,
            user: s.user,
            weeklyScore: s.weeklyScore,
        }));

        res.json({ success: true, leaderboard });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: "Failed to load friends leaderboard",
        });
    }
};



// Schedule cron job: every Sunday at 12:00 AM
export const scheduleWeeklyReset = () => {
    cron.schedule("0 0 * * 0", async () => {
        try {
            const result = await UserScore.updateMany(
                {},
                { $set: { weeklyScore: 0 } }
            );
            console.log(`Weekly scores reset for ${result.modifiedCount} users`);
        } catch (error) {
            console.error("Error resetting weekly scores:", error);
        }
    }, {
        timezone: "Africa/Lagos" // set your timezone
    });

    console.log('Weekly score reset cron job scheduled: Every Sunday at 00:00');
};

