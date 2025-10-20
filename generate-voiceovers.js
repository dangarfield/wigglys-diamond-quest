#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    PollyClient,
    SynthesizeSpeechCommand
} from '@aws-sdk/client-polly';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get story ID from command line argument
const storyId = process.argv[2]

// Configuration
const STORY_DIR = path.join(__dirname, 'public', storyId);
const OUTPUT_DIR = path.join(STORY_DIR, 'generated-voiceovers');
const AWS_REGION = 'us-east-1';

// Initialize AWS Polly client
const pollyClient = new PollyClient({
    region: AWS_REGION
    // Will use default credential chain
});

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Function to clean text for speech synthesis
function cleanTextForSpeech(text) {
    return text
        .replace(/🚨/g, '')
        .replace(/🦕/g, '')
        .replace(/💎/g, '')
        .replace(/⚔️/g, '')
        .replace(/🏺/g, '')
        .replace(/🚀/g, '')
        .replace(/🎉/g, '')
        .replace(/🎲/g, '')
        .replace(/'/g, "'") // Fix smart quotes
        .replace(/'/g, "'")
        .replace(/"/g, '"')
        .replace(/"/g, '"');
}

// Function to generate voiceover using Amazon Polly
async function generateVoiceover(nodeId, text) {
    try {
        console.log(`🎙️ Generating voiceover for node: ${nodeId}`);
        console.log(`📝 Text: ${text.substring(0, 100)}...`);

        const cleanText = cleanTextForSpeech(text);

        const command = new SynthesizeSpeechCommand({
            Text: cleanText,
            OutputFormat: 'mp3',
            VoiceId: 'Danielle',
            Engine: 'generative',
            LanguageCode: 'en-US'
        });

        const response = await pollyClient.send(command);

        if (response.AudioStream) {
            // Convert the stream to a buffer
            const chunks = [];
            for await (const chunk of response.AudioStream) {
                chunks.push(chunk);
            }
            const audioBuffer = Buffer.concat(chunks);

            // Save the audio file
            const audioPath = path.join(OUTPUT_DIR, `${nodeId}.mp3`);
            fs.writeFileSync(audioPath, audioBuffer);
            console.log(`✅ Voiceover saved: ${audioPath}`);

            return audioPath;
        } else {
            throw new Error('No audio stream returned from Polly');
        }

    } catch (error) {
        console.error(`❌ Error generating voiceover for ${nodeId}:`, error.message);
        return null;
    }
}

// Main function to process story nodes (limited to first 2)
async function generateAllVoiceovers() {
    try {
        console.log(`🚀 Starting voiceover generation for story: ${storyId}...\n`);

        // Read story data
        const storyPath = path.join(STORY_DIR, 'story.json');
        const storyContent = fs.readFileSync(storyPath, 'utf8');
        const story = JSON.parse(storyContent);

        const allNodes = Object.keys(story.nodes);

        // Filter out nodes that already have voiceovers
        const nodes = allNodes.filter(nodeId => {
            const audioPath = path.join(OUTPUT_DIR, `${nodeId}.mp3`);
            const audioExists = fs.existsSync(audioPath);
            if (audioExists) {
                console.log(`⏭️  Skipping ${nodeId} - voiceover already exists`);
            }
            return !audioExists;
        });

        console.log(`📖 Found ${allNodes.length} total nodes, ${nodes.length} need voiceovers\n`);

        if (nodes.length === 0) {
            console.log('🎉 All voiceovers already generated!');
            return;
        }

        const results = [];
        let successCount = 0;
        let failCount = 0;

        // Process nodes sequentially to avoid rate limiting
        for (const nodeId of nodes) {
            const nodeData = story.nodes[nodeId];
            const audioPath = await generateVoiceover(nodeId, nodeData.text);

            if (audioPath) {
                successCount++;
                results.push({ nodeId, success: true, path: audioPath });
            } else {
                failCount++;
                results.push({ nodeId, success: false });
            }

            // Add delay between requests to respect rate limits
            // if (nodeId !== nodes[nodes.length - 1]) {
            //     console.log('⏳ Waiting 2 seconds before next voiceover...');
            //     await new Promise(resolve => setTimeout(resolve, 2000));
            // }
        }

        console.log('\n🎉 Voiceover generation complete!');
        console.log(`📊 Results: ${successCount} successful, ${failCount} failed`);
        console.log(`📁 Voiceovers saved to: ${OUTPUT_DIR}`);

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
    generateAllVoiceovers();
}

export { generateAllVoiceovers, cleanTextForSpeech };