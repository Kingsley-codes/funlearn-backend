import axios from 'axios'
import { Conversation } from '../models/aiChatModel.js';
import QuestionSet from "../models/questionModel.js";
import crypto from 'crypto';
import { ragService } from '../utils/ragService.js';
import mongoose from 'mongoose';
import {
    isLikelyContentSubmission,
    generateConversationTitle,
    generateContentBasedTitle,
    craftIntelligentPrompt,
    generateChatContextAI
} from "../utils/aiHelpers.js";


const GROQ_URL = process.env.GROQ_URL;
const GROQ_API_KEY = process.env.GROQ_API_KEY; // Add this line

export const handleAIChat = async (req, res) => {
    try {
        const userID = req.user;
        if (!userID) {
            return res.status(403).json({
                success: false,
                message: "You are Unauthorized",
            });
        }

        // ✅ Extract payload
        let { message, fileText, action = "auto", chatId } = req.body;

        // ❌ No multer/file upload expected anymore
        if (!message && !fileText) {
            return res.status(400).json({ error: "Message or file text is required" });
        }

        // ✅ Build final message text
        // We’ll keep file content and user message distinct for summarization and context tracking
        let combinedMessage = "";
        if (fileText && message) {
            combinedMessage = `${message}\n\n[Attached Document Content]\n${fileText}`;
        } else if (fileText && !message) {
            combinedMessage = fileText;
        } else {
            combinedMessage = message;
        }

        // ✅ Get or create conversation
        let context = await Conversation.findOne({ _id: chatId, userID });
        let isNewConversation = false;

        if (!context) {
            let conversationTitle = "New Conversation";

            if (fileText) {
                conversationTitle = await generateContentBasedTitle(fileText);
            } else if (message) {
                conversationTitle = await generateConversationTitle(message);
            }

            context = await Conversation.create({
                userID,
                originalText: "",
                conversation: [],
                hasSummary: false,
                title: conversationTitle || "Untitled Conversation",
            });

            isNewConversation = true;
            console.log("🆕 New conversation created:", context._id, "📄 Title:", conversationTitle);
        }

        // ✅ Handle first content submission (file or long text)
        if (!context.hasSummary) {
            const isFileOnlySubmission = fileText && !message;

            if (isFileOnlySubmission || isLikelyContentSubmission(combinedMessage)) {
                context.originalText = fileText || message;
                context.hasSummary = true;

                // ✅ Generate and save chat context if not set
                if (!context.chatContext && !isPleasantry(message)) {
                    const generatedContext = generateChatContextAI(message, fileText);
                    context.chatContext = generatedContext;
                    console.log("🧩 Chat context set:", generatedContext);
                }

                ragService
                    .storeConversationChunks(context._id.toString(), fileText || message, {
                        type: "original_content",
                        userID: userID.toString(),
                    })
                    .catch((error) => console.error("Failed to store in Pinecone:", error));

                if (isNewConversation) {
                    context.title = await generateContentBasedTitle(fileText || message);
                }

                await context.save();
            }
        }

        // ✅ Craft final prompt (RAG + context-aware)
        const finalPrompt = await craftIntelligentPrompt(combinedMessage, context, action);

        // ✅ Build message array for model
        const messagesForAPI = [];

        if (context.conversation && context.conversation.length > 0) {
            const recentMessages = context.conversation.slice(-10);
            for (const msg of recentMessages) {
                messagesForAPI.push({
                    role: String(msg.role || "user"),
                    content: String(msg.content || ""),
                });
            }
        }

        messagesForAPI.push({
            role: "user",
            content: finalPrompt,
        });

        // ✅ Call Groq or other model API
        const fullResponse = await callGroqAPI(messagesForAPI);

        // ✅ Store conversation in DB
        context.conversation.push(
            { role: "user", content: combinedMessage },
            { role: "assistant", content: fullResponse }
        );
        await context.save();

        // ✅ Store AI response in RAG memory
        if (context.hasSummary && fullResponse.length > 50) {
            ragService
                .storeConversationChunks(context._id.toString(), fullResponse, {
                    type: "assistant_response",
                    userID: userID.toString(),
                })
                .catch(console.error);
        }

        // ✅ Return structured response
        res.status(200).json({
            success: true,
            data: {
                response: fullResponse,
                chatId: context._id,
                title: context.title,
                isNewConversation,
            },
        });
    } catch (error) {
        console.error("AI Chat Error:", error);
        if (!res.headersSent) {
            res.status(500).json({
                error: "Failed to process request",
                details: error.message,
            });
        }
    }
};



export const callGroqAPI = async (messages) => {
    try {
        // ✅ Validate messages parameter
        if (!messages) {
            throw new Error("Messages parameter is undefined");
        }

        if (!Array.isArray(messages)) {
            console.error("❌ Messages is not an array. Actual type:", typeof messages);
            console.error("❌ Messages value:", messages);
            throw new Error(`Messages must be an array. Received: ${typeof messages}`);
        }

        if (messages.length === 0) {
            throw new Error("Messages array cannot be empty");
        }

        // ✅ Validate each message in the array
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            if (!msg || typeof msg !== 'object') {
                throw new Error(`Message at index ${i} is invalid or not an object`);
            }
            if (!msg.role || typeof msg.role !== 'string') {
                throw new Error(`Message at index ${i} is missing role or role is not a string`);
            }
            if (!msg.content || typeof msg.content !== 'string') {
                throw new Error(`Message at index ${i} is missing content or content is not a string`);
            }

            // Validate role is either 'user' or 'assistant'
            if (!['user', 'assistant'].includes(msg.role)) {
                throw new Error(`Message at index ${i} has invalid role: ${msg.role}. Must be 'user' or 'assistant'`);
            }
        }

        // ✅ Create payload with proper validation
        const payload = {
            // Choose one of these current models:
            model: "llama-3.1-8b-instant", // Fast and efficient
            // model: "llama-3.1-70b-versatile", // More powerful but slower
            // model: "mixtral-8x7b-32768", // Good for complex tasks
            messages: messages, // This should now be a valid array
            temperature: 0.7,
            max_tokens: 2000,
            stream: false,
        };

        const response = await axios({
            method: "POST",
            url: GROQ_URL,
            data: payload,
            headers: {
                Authorization: `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json",
            },
            timeout: 30000,
        });

        const aiReply = response.data?.choices?.[0]?.message?.content || "";
        return aiReply;
    } catch (error) {
        console.error("❌ DeepSeek API call failed:", error.message);

        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Response Data:", JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.error("No response received from DeepSeek API");
        } else {
            console.error("Error setting up request:", error.message);
        }

        throw new Error(`Failed to fetch response from DeepSeek API: ${error.message}`);
    }
};


export const getUserConversations = async (req, res) => {
    try {
        const userID = req.user;
        const page = parseInt(req.query.page) || 1;
        const limit = 10; // Fixed batch size of 10

        // Validate userID
        if (!userID) {
            return res.status(400).json({
                status: "error",
                message: "Valid user ID is required"
            });
        }

        const skip = (page - 1) * limit;

        // Fetch conversations with pagination
        const conversations = await Conversation.find({ userID })
            .select('title _id createdAt') // Only return title, id, and createdAt
            .sort({ createdAt: -1 }) // Sort by latest first
            .skip(skip)
            .limit(limit);

        // Get total count for pagination info
        const totalConversations = await Conversation.countDocuments({ userID });

        res.status(200).json({
            status: "success",
            data: conversations.map(conv => ({
                chatId: conv._id,
                title: conv.title,
                createdAt: conv.createdAt
            })),
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalConversations / limit),
                totalConversations,
                hasNext: page < Math.ceil(totalConversations / limit),
                hasPrev: page > 1
            }
        });

    } catch (err) {
        res.status(500).json({
            status: "error",
            message: err.message
        });
    }
};


export const getChatHistory = async (req, res) => {
    try {
        const { chatId } = req.params;
        const userID = req.user;

        // Validate chatId
        if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
            return res.status(400).json({
                success: false,
                message: "Valid chat ID is required"
            });
        }

        if (!userID) {
            return res.status(403).json({
                success: false,
                message: "You are Unauthorized"
            });
        }

        // Find conversation by both userID and chatId
        const conversation = await Conversation.findOne({
            _id: chatId,
            userID: userID
        });

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: "Conversation not found"
            });
        }

        res.status(200).json({
            success: true,
            data: {
                chatId: conversation._id,
                title: conversation.title,
                originalText: conversation.originalText,
                hasSummary: conversation.hasSummary,
                createdAt: conversation.createdAt,
                updatedAt: conversation.updatedAt,
                conversation: conversation.conversation
            }
        });

    } catch (error) {
        console.error("Get Chat History Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch chat history",
            error: error.message
        });
    }
};


export const generateQuestions = async (req, res) => {
    try {
        const userId = req.user;

        if (!userId) {
            return res.status(403).json({
                success: false,
                message: "You are Unauthorized",
            });
        }

        const { chatId, quizTopic } = req.body;

        let topic = "";

        if (chatId) {
            const conversation = await Conversation.findById(chatId);

            if (!conversation) {
                return res.status(404).json({ error: "Conversation not found" });
            }

            topic = conversation.chatContext;
        } else if (quizTopic) {
            topic = quizTopic;
        } else {
            return res.status(400).json({ error: "Quiz Topic must be provided" });
        }

        // 1️⃣ Fetch context for factual grounding
        const searchRes = await axios.get(
            `https://api.duckduckgo.com/?q=${encodeURIComponent(topic)}&format=json`
        );

        const relatedText =
            searchRes.data.AbstractText ||
            searchRes.data.RelatedTopics?.map((t) => t.Text).join(". ") ||
            "";

        // 2️⃣ Build the improved prompt
        const prompt = `
You are a quiz generator. Respond with ONLY valid JSON. 
Do NOT include code blocks, markdown, or explanations outside the JSON.
Use ONLY double quotes for strings and property names.
Do NOT use single quotes anywhere in the JSON.
Make sure the JSON is properly formatted and valid.

Generate two sets of multiple-choice questions about the topic: "${topic}".
Each set should contain exactly 10 questions:
- 10 easy questions
- 10 hard questions

For each question:
- Provide 5 options labeled A–E
- Specify the correct answer letter (A–E)
- Include a short explanation (1–3 sentences) explaining why it is correct.

Return strictly in this format:

{
  "easyQuestions": {
    "difficulty": "easy",
    "list": [
      {
        "question": "What gas is absorbed during photosynthesis?",
        "options": [
          {"label": "A", "text": "Oxygen"},
          {"label": "B", "text": "Carbon dioxide"},
          {"label": "C", "text": "Nitrogen"},
          {"label": "D", "text": "Hydrogen"},
          {"label": "E", "text": "Methane"}
        ],
        "correctAnswer": "B",
        "explanation": "Plants absorb carbon dioxide during photosynthesis to produce glucose."
      }
    ]
  },
  "hardQuestions": {
    "difficulty": "hard",
    "list": [ ...same structure... ]
  }
}

Use this context for factual accuracy:
${relatedText.slice(0, 1800)}
`;

        // 3️⃣ Call Groq API
        const payload = {
            model: "llama-3.1-8b-instant",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
            max_tokens: 3500,
        };

        const response = await axios.post(GROQ_URL, payload, {
            headers: {
                Authorization: `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json",
            },
            timeout: 45000,
        });

        const aiReply = response.data?.choices?.[0]?.message?.content;
        if (!aiReply) throw new Error("No response from Groq API");


        // 4️⃣ SIMPLIFIED JSON parsing - the AI response is already valid JSON!
        let parsed;
        try {
            // First, try to parse directly (it might already be valid)
            parsed = JSON.parse(aiReply);
        } catch (firstError) {
            console.log("First parse failed, trying cleaned version...");

            // If direct parse fails, do minimal cleaning only
            let cleaned = aiReply
                .replace(/```json/g, "")
                .replace(/```/g, "")
                .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") // Remove control characters
                .trim();

            // Try to extract JSON if it's wrapped
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                cleaned = jsonMatch[0];
            }

            // Remove any trailing commas that might break JSON
            cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

            try {
                parsed = JSON.parse(cleaned);
            } catch (secondError) {
                console.error("Second parse failed:", secondError.message);
                console.error("Failed content:", cleaned.substring(2940, 2960)); // Show around error position

                // Last resort: try to fix common issues manually
                try {
                    // Fix unescaped quotes in strings
                    cleaned = cleaned.replace(/([^\\])"/g, '$1\\"');
                    parsed = JSON.parse(cleaned);
                } catch (finalError) {
                    console.error("Final parse attempt failed");
                    throw new Error(`Failed to parse Groq API JSON response: ${firstError.message}`);
                }
            }
        }

        // 5️⃣ Validate and normalize structure
        if (!parsed.easyQuestions || !Array.isArray(parsed.easyQuestions.list)) {
            console.warn("Easy questions missing or invalid, using empty array");
            parsed.easyQuestions = { difficulty: "easy", list: [] };
        }

        if (!parsed.hardQuestions || !Array.isArray(parsed.hardQuestions.list)) {
            console.warn("Hard questions missing or invalid, using empty array");
            parsed.hardQuestions = { difficulty: "hard", list: [] };
        }


        const token = crypto.randomBytes(6).toString("hex");


        // 6️⃣ Save to MongoDB
        const newSet = await QuestionSet.create({
            topic,
            context: relatedText.slice(0, 2000),
            users: [userId],
            inviteToken: token,
            createdBy: userId,
            questions: {
                easyQuestions: parsed.easyQuestions,
                hardQuestions: parsed.hardQuestions,
            },
        });

        // 7️⃣ Send success response
        res.status(201).json({
            success: true,
            message: "Question set generated successfully",
            questionSet: newSet,
        });
    } catch (error) {
        console.error("❌ Question generation failed:", error);
        res.status(500).json({
            success: false,
            error: error.message || "Something went wrong",
        });
    }
};
