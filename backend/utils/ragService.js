import { Pinecone } from '@pinecone-database/pinecone';
import axios from 'axios';


const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
});

const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME || 'ai-chat-vectors');


class RAGService {
    constructor() {
        this.namespace = 'conversations';
    }

    // Generate embeddings using OpenAI API directly
    async generateEmbedding(text) {
        try {
            const response = await axios.post(
                'https://api.openai.com/v1/embeddings',
                {
                    model: 'text-embedding-3-small',
                    input: text
                },
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return response.data.data[0].embedding;
        } catch (error) {
            console.error('Embedding generation error:', error);
            // Fallback: return a simple hash-based embedding (for development)
            return this.createSimpleEmbedding(text);
        }
    }

    // Simple fallback embedding for development
    createSimpleEmbedding(text) {
        const embedding = new Array(1536).fill(0);
        const words = text.toLowerCase().split(/\s+/);

        words.forEach(word => {
            let hash = 0;
            for (let i = 0; i < word.length; i++) {
                hash = ((hash << 5) - hash) + word.charCodeAt(i);
                hash |= 0;
            }
            const index = Math.abs(hash) % 1536;
            embedding[index] = (embedding[index] + 1) * 0.1;
        });

        return embedding;
    }

    // Store conversation chunks in Pinecone
    async storeConversationChunks(conversationId, text, metadata = {}) {
        try {
            // Split text into chunks
            const chunks = this.splitTextIntoChunks(text, 500);

            const vectors = [];

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const embedding = await this.generateEmbedding(chunk);

                vectors.push({
                    id: `${conversationId}_chunk_${i}`,
                    values: embedding,
                    metadata: {
                        conversationId,
                        chunkIndex: i,
                        text: chunk,
                        timestamp: new Date().toISOString(),
                        ...metadata
                    }
                });
            }

            await pineconeIndex.upsert({
                vectors,
                namespace: this.namespace
            });

            console.log(`Stored ${vectors.length} chunks for conversation ${conversationId}`);
            return vectors.length;
        } catch (error) {
            console.error('Error storing conversation chunks:', error);
            throw error;
        }
    }

    // Search for relevant context
    async searchRelevantContext(query, conversationId = null, topK = 3) {
        try {
            const queryEmbedding = await this.generateEmbedding(query);

            let filter = {};
            if (conversationId) {
                filter.conversationId = conversationId;
            }

            const searchResponse = await pineconeIndex.query({
                vector: queryEmbedding,
                topK,
                includeMetadata: true,
                filter,
                namespace: this.namespace
            });

            // Extract and combine relevant text chunks
            const relevantContext = searchResponse.matches
                .filter(match => match.score > 0.7) // Only use high-confidence matches
                .map(match => match.metadata.text)
                .join('\n\n');

            return relevantContext;
        } catch (error) {
            console.error('Error searching relevant context:', error);
            return '';
        }
    }

    // Store external knowledge/resources
    async storeExternalKnowledge(topic, content, source) {
        try {
            const embedding = await this.generateEmbedding(content);

            const vector = {
                id: `external_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                values: embedding,
                metadata: {
                    type: 'external_knowledge',
                    topic,
                    content,
                    source,
                    timestamp: new Date().toISOString()
                }
            };

            await pineconeIndex.upsert({
                vectors: [vector],
                namespace: this.namespace
            });

            console.log(`Stored external knowledge: ${topic}`);
            return vector.id;
        } catch (error) {
            console.error('Error storing external knowledge:', error);
            throw error;
        }
    }

    // Search for external resources
    async searchExternalResources(query, topK = 5) {
        try {
            const queryEmbedding = await this.generateEmbedding(query);

            const searchResponse = await pineconeIndex.query({
                vector: queryEmbedding,
                topK,
                includeMetadata: true,
                filter: { type: 'external_knowledge' },
                namespace: this.namespace
            });

            return searchResponse.matches
                .filter(match => match.score > 0.6)
                .map(match => ({
                    content: match.metadata.content,
                    source: match.metadata.source,
                    topic: match.metadata.topic,
                    score: match.score
                }));
        } catch (error) {
            console.error('Error searching external resources:', error);
            return [];
        }
    }

    // Helper function to split text into chunks
    splitTextIntoChunks(text, chunkSize = 500) {
        if (!text || text.length === 0) return [];

        const chunks = [];
        let currentChunk = '';

        // Split by sentences first for better context
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

        for (const sentence of sentences) {
            const trimmedSentence = sentence.trim() + '.';

            if ((currentChunk + ' ' + trimmedSentence).length > chunkSize && currentChunk) {
                chunks.push(currentChunk.trim());
                currentChunk = trimmedSentence;
            } else {
                currentChunk = currentChunk ? currentChunk + ' ' + trimmedSentence : trimmedSentence;
            }
        }

        if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
        }

        return chunks.length > 0 ? chunks : [text.substring(0, chunkSize)];
    }

    // Delete conversation vectors (when conversation is deleted)
    async deleteConversationVectors(conversationId) {
        try {
            await pineconeIndex.deleteMany({
                filter: { conversationId },
                namespace: this.namespace
            });
            console.log(`Deleted vectors for conversation ${conversationId}`);
        } catch (error) {
            console.error('Error deleting conversation vectors:', error);
            throw error;
        }
    }

    // Get conversation statistics
    async getConversationStats(conversationId) {
        try {
            const stats = await pineconeIndex.describeIndexStats();
            return stats;
        } catch (error) {
            console.error('Error getting conversation stats:', error);
            return null;
        }
    }
}

export const ragService = new RAGService();