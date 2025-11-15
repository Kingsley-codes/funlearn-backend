// "use client";
// import { useState, useEffect, FormEvent, ChangeEvent } from "react";
// import axios from "axios";
// import { Send, Upload, PlusCircle, Loader2, Sparkles } from "lucide-react";

interface Chat {
    chatId: string;
    title: string;
    createdAt: string;
}

interface ConversationMessage {
    sender: "user" | "ai";
    text: string;
}

interface ChatHistory {
    chatId: string;
    title: string;
    originalText: string;
    hasSummary: boolean;
    createdAt: string;
    updatedAt: string;
    conversation: any[]; // Adjust based on your actual conversation structure
}

export default function AITestPage() {
    const [message, setMessage] = useState("");
    const [file, setFile] = useState < File | null > (null);
    const [currentChatId, setCurrentChatId] = useState < string > ("");
    const [chats, setChats] = useState < Chat[] > ([]);
    const [conversation, setConversation] = useState < ConversationMessage[] > ([]);
    const [loading, setLoading] = useState(false);
    const [chatsLoading, setChatsLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMoreChats, setHasMoreChats] = useState(true);
    const [authToken, setAuthToken] = useState < string | null > (null);

    const BACKEND_URL = "https://studysync-eudf.onrender.com/api/ai";

    // Get token from localStorage on component mount
    useEffect(() => {
        const token = localStorage.getItem("token");
        if (token) {
            setAuthToken(token);
        } else {
            console.error("No token found in localStorage");
            // Redirect to login or show error message
            alert("Please login first");
        }
    }, []);

    // Fetch user conversations for sidebar
    const fetchUserConversations = async (pageNum: number = 1) => {
        if (!authToken) {
            console.error("No authentication token available");
            return;
        }

        try {
            setChatsLoading(true);
            const response = await axios.get(`${BACKEND_URL}/chat`, {
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
                params: {
                    page: pageNum,
                },
            });

            if (response.data.status === "success") {
                if (pageNum === 1) {
                    setChats(response.data.data);
                } else {
                    setChats((prev) => [...prev, ...response.data.data]);
                }
                setHasMoreChats(response.data.pagination.hasNext);
                setPage(pageNum);
            }
        } catch (error: any) {
            console.error("Error fetching conversations:", error);
            if (error.response?.status === 401) {
                // Token might be expired, clear localStorage and redirect to login
                localStorage.removeItem("token");
                alert("Session expired. Please login again.");
                // You might want to redirect to login page here
                // window.location.href = "/login";
            } else {
                alert("Failed to load conversations");
            }
        } finally {
            setChatsLoading(false);
        }
    };

    // Fetch chat history when a chat is selected
    const fetchChatHistory = async (chatId: string) => {
        if (!authToken) {
            console.error("No authentication token available");
            return;
        }

        try {
            setLoading(true);
            const response = await axios.get(`${BACKEND_URL}/chat/${chatId}`, {
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            if (response.data.success) {
                const chatHistory: ChatHistory = response.data.data;
                setCurrentChatId(chatId);

                // Convert backend conversation format to frontend format
                const formattedConversation = formatConversation(
                    chatHistory.conversation
                );
                setConversation(formattedConversation);
            }
        } catch (error: any) {
            console.error("Error fetching chat history:", error);
            if (error.response?.status === 401) {
                localStorage.removeItem("token");
                alert("Session expired. Please login again.");
            } else if (error.response?.status === 404) {
                alert("Conversation not found");
            } else {
                alert("Failed to load chat history");
            }
        } finally {
            setLoading(false);
        }
    };

    // Format backend conversation to frontend format
    const formatConversation = (
        backendConversation: any[]
    ): ConversationMessage[] => {
        if (!backendConversation) return [];

        // Adjust this based on your actual conversation structure from backend
        return backendConversation.map((msg) => ({
            sender: msg.role === "user" || msg.sender === "user" ? "user" : "ai",
            text: msg.content || msg.text || JSON.stringify(msg),
        }));
    };

    // Load conversations when authToken is available
    useEffect(() => {
        if (authToken) {
            fetchUserConversations(1);
        }
    }, [authToken]);

    function detectAction(
        message: string,
        file: File | null,
        chatId: string
    ): string {
        const text = message.toLowerCase().trim();

        // Case 1: File only (new or existing chat)
        if (file && !message) return "summarize";

        // Case 2: File + message (in new or existing chat)
        if (file && message) {
            if (
                text.includes("summarize") ||
                text.includes("analyze") ||
                text.length > 100
            )
                return "summarize";
            if (
                text.includes("resource") ||
                text.includes("learn more") ||
                text.includes("study")
            )
                return "resources";
            return "question";
        }

        // Case 3: Text only (existing or new chat)
        if (message) {
            if (text.includes("resource") || text.includes("learn more"))
                return "resources";
            if (text.includes("summarize") || text.length > 200) return "summarize";
            return "question";
        }

        return "question";
    }

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!message && !file) return;
        if (!authToken) {
            alert("Please login first");
            return;
        }

        setLoading(true);

        // Add user's message immediately
        if (message) {
            setConversation((prev) => [...prev, { sender: "user", text: message }]);
        }

        try {
            let extractedText = "";
            if (file) {
                // 1️⃣ Extract text from PDF or image
                const { extractText, getDocumentProxy } = await import("unpdf");
                const pdfBuffer = await file.arrayBuffer();
                const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer));
                const { text } = await extractText(pdf, { mergePages: true });
                extractedText = text.trim();
            }

            // 2️⃣ Determine action type intelligently
            const action = detectAction(message, file, currentChatId);
            console.log("Detected action:", action);

            // 3️⃣ Construct payload (no file, only text)
            const payload: any = {
                action,
                chatId: currentChatId || undefined,
            };

            // If there’s a file and message, keep them distinct
            if (file && message) {
                payload.fileText = extractedText;
                payload.message = message;
            } else if (file && !message) {
                payload.message = extractedText; // file-only case
            } else {
                payload.message = message; // text-only case
            }

            // 4️⃣ Send to backend
            const res = await axios.post(`${BACKEND_URL}/chat`, payload, {
                headers: {
                    Authorization: `Bearer ${authToken}`,
                    "Content-Type": "application/json",
                },
            });

            // 5️⃣ Handle AI response
            const aiResponse =
                typeof res.data === "object"
                    ? JSON.stringify(res.data, null, 2)
                    : res.data;

            setConversation((prev) => [...prev, { sender: "ai", text: aiResponse }]);

            // 6️⃣ Refresh conversation list if it’s a new chat
            if (!currentChatId && res.data.chatId) {
                setCurrentChatId(res.data.chatId);
                fetchUserConversations(1);
            }
        } catch (err: any) {
            console.error("Error sending message:", err);
            const errorMessage: ConversationMessage = {
                sender: "ai",
                text: err.response?.data?.message || err.message || "Error occurred",
            };
            setConversation((prev) => [...prev, errorMessage]);
        } finally {
            setMessage("");
            setFile(null);
            setLoading(false);
        }
    };

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        setFile(selected || null);
    };

    const handleNewChat = () => {
        setConversation([]);
        setCurrentChatId("");
    };

    const handleChatSelect = (chatId: string) => {
        if (chatId !== currentChatId) {
            fetchChatHistory(chatId);
        }
    };

    const loadMoreChats = () => {
        if (hasMoreChats && !chatsLoading && authToken) {
            fetchUserConversations(page + 1);
        }
    };

    // Show loading state while checking authentication
    if (!authToken) {
        return (
            <div className="flex h-screen bg-gray-100 items-center justify-center">
                <div className="text-center">
                    <Loader2 className="animate-spin mx-auto mb-4" size={32} />
                    <p>Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-gray-100 text-gray-800">
            {/* Sidebar */}
            <aside className="w-64 bg-white border-r flex flex-col">
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-lg font-semibold">Chats</h2>
                    <button
                        onClick={handleNewChat}
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm font-medium"
                    >
                        <PlusCircle size={18} /> New
                    </button>
                </div>

                <div
                    className="flex-1 overflow-y-auto"
                    onScroll={(e) => {
                        const element = e.target as HTMLDivElement;
                        if (
                            element.scrollHeight - element.scrollTop <=
                            element.clientHeight + 50 &&
                            hasMoreChats
                        ) {
                            loadMoreChats();
                        }
                    }}
                >
                    {chatsLoading && page === 1 ? (
                        <div className="flex justify-center p-4">
                            <Loader2 className="animate-spin" size={20} />
                        </div>
                    ) : chats.length === 0 ? (
                        <p className="text-center text-sm text-gray-500 mt-4">
                            No conversations
                        </p>
                    ) : (
                        <>
                            {chats.map((chat) => (
                                <button
                                    key={chat.chatId}
                                    onClick={() => handleChatSelect(chat.chatId)}
                                    className={`w-full text-left p-3 text-sm hover:bg-gray-100 truncate ${currentChatId === chat.chatId
                                        ? "bg-gray-200 font-medium"
                                        : ""
                                        }`}
                                    title={chat.title}
                                >
                                    {chat.title}
                                </button>
                            ))}
                            {chatsLoading && (
                                <div className="flex justify-center p-2">
                                    <Loader2 className="animate-spin" size={16} />
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="p-4 border-t">
                    <button
                        onClick={() => alert("Generate Questions clicked")}
                        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-blue-500 text-white font-medium py-2 rounded-lg hover:opacity-90"
                    >
                        <Sparkles size={18} />
                        Generate Questions
                    </button>
                </div>
            </aside>

            {/* Main Chat Area */}
            <main className="flex-1 flex flex-col">
                {/* Chat Header */}
                {currentChatId && (
                    <div className="border-b bg-white p-4">
                        <h1 className="text-lg font-semibold">
                            {chats.find((chat) => chat.chatId === currentChatId)?.title ||
                                "Chat"}
                        </h1>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {conversation.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400">
                            <Sparkles size={36} className="mb-2" />
                            <p className="text-lg">Start chatting with the AI</p>
                            <p className="text-sm mt-2">
                                Send a message or upload a file to begin
                            </p>
                        </div>
                    ) : (
                        conversation.map((msg, i) => (
                            <div
                                key={i}
                                className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"
                                    }`}
                            >
                                <div
                                    className={`max-w-[80%] p-3 rounded-2xl text-sm shadow-sm ${msg.sender === "user"
                                        ? "bg-blue-600 text-white rounded-br-none"
                                        : "bg-white text-gray-800 rounded-bl-none border"
                                        }`}
                                >
                                    {msg.text}
                                </div>
                            </div>
                        ))
                    )}
                    {loading && (
                        <div className="flex justify-start">
                            <div className="bg-white border rounded-2xl rounded-bl-none p-3">
                                <Loader2 className="animate-spin" size={20} />
                            </div>
                        </div>
                    )}
                </div>

                {/* Input Area */}
                <form
                    onSubmit={handleSubmit}
                    className="border-t bg-white p-4 flex items-center gap-3"
                >
                    <label className="cursor-pointer">
                        <Upload
                            size={22}
                            className={`${file ? "text-blue-600" : "text-gray-400"
                                } hover:text-blue-600`}
                        />
                        <input
                            type="file"
                            accept="application/pdf,image/*"
                            className="hidden"
                            onChange={handleFileChange}
                        />
                    </label>

                    <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Type your message..."
                        className="flex-1 border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                        rows={1}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit(e);
                            }
                        }}
                    />

                    <button
                        type="submit"
                        disabled={loading || (!message && !file)}
                        className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <Loader2 className="animate-spin" size={20} />
                        ) : (
                            <Send size={20} />
                        )}
                    </button>
                </form>
            </main>
        </div>
    );
}
