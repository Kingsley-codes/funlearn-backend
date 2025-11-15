import mongoose from "mongoose";
import validator from "validator";


const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      trim: true,
    },
    userName: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      validate: {
        validator: validator.isEmail,
        message: "Invalid email format",
      },
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
    },
    chatrooms: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chatroom"
    }],
    friends: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }],
    profilePhoto: {
      publicId: { type: String },
      url: { type: String }
    },
    bio: {
      type: String,
    },
    school: {
      type: String,
      trim: true,
    },
    level: {
      type: String,
    },
    interests: [{
      type: String,
      trim: true,
    }],
    subscription: {
      type: Object,
      default: null
    },
    rank: {
      type: String,
      default: "Beginner",
      enum: [
        "Beginner", "Brain Sprout 🌱", "Curious Thinker 🔍", "Knowledge Explorer 🧭", "Idea Spark 💡",
        "Mind Mover 🌀", "Quiz Challenger 🎯", "Concept Crusher 💥", "Sharp Scholar 📘",
        "Logic Builder 🧩", "Insight Seeker 🔮", "Wisdom Warrior ⚔️", "Genius Guru 🧙‍♂️",
        "Study Strategist 🧠", "Mind Master 👑", "Genius Grove 🌳", "Brainstorm Pro ☁️",
        "Knowledge Commander 🚀", "Elite Intellect 🏆", "Legendary Luminary 🌟", "Sync Sage 🔱"
      ]
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

export default User;
