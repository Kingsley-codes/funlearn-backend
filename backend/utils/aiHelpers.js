import axios from "axios";


// ✅ Enhanced helper function to detect pleasantries
export const isPleasantry = (text) => {
    const pleasantries = [
        'hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening',
        'how are you', 'how do you do', 'nice to meet you', 'greetings',
        'thanks', 'thank you', 'appreciate it', 'thanks a lot',
        'bye', 'goodbye', 'see you', 'farewell', 'have a good day'
    ];

    const cleanText = text.toLowerCase().trim();
    return pleasantries.some(pleasantry => cleanText.includes(pleasantry));
};


// ✅ Enhanced content submission detection
export const isLikelyContentSubmission = (text) => {
    // Don't mark pleasantries as content submissions
    if (isPleasantry(text)) return false;

    return text.length > 200 ||
        (text.includes('\n') && text.length > 50) ||
        text.includes('http') ||
        text.toLowerCase().includes('summarize') ||
        text.toLowerCase().includes('analyze');
};

// ✅ Helper function to generate conversation title
export const generateConversationTitle = async (firstMessage) => {
    // For very short messages or questions, create a descriptive title
    if (firstMessage.length < 50 || firstMessage.endsWith('?')) {
        const truncated = firstMessage.substring(0, 30);
        return `${truncated}${firstMessage.length > 30 ? '...' : ''}`;
    }

    // For longer content, extract first few meaningful words
    const words = firstMessage.split(' ').slice(0, 5).join(' ');
    return `${words}...`;
};

// ✅ Helper function to generate title for content-based conversations
export const generateContentBasedTitle = async (content) => {
    // Extract first sentence or first 40 characters as title
    const firstSentence = content.split('.')[0];
    if (firstSentence.length > 20 && firstSentence.length < 60) {
        return firstSentence;
    }

    // Fallback: first 40 characters
    return content.substring(0, 40) + (content.length > 40 ? '...' : '');
};


// Helper functions
export const isQuestion = (text) => {
    const questionWords = ['what', 'how', 'why', 'when', 'where', 'who', 'explain', 'tell me about', '?'];
    return questionWords.some(word => text.toLowerCase().includes(word));
};


// ✅ Enhanced prompt crafting with RAG
export const craftIntelligentPrompt = async (message, context, action) => {
    // ✅ Handle pleasantries first
    if (isPleasantry(message)) {
        return `The user said: "${message}". 
        
        Please respond naturally and warmly to this greeting or pleasantry. Keep it friendly, engaging, and appropriate for the context. 
        If this is the start of a conversation, briefly introduce yourself as a helpful AI assistant and invite them to share what they'd like help with.
        
        Be conversational and human-like in your response.`;
    }

    // If no context exists yet and message is long, assume it's content to summarize
    if (!context.hasSummary && message.length > 200 && !isPleasantry(message)) {
        // Store the content in Pinecone for future reference (non-blocking)
        ragService.storeConversationChunks(
            context._id.toString(),
            message,
            { type: 'original_content' }
        ).catch(console.error);

        return `Please analyze and summarize the following content. Provide a comprehensive summary with:
    
            📌 MAIN SUMMARY: 2-5 sentence overview
            🎯 KEY POINTS: Bullet points of important concepts
            💡 CORE CONCEPTS: Fundamental ideas to understand
            🔍 DEEPER INSIGHTS: Interesting observations

        Content to analyze:
        ${message}

        After your analysis, invite the user to ask follow-up questions or request related resources.`;
    }

    // If we have context and user asks a question - USE RAG
    if (context.hasSummary && (isQuestion(message) || action === 'followup')) {
        // Search for relevant context from Pinecone
        const relevantContext = await ragService.searchRelevantContext(
            message,
            context._id.toString(),
            3
        );

        // Also search external knowledge for broader context
        const externalContext = await ragService.searchExternalResources(message, 2);

        let externalContextText = '';
        if (externalContext.length > 0) {
            externalContextText = `\n\nEXTERNAL KNOWLEDGE:\n${externalContext.map(ec => `• ${ec.content} (Source: ${ec.source})`).join('\n')}`;
        }

        return `Based on the original content, conversation history, and relevant knowledge, please answer the user's question.

        ORIGINAL CONTEXT:
        ${context.originalText.substring(0, 1000)}...

        RELEVANT RETRIEVED CONTEXT:
        ${relevantContext || "No specific relevant context found."}
        ${externalContextText}

        CONVERSATION HISTORY:
        ${context.conversation.slice(-4).map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n')}

        USER'S CURRENT QUESTION: ${message}

        Please provide a helpful, detailed answer. Reference the retrieved context when relevant. 
        If the context doesn't fully answer the question, acknowledge this and provide the best answer you can based on general knowledge.`;
    }

    // If user asks for resources specifically - USE RAG
    if (message.toLowerCase().includes('resource') || message.toLowerCase().includes('learn more') || action === 'resources') {
        const sourceText = context.originalText || message;
        const topic = extractTopic(message, sourceText);

        // Search for relevant external resources
        const externalResources = await ragService.searchExternalResources(topic, 5);

        let resourcesContext = '';
        if (externalResources.length > 0) {
            resourcesContext = `\n\nRETRIEVED RESOURCES:\n${externalResources.map(resource =>
                `• ${resource.content} - ${resource.source} (Relevance: ${(resource.score * 100).toFixed(1)}%)`
            ).join('\n')}`;
        }

        return `The user wants learning resources about "${topic}". 

        ORIGINAL CONTEXT:
        ${sourceText.substring(0, 800)}...
        ${resourcesContext}

        ${externalResources.length > 0 ?
                `Please present these specific, verified resources in a helpful, organized way. Explain why each resource is relevant and how it can help the user.` :
                `Since no specific resources were found in our knowledge base, please suggest 3-5 high-quality online resources for further learning. For each resource include:
            • 📚 Type (Article, Video, Course, Research Paper, etc.)
            • 🎯 Why it's relevant
            • ⏱️ Estimated time commitment
            • 🔗 Suggested search terms to find it`
            }`;
    }

    // For general questions without context - USE RAG
    if (isQuestion(message) && !context.hasSummary) {
        const relevantKnowledge = await ragService.searchExternalResources(message, 3);

        let knowledgeContext = '';
        if (relevantKnowledge.length > 0) {
            knowledgeContext = `\n\nRELEVANT KNOWLEDGE:\n${relevantKnowledge.map(k => `• ${k.content} (Source: ${k.source})`).join('\n')}`;
        }

        return `Answer the user's question: "${message}"
        ${knowledgeContext}

        CONVERSATION HISTORY (if any):
        ${context.conversation.slice(-3).map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n')}

        Please provide a comprehensive, accurate answer. Use the retrieved knowledge when relevant, and supplement with your general knowledge.`;
    }

    // Default: general conversation with context awareness
    if (context.hasSummary) {
        return `Continue the conversation with the user. You have this context available:

        ORIGINAL CONTEXT:
        ${context.originalText.substring(0, 1000)}...

        RECENT CONVERSATION:
        ${context.conversation.slice(-4).map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n')}

        USER'S MESSAGE: ${message}

        Respond helpfully and naturally. Reference previous context when relevant.`;
    }

    // Fallback: general AI response for casual conversation
    return `The user says: "${message}". 
    
    Please provide a helpful, engaging, and conversational response. 
    Be friendly and natural in your tone. If they're starting a general conversation, respond appropriately and ask how you can help them today.`;
};

// Helper function to extract topic from message
export const extractTopic = (message, context) => {
    // Simple topic extraction
    const questionWords = ['what', 'how', 'why', 'when', 'where', 'who', 'explain', 'tell me about'];
    const words = message.toLowerCase().split(' ');

    for (let i = 0; i < words.length; i++) {
        if (questionWords.includes(words[i]) && i + 1 < words.length) {
            return words.slice(i + 1).join(' ').replace('?', '');
        }
    }

    // If no question word found, use first few meaningful words
    return message.split(' ').slice(0, 5).join(' ').replace('?', '');
};


// ✅ Simple AI-based or rule-based topic extractor
export const generateChatContextAI = async (message, fileText) => {
    const prompt = `
    Extract a short, clear topic (1-5 words) that best describes the main subject of this text:
    ---
    ${message || fileText}
    ---
    Respond with only the topic phrase.`;

    const result = await callGroqAPI([{ role: 'user', content: prompt }]);
    return result.trim();
};


export const callGroqAPI = async (messages, options = {}) => {
    const {
        model = "llama-3.1-8b-instant",
        temperature = 0.7,
        max_tokens = 1000,
    } = options;

    try {
        const response = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                model,
                messages,
                temperature,
                max_tokens,
            },
            {
                headers: {
                    "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
                    "Content-Type": "application/json",
                },
            }
        );

        const content =
            response.data?.choices?.[0]?.message?.content?.trim() ||
            "No response from model.";

        return content;
    } catch (error) {
        console.error("Groq API Error:", error.response?.data || error.message);
        throw new Error("Failed to get response from Groq API");
    }
};

