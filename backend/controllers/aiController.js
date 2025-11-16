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
    generateChatContextAI,
    cleanAIResponse,
    craftDocumentSummarizationPrompt,
    isSummarizationRequest
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

        // ✅ DETECT EXPLICIT SUMMARIZATION REQUESTS
        const isExplicitSummarizationRequest =
            (message && isSummarizationRequest(message)) ||
            action === "summarize";

        // ✅ Handle fileText with explicit summarization request
        const shouldForceSummarization = fileText && isExplicitSummarizationRequest;

        // ✅ Build final message text
        let combinedMessage = "";
        if (fileText && message) {
            combinedMessage = `${message}\n\n[Attached Document Content]\n${fileText}`;
        } else if (fileText && !message) {
            combinedMessage = fileText;
            // Force summarization for document-only submissions
            action = "summarize";
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

        // ✅ Handle document submission with explicit summarization request
        if (shouldForceSummarization && !context.hasSummary) {
            context.originalText = fileText;
            context.hasSummary = true;

            // Generate and save chat context for the document
            const generatedContext = await generateChatContextAI("", fileText);
            context.chatContext = generatedContext;
            console.log("📄 Document context set with explicit summarization request");

            // Store in Pinecone for RAG
            ragService
                .storeConversationChunks(context._id.toString(), fileText, {
                    type: "original_content",
                    userID: userID.toString(),
                })
                .catch((error) => console.error("Failed to store in Pinecone:", error));

            if (isNewConversation) {
                context.title = await generateContentBasedTitle(fileText);
            }

            await context.save();

            // ✅ Generate immediate summarization prompt for document
            const finalPrompt = await craftDocumentSummarizationPrompt(fileText, context);

            // ✅ Build message array for model
            const messagesForAPI = [];
            messagesForAPI.push({
                role: "user",
                content: finalPrompt,
            });

            // ✅ Call Groq API for summarization
            const fullResponse = await callGroqAPI(messagesForAPI);

            // ✅ Clean the response
            const cleanResponse = cleanAIResponse(fullResponse);

            // ✅ Store conversation in DB
            context.conversation.push(
                { role: "user", content: `[User Request: ${message}]\n\n[Document Uploaded for Analysis]` },
                { role: "assistant", content: cleanResponse }
            );
            await context.save();

            // ✅ Store AI response in RAG memory
            if (cleanResponse.length > 50) {
                ragService
                    .storeConversationChunks(context._id.toString(), cleanResponse, {
                        type: "assistant_response",
                        userID: userID.toString(),
                    })
                    .catch(console.error);
            }

            // ✅ Return structured response
            return res.status(200).json({
                success: true,
                data: {
                    response: cleanResponse,
                    chatId: context._id,
                    title: context.title,
                    isNewConversation,
                    isDocumentSummary: true,
                },
            });
        }

        // ✅ Handle fileText-only submissions (existing behavior)
        if (fileText && !message && !context.hasSummary) {
            context.originalText = fileText;
            context.hasSummary = true;

            // Generate and save chat context for the document
            const generatedContext = await generateChatContextAI("", fileText);
            context.chatContext = generatedContext;
            console.log("📄 Document context set for fileText-only submission");

            // Store in Pinecone for RAG
            ragService
                .storeConversationChunks(context._id.toString(), fileText, {
                    type: "original_content",
                    userID: userID.toString(),
                })
                .catch((error) => console.error("Failed to store in Pinecone:", error));

            if (isNewConversation) {
                context.title = await generateContentBasedTitle(fileText);
            }

            await context.save();

            // ✅ Generate immediate summarization prompt for document
            const finalPrompt = await craftDocumentSummarizationPrompt(fileText, context);

            // ✅ Build message array for model
            const messagesForAPI = [];
            messagesForAPI.push({
                role: "user",
                content: finalPrompt,
            });

            // ✅ Call Groq API for summarization
            const fullResponse = await callGroqAPI(messagesForAPI);

            // ✅ Clean the response
            const cleanResponse = cleanAIResponse(fullResponse);

            // ✅ Store conversation in DB
            context.conversation.push(
                { role: "user", content: "[Document Uploaded for Analysis]" },
                { role: "assistant", content: cleanResponse }
            );
            await context.save();

            // ✅ Store AI response in RAG memory
            if (cleanResponse.length > 50) {
                ragService
                    .storeConversationChunks(context._id.toString(), cleanResponse, {
                        type: "assistant_response",
                        userID: userID.toString(),
                    })
                    .catch(console.error);
            }

            // ✅ Return structured response
            return res.status(200).json({
                success: true,
                data: {
                    response: cleanResponse,
                    chatId: context._id,
                    title: context.title,
                    isNewConversation,
                    isDocumentSummary: true,
                },
            });
        }

        // ✅ Handle first content submission (file or long text) for mixed content
        if (!context.hasSummary && !fileText) {
            if (isLikelyContentSubmission(combinedMessage)) {
                context.originalText = message;
                context.hasSummary = true;

                // ✅ Generate and save chat context if not set
                if (!context.chatContext && !isPleasantry(message)) {
                    const generatedContext = generateChatContextAI(message, fileText);
                    context.chatContext = generatedContext;
                    console.log("🧩 Chat context set:", generatedContext);
                }

                ragService
                    .storeConversationChunks(context._id.toString(), message, {
                        type: "original_content",
                        userID: userID.toString(),
                    })
                    .catch((error) => console.error("Failed to store in Pinecone:", error));

                if (isNewConversation) {
                    context.title = await generateContentBasedTitle(message);
                }

                await context.save();
            }
        }

        // ✅ For cases with both fileText and message but not summarization request
        // Let it flow through normal conversation processing

        // ✅ Craft final prompt (RAG + context-aware)
        const finalPrompt = await craftIntelligentPrompt(
            combinedMessage,
            context,
            action,
            shouldForceSummarization
        );

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

        // ✅ Clean the response - replace literal \n with actual newlines
        const cleanResponse = cleanAIResponse(fullResponse);

        // ✅ Store conversation in DB
        context.conversation.push(
            { role: "user", content: combinedMessage },
            { role: "assistant", content: cleanResponse }
        );
        await context.save();

        // ✅ Store AI response in RAG memory
        if (context.hasSummary && cleanResponse.length > 50) {
            ragService
                .storeConversationChunks(context._id.toString(), cleanResponse, {
                    type: "assistant_response",
                    userID: userID.toString(),
                })
                .catch(console.error);
        }

        // ✅ Return structured response
        res.status(200).json({
            success: true,
            data: {
                response: cleanResponse, // Use cleaned response
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

        // 1️⃣ Use your existing RAG service to get relevant context
        let relatedText = "";

        try {
            // Search both conversation context and external knowledge
            const conversationContext = await ragService.searchRelevantContext(topic, chatId, 5);
            const externalResources = await ragService.searchExternalResources(topic, 3);

            // Combine contexts
            const contexts = [];

            if (conversationContext) {
                contexts.push(`CONVERSATION CONTEXT:\n${conversationContext}`);
            }

            if (externalResources.length > 0) {
                const externalContext = externalResources
                    .map(resource => `FROM ${resource.source}:\n${resource.content}`)
                    .join('\n\n');
                contexts.push(`KNOWLEDGE BASE:\n${externalContext}`);
            }

            if (contexts.length > 0) {
                relatedText = contexts.join('\n\n');
                console.log(`Retrieved context from ${externalResources.length} external resources and conversation history`);
            } else {
                relatedText = `Topic: ${topic}. No specific context found in knowledge base.`;
                console.log("Using minimal context for topic:", topic);
            }

        } catch (ragError) {
            console.warn("RAG context retrieval failed:", ragError.message);
            // Fallback: use the topic itself as minimal context
            relatedText = `Topic: ${topic}. Generating questions based on general knowledge.`;
        }

        // 2️⃣ Improved prompt with RAG context
        const prompt = `
You are a quiz generator. Generate exactly 20 multiple-choice questions about: "${topic}"

RELEVANT CONTEXT:
${relatedText.slice(0, 2000)}

CRITICAL REQUIREMENTS:
- Generate EXACTLY 10 easy questions and EXACTLY 10 hard questions
- Each question MUST have exactly 5 options (A through E)
- Each question MUST have a correct answer (A-E) and explanation
- Base questions on the provided context when relevant
- For easy questions: focus on basic facts, definitions, and straightforward concepts
- For hard questions: focus on analysis, interpretation, connections, and deeper understanding

OUTPUT FORMAT - STRICT JSON ONLY:
{
  "easyQuestions": {
    "difficulty": "easy",
    "list": [
      {
        "question": "Clear question text?",
        "options": [
          {"label": "A", "text": "Option A"},
          {"label": "B", "text": "Option B"},
          {"label": "C", "text": "Option C"},
          {"label": "D", "text": "Option D"},
          {"label": "E", "text": "Option E"}
        ],
        "correctAnswer": "B",
        "explanation": "Clear explanation why B is correct"
      }
      // ... EXACTLY 10 questions
    ]
  },
  "hardQuestions": {
    "difficulty": "hard", 
    "list": [
      // ... EXACTLY 10 questions
    ]
  }
}

IMPORTANT: Return ONLY valid JSON. No markdown, no code blocks, no additional text.
`;

        // 3️⃣ Call Groq API with retry logic
        let retries = 3;
        let parsed = null;

        while (retries > 0) {
            try {
                const payload = {
                    model: "llama-3.1-8b-instant",
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.7,
                    max_tokens: 4000,
                    response_format: { type: "json_object" }
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

                // Parse and validate
                parsed = JSON.parse(aiReply);

                // Validate structure
                if (!parsed.easyQuestions || !parsed.hardQuestions) {
                    throw new Error("Missing question sections");
                }

                // Enhanced normalization with fallback generation
                function normalizeQuestions(list, difficulty) {
                    if (!Array.isArray(list)) {
                        throw new Error(`Invalid ${difficulty} questions format`);
                    }

                    const validQuestions = list
                        .filter(q => q &&
                            q.question &&
                            Array.isArray(q.options) &&
                            q.options.length === 5 &&
                            q.correctAnswer &&
                            q.explanation
                        )
                        .slice(0, 10); // Take first 10 valid ones

                    // If we don't have enough questions, create fallbacks
                    if (validQuestions.length < 10) {
                        console.warn(`Only ${validQuestions.length} valid ${difficulty} questions found, using fallbacks`);

                        // Create simple fallback questions
                        const fallbackCount = 10 - validQuestions.length;
                        for (let i = 0; i < fallbackCount; i++) {
                            validQuestions.push({
                                question: `Fallback ${difficulty} question ${i + 1} about ${topic}`,
                                options: [
                                    { label: "A", text: "Option A" },
                                    { label: "B", text: "Option B" },
                                    { label: "C", text: "Option C" },
                                    { label: "D", text: "Option D" },
                                    { label: "E", text: "Option E" }
                                ],
                                correctAnswer: "A",
                                explanation: "This is a fallback question due to generation limits."
                            });
                        }
                    }

                    return validQuestions.slice(0, 10); // Ensure exactly 10
                }

                parsed.easyQuestions.list = normalizeQuestions(parsed.easyQuestions.list, "easy");
                parsed.hardQuestions.list = normalizeQuestions(parsed.hardQuestions.list, "hard");

                // If we have exactly 10 questions each, break the retry loop
                if (parsed.easyQuestions.list.length === 10 && parsed.hardQuestions.list.length === 10) {
                    break;
                } else {
                    throw new Error(`Question count mismatch: easy=${parsed.easyQuestions.list.length}, hard=${parsed.hardQuestions.list.length}`);
                }

            } catch (parseError) {
                retries--;
                console.warn(`Retry ${3 - retries}/3 due to:`, parseError.message);

                if (retries === 0) {
                    throw new Error(`Failed to generate valid questions after 3 attempts: ${parseError.message}`);
                }

                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        // 4️⃣ Generate token and save to MongoDB
        const token = crypto.randomBytes(6).toString("hex");

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

        // 5️⃣ Send success response
        res.status(201).json({
            success: true,
            message: "Question set generated successfully using RAG context",
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