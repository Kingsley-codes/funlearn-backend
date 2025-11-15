// scripts/initPinecone.js
import { Pinecone } from '@pinecone-database/pinecone';

const initPinecone = async () => {
    try {
        const pinecone = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY,
        });

        const indexName = process.env.PINECONE_INDEX_NAME || 'ai-chat-vectors';

        const indexes = await pinecone.listIndexes();
        const indexExists = indexes.indexes?.some(index => index.name === indexName);

        if (!indexExists) {
            await pinecone.createIndex({
                name: indexName,
                dimension: 1536, // OpenAI embeddings dimension
                metric: 'cosine',
                spec: {
                    serverless: {
                        cloud: 'aws',
                        region: 'us-east-1'
                    }
                }
            });
            console.log('✅ Pinecone index created successfully');

            // Wait for index to be ready
            await new Promise(resolve => setTimeout(resolve, 60000));
            console.log('✅ Pinecone index is ready for use');
        } else {
            console.log('✅ Pinecone index already exists');
        }
    } catch (error) {
        console.error('❌ Error initializing Pinecone:', error.message);
    }
};

export { initPinecone };