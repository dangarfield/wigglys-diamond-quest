#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    BedrockRuntimeClient,
    InvokeModelCommand
} from '@aws-sdk/client-bedrock-runtime';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const AWS_PROFILE = 'dan-sso';
const AWS_REGION = 'us-east-1'; // Nova Canvas is available in us-east-1
const MODEL_ID = 'amazon.nova-canvas-v1:0';
const OUTPUT_DIR = path.join(__dirname, 'public', 'generated-images');

// Initialize AWS Bedrock client
const bedrockClient = new BedrockRuntimeClient({
    region: AWS_REGION
    // Will use default credential chain which includes AWS_PROFILE env var
});

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Function to create image prompt from story node
function createImagePrompt(nodeId, nodeData) {
    // Always use the image-text from the node
    if (!nodeData['image-text']) {
        throw new Error(`Node ${nodeId} is missing image-text attribute`);
    }

    // Use the exact image-text and append Arcane League of Legends style
    const prompt = nodeData['image-text'] + '. style of arcane league of legends';

    return prompt;
}

// Function to generate image using Nova Canvas
async function generateImage(nodeId, prompt) {
    try {
        console.log(`🎨 Generating image for node: ${nodeId}`);
        console.log(`📝 Prompt: ${prompt.substring(0, 100)}...`);

        const requestBody = {
            taskType: "TEXT_IMAGE",
            textToImageParams: {
                text: prompt
            },
            imageGenerationConfig: {
                numberOfImages: 1,
                height: 1024,
                width: 1024,
                cfgScale: 8.0,
                seed: Math.floor(Math.random() * 1000000)
            }
        };

        const command = new InvokeModelCommand({
            modelId: MODEL_ID,
            body: JSON.stringify(requestBody),
            contentType: 'application/json',
            accept: 'application/json'
        });

        const response = await bedrockClient.send(command);
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));

        if (responseBody.images && responseBody.images.length > 0) {
            // Save the image
            const imageData = responseBody.images[0];
            const imageBuffer = Buffer.from(imageData, 'base64');
            const imagePath = path.join(OUTPUT_DIR, `${nodeId}.png`);

            fs.writeFileSync(imagePath, imageBuffer);
            console.log(`✅ Image saved: ${imagePath}`);

            return imagePath;
        } else {
            throw new Error('No images returned from Nova Canvas');
        }

    } catch (error) {
        console.error(`❌ Error generating image for ${nodeId}:`, error.message);
        return null;
    }
}

// Main function to process all story nodes
async function generateAllImages() {
    try {
        console.log('🚀 Starting image generation for Wiggly\'s Diamond Quest...\n');

        // Read story data
        const storyPath = path.join(__dirname, 'public', 'story.json');
        const storyContent = fs.readFileSync(storyPath, 'utf8');
        const story = JSON.parse(storyContent);

        const allNodes = Object.keys(story.nodes);
        
        // Filter out nodes that already have images
        const nodes = allNodes.filter(nodeId => {
            const imagePath = path.join(OUTPUT_DIR, `${nodeId}.png`);
            const imageExists = fs.existsSync(imagePath);
            if (imageExists) {
                console.log(`⏭️  Skipping ${nodeId} - image already exists`);
            }
            return !imageExists;
        });
        
        console.log(`📖 Found ${allNodes.length} total nodes, ${nodes.length} need images\n`);
        
        if (nodes.length === 0) {
            console.log('🎉 All images already generated!');
            return;
        }

        const results = [];
        let successCount = 0;
        let failCount = 0;

        // Process nodes in batches to avoid rate limiting
        const batchSize = 3;
        for (let i = 0; i < nodes.length; i += batchSize) {
            const batch = nodes.slice(i, i + batchSize);

            console.log(`\n📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(nodes.length / batchSize)}`);
            console.log(`   Nodes: ${batch.join(', ')}`);

            const batchPromises = batch.map(async (nodeId) => {
                const nodeData = story.nodes[nodeId];
                const prompt = createImagePrompt(nodeId, nodeData);
                const imagePath = await generateImage(nodeId, prompt);

                if (imagePath) {
                    successCount++;
                    return { nodeId, success: true, path: imagePath, prompt };
                } else {
                    failCount++;
                    return { nodeId, success: false, prompt };
                }
            });

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);

            // Add delay between batches to respect rate limits
            if (i + batchSize < nodes.length) {
                console.log('⏳ Waiting 5 seconds before next batch...');
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        // Generate summary report
        const reportPath = path.join(OUTPUT_DIR, 'generation-report.json');
        const report = {
            timestamp: new Date().toISOString(),
            totalNodes: allNodes.length,
            processedNodes: nodes.length,
            skippedNodes: allNodes.length - nodes.length,
            successCount,
            failCount,
            results: results
        };

        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

        console.log('\n🎉 Image generation complete!');
        console.log(`📊 Results: ${successCount} successful, ${failCount} failed, ${allNodes.length - nodes.length} skipped`);
        console.log(`📁 Images saved to: ${OUTPUT_DIR}`);
        console.log(`📋 Report saved to: ${reportPath}`);

        if (failCount > 0) {
            console.log('\n❌ Failed nodes:');
            results.filter(r => !r.success).forEach(r => {
                console.log(`   - ${r.nodeId}`);
            });
        }

    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        process.exit(1);
    }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
    generateAllImages();
}

export { generateAllImages, createImagePrompt };