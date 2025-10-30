#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { jsPDF } from 'jspdf';
import './ChelseaMarket-Regular-normal.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get story ID from command line argument
const storyId = process.argv[2];

// Configuration
const STORY_DIR = path.join(__dirname, 'public', storyId);
const OUTPUT_FILE_BASE = storyId.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('-');
const IMAGES_DIR = path.join(STORY_DIR, 'generated-images');

class StoryBookGenerator {
    constructor() {
        // A5 dimensions in mm (148 x 210)
        this.pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a5'
        });

        this.pageWidth = 148;
        this.pageHeight = 210;
        this.margin = 7;
        this.contentWidth = this.pageWidth - (this.margin * 2);
        this.contentHeight = this.pageHeight - (this.margin * 2);

        this.story = null;
        this.nodeToPageMap = {};
        this.pageNumber = 0;
        this.chelseaMarketLoaded = false;
    }

    async generateBook() {
        try {
            console.log('📚 Starting PDF book generation...\n');

            // Setup custom font
            await this.setupCustomFont();

            // Load story data
            await this.loadStory();

            // Create node to page mapping
            this.createPageMapping();

            // Generate cover page
            this.generateCoverPage();

            // Generate story pages
            await this.generateStoryPages();

            // Save readable version first
            this.savePDF('readable');

            // Create and save booklet version
            await this.createBookletVersion();

            // Save booklet version
            this.savePDF('booklet');

            console.log('\n🎉 PDF book generation complete!');

        } catch (error) {
            console.error('❌ Error generating PDF book:', error.message);
            process.exit(1);
        }
    }

    async setupCustomFont() {
        try {
            console.log('🎨 Setting up Chelsea Market font for PDF...');

            // The Chelsea Market font should now be available through the imported file
            // Check if it's loaded properly
            this.chelseaMarketLoaded = true;
            console.log('✅ Chelsea Market font loaded successfully!');

        } catch (error) {
            console.log('⚠️ Font setup failed, using fallback fonts:', error.message);
            this.chelseaMarketLoaded = false;
        }
    }

    getChelseaMarketFont(style = 'normal') {
        if (this.chelseaMarketLoaded) {
            // Use the actual Chelsea Market font
            return { font: 'ChelseaMarket-Regular', style: 'normal' };
        } else {
            // Fallback to Times Roman which has more character than Helvetica
            if (style === 'bold') {
                return { font: 'times', style: 'bold' };
            } else if (style === 'italic') {
                return { font: 'times', style: 'italic' };
            } else {
                return { font: 'times', style: 'normal' };
            }
        }
    }



    async loadStory() {
        const storyPath = path.join(STORY_DIR, 'story.json');
        const storyContent = fs.readFileSync(storyPath, 'utf8');
        this.story = JSON.parse(storyContent);
        console.log(`📖 Loaded story with ${Object.keys(this.story.nodes).length} nodes`);
    }

    createPageMapping() {
        const nodeIds = Object.keys(this.story.nodes);

        // Find end nodes (exclude bad endings - they should be randomized)
        const endNodes = nodeIds.filter(id => this.story.nodes[id].isEnd && !this.story.nodes[id].badEnding);

        // Start node gets page 1, others in seeded random order, end nodes last
        const middleNodes = nodeIds.filter(id =>
            id !== this.story.startNode && (!this.story.nodes[id].isEnd || this.story.nodes[id].badEnding)
        );

        // Seeded random shuffle using simple LCG
        const shuffleWithSeed = (array, seed = 42) => {
            const shuffled = [...array];
            let rng = seed;
            for (let i = shuffled.length - 1; i > 0; i--) {
                rng = (rng * 1664525 + 1013904223) % 4294967296;
                const j = Math.floor((rng / 4294967296) * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            return shuffled;
        };

        const randomMiddleNodes = shuffleWithSeed(middleNodes);
        const sortedNodes = [this.story.startNode, ...randomMiddleNodes, ...endNodes];

        sortedNodes.forEach((nodeId, index) => {
            this.nodeToPageMap[nodeId] = index + 1; // Pages start at 1
        });

        console.log(`🗺️  Created page mapping for ${sortedNodes.length} pages`);
    }

    generateCoverPage() {
        this.pageNumber++;

        try {
            // Use the cover image from story directory
            const coverImagePath = path.join(STORY_DIR, 'cover.png');

            if (fs.existsSync(coverImagePath)) {
                // Read cover image as base64
                const imageData = fs.readFileSync(coverImagePath);
                const base64Image = `data:image/png;base64,${imageData.toString('base64')}`;

                // Calculate dimensions to fit A5 page (2:3 aspect ratio fits well in A5)
                // A5 is 148x210mm, cover is 2:3 ratio
                // We'll use most of the page with some margin
                const margin = 10;
                const availableWidth = this.pageWidth - (margin * 2);
                const availableHeight = this.pageHeight - (margin * 2);

                // Calculate size maintaining 2:3 aspect ratio
                let imgWidth, imgHeight;
                const coverAspectRatio = 2 / 3; // width:height = 2:3

                if (availableWidth / availableHeight < coverAspectRatio) {
                    // Width is the limiting factor
                    imgWidth = availableWidth;
                    imgHeight = availableWidth / coverAspectRatio;
                } else {
                    // Height is the limiting factor
                    imgHeight = availableHeight;
                    imgWidth = imgHeight * coverAspectRatio;
                }

                // Center the image on the page
                const imgX = (this.pageWidth - imgWidth) / 2;
                const imgY = (this.pageHeight - imgHeight) / 2;

                // Add the cover image
                this.pdf.addImage(base64Image, 'PNG', imgX, imgY, imgWidth, imgHeight);

                console.log('📄 Generated cover page with cover.png');
            } else {
                throw new Error('Cover image not found');
            }

        } catch (error) {
            console.log(`⚠️ Could not load cover image: ${error.message}`);
            console.log('📄 Generating text-based cover page as fallback');

            // Fallback to simple text cover
            this.pdf.setTextColor(102, 126, 234);
            this.pdf.setFontSize(24);
            const titleFont = this.getChelseaMarketFont('bold');
            this.pdf.setFont(titleFont.font, titleFont.style);
            this.pdf.text("Wiggly's Diamond Quest", this.pageWidth / 2, this.pageHeight / 2, { align: 'center' });
        }
    }

    async generateStoryPages() {
        const nodeIds = Object.keys(this.story.nodes);

        // Find end nodes (exclude bad endings - they should be randomized)
        const endNodes = nodeIds.filter(id => this.story.nodes[id].isEnd && !this.story.nodes[id].badEnding);

        // Start node gets page 1, others in seeded random order, end nodes last
        const middleNodes = nodeIds.filter(id =>
            id !== this.story.startNode && (!this.story.nodes[id].isEnd || this.story.nodes[id].badEnding)
        );

        // Seeded random shuffle using simple LCG
        const shuffleWithSeed = (array, seed = 42) => {
            const shuffled = [...array];
            let rng = seed;
            for (let i = shuffled.length - 1; i > 0; i--) {
                rng = (rng * 1664525 + 1013904223) % 4294967296;
                const j = Math.floor((rng / 4294967296) * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            return shuffled;
        };

        const randomMiddleNodes = shuffleWithSeed(middleNodes);
        const sortedNodes = [this.story.startNode, ...randomMiddleNodes, ...endNodes];

        for (const nodeId of sortedNodes) {
            await this.generateStoryPage(nodeId);
        }
    }

    async generateStoryPage(nodeId, switchPageSides = false) {
        const node = this.story.nodes[nodeId];
        const pageNum = this.nodeToPageMap[nodeId];

        // Add new page (except for first story page)
        if (pageNum > 0) {
            this.pdf.addPage();
        }

        console.log(`📄 Generating page ${pageNum}: ${nodeId}`);

        let yPos = this.margin;

        // Page number at bottom (odd pages on right, even pages on left)
        this.pdf.setTextColor(0, 0, 0); // Black color
        this.pdf.setFontSize(10);
        const pageFont = this.getChelseaMarketFont('normal');
        this.pdf.setFont(pageFont.font, pageFont.style);
        this.pdf.setFontSize(16);
        const bottomY = this.pageHeight - 10; // 10mm from bottom

        // Square dimensions
        const squareSize = 8;
        const squareY = bottomY - 6;

        const isOddPage = switchPageSides ? (pageNum % 2 === 0) : (pageNum % 2 === 1);

        if (isOddPage) {
            // Odd pages: number on the right (or left if switchPageSides is true)
            const squareX = this.pageWidth - this.margin - squareSize;
            this.pdf.setDrawColor(0, 0, 0);
            this.pdf.setLineWidth(0.5);
            this.pdf.rect(squareX, squareY, squareSize, squareSize);
            this.pdf.text(`${pageNum}`, this.pageWidth - this.margin - (squareSize / 2), bottomY, { align: 'center' });
        } else {
            // Even pages: number on the left (or right if switchPageSides is true)
            const squareX = this.margin;
            this.pdf.setDrawColor(0, 0, 0);
            this.pdf.setLineWidth(0.5);
            this.pdf.rect(squareX, squareY, squareSize, squareSize);
            this.pdf.text(`${pageNum}`, this.margin + (squareSize / 2), bottomY, { align: 'center' });
        }

        // yPos += 10;

        // Try to add image
        const imagePath = path.join(IMAGES_DIR, `${nodeId}.png`);
        if (fs.existsSync(imagePath)) {
            try {
                // Read image as base64
                const imageData = fs.readFileSync(imagePath);
                const base64Image = `data:image/png;base64,${imageData.toString('base64')}`;

                // Add image (centered, max width 80mm, max height 60mm)
                const imgWidth = 80;
                const imgHeight = 80;
                const imgX = (this.pageWidth - imgWidth) / 2;

                this.pdf.addImage(base64Image, 'PNG', imgX, yPos, imgWidth, imgHeight);
                yPos += imgHeight + 10;
            } catch (error) {
                console.log(`⚠️  Could not add image for ${nodeId}: ${error.message}`);
                yPos += 10;
            }
        }

        // Story text - using Chelsea Market style
        this.pdf.setTextColor(0, 0, 0); // Reset to black
        this.pdf.setFontSize(12);
        const storyFont = this.getChelseaMarketFont('normal');
        this.pdf.setFont(storyFont.font, storyFont.style);

        // Clean up text (remove emojis for PDF)
        let cleanText = node.text
            .replace(/🚨 /g, '')
            .replace(/🚨/g, '')
            .replace(/🦕/g, '')
            .replace(/💎/g, '')
            .replace(/⚔️/g, '')
            .replace(/🏺/g, '')
            .replace(/🚀/g, '')
            .replace(/🎉/g, '')
            .replace(/'/g, "'")
            .replace(/'/g, "'")
            .replace(/"/g, '"')
            .replace(/"/g, '"');

        // Split text into lines that fit
        const lines = this.pdf.splitTextToSize(cleanText, this.contentWidth);

        // Add text lines
        lines.forEach(line => {
            if (yPos > this.pageHeight - 40) { // Leave space for choices
                this.pdf.addPage();
                yPos = this.margin;
            }
            this.pdf.text(line, this.margin, yPos);
            yPos += 6;
        });

        yPos += 10;

        // Add item collection notice
        if (node.collectItem) {
            this.pdf.setTextColor(0, 100, 0); // Dark green color
            this.pdf.setFontSize(11);
            const itemFont = this.getChelseaMarketFont('bold');
            this.pdf.setFont(itemFont.font, itemFont.style);

            if (yPos > this.pageHeight - this.margin - 10) {
                this.pdf.addPage();
                yPos = this.margin;
            }

            const itemText = `You gained: ${this.getItemDisplayName(node.collectItem)}`;
            this.pdf.text(itemText, this.margin, yPos);
            yPos += 8;

            // Reset color back to black
            this.pdf.setTextColor(0, 0, 0);
        }

        // Add choices/actions
        if (node.roll) {
            // Handle dice roll mechanic
            this.pdf.setTextColor(0, 0, 0);
            this.pdf.setFontSize(12);
            const rollFont = this.getChelseaMarketFont('bold');
            this.pdf.setFont(rollFont.font, rollFont.style);

            if (yPos > this.pageHeight - this.margin - 15) {
                this.pdf.addPage();
                yPos = this.margin;
            }

            // Clean roll text
            const cleanRollText = node.roll.text.replace(/🎲/g, 'Roll dice:');
            this.pdf.text(cleanRollText, this.margin, yPos);
            yPos += 8;

            // Add outcomes
            this.pdf.setFontSize(10);
            const outcomeFont = this.getChelseaMarketFont('normal');
            this.pdf.setFont(outcomeFont.font, outcomeFont.style);

            node.roll.outcomes.forEach((outcome) => {
                const targetPage = this.nodeToPageMap[outcome.next] || '?';
                const outcomeText = `${outcome.range}: ${outcome.text}`;
                const pageText = `Page ${targetPage}`;

                if (yPos > this.pageHeight - this.margin - 10) {
                    this.pdf.addPage();
                    yPos = this.margin;
                }

                // Calculate available width for outcome text (leave space for page number)
                const pageTextWidth = this.pdf.getTextWidth(pageText);
                const availableOutcomeWidth = this.contentWidth - pageTextWidth - 10; // 10mm gap

                // Split outcome text if it's too long
                const outcomeLines = this.pdf.splitTextToSize(outcomeText, availableOutcomeWidth);

                this.pdf.text(outcomeLines, this.margin, yPos);
                this.pdf.text(pageText, this.pageWidth - this.margin, yPos, { align: 'right' });

                // Adjust yPos based on number of lines
                yPos += Math.max(5, outcomeLines.length * 5);
            });
        } else if (node.choices && node.choices.length > 0) {
            this.pdf.setTextColor(0, 0, 0); // Black color
            this.pdf.setFontSize(12);
            const choiceFont = this.getChelseaMarketFont('normal');
            this.pdf.setFont(choiceFont.font, choiceFont.style);

            // Seeded random shuffle for choices
            const shuffleWithSeed = (array, seed = 42) => {
                const shuffled = [...array];
                let rng = seed;
                for (let i = shuffled.length - 1; i > 0; i--) {
                    rng = (rng * 1664525 + 1013904223) % 4294967296;
                    const j = Math.floor((rng / 4294967296) * (i + 1));
                    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                }
                return shuffled;
            };

            const shuffledChoices = shuffleWithSeed(node.choices);
            shuffledChoices.forEach((choice, index) => {
                const targetPage = this.nodeToPageMap[choice.next] || '?';
                let choiceText = `> ${choice.text}`;

                // Add item requirement/usage indicator
                if (choice.item) {
                    const itemName = this.getItemDisplayName(choice.item);
                    choiceText += ` (${itemName} is needed)`;
                }

                const pageText = `Page ${targetPage}`;

                if (yPos > this.pageHeight - this.margin - 10) {
                    this.pdf.addPage();
                    yPos = this.margin;
                }

                // Calculate available width for choice text (leave space for page number)
                const pageTextWidth = this.pdf.getTextWidth(pageText);
                const availableChoiceWidth = this.contentWidth - pageTextWidth - 10; // 10mm gap

                // Split choice text if it's too long
                const choiceLines = this.pdf.splitTextToSize(choiceText, availableChoiceWidth);

                // Choice text on the left
                this.pdf.text(choiceLines, this.margin, yPos);

                // Page number on the right
                this.pdf.text(pageText, this.pageWidth - this.margin, yPos, { align: 'right' });

                // Adjust yPos based on number of lines
                yPos += Math.max(6, choiceLines.length * 6); // Space between choices
            });
        } else if (node.isEnd) {
            // Add decorative border for ending
            let endingText = ''
            if (node.badEnding) {
                this.pdf.setDrawColor(215, 30, 0); // Red color
                endingText = 'Better luck next time!'
            } else {
                this.pdf.setDrawColor(255, 215, 0); // Gold color
                endingText = 'Thanks for playing!'
            }

            this.pdf.setLineWidth(1);
            this.pdf.rect(this.margin, yPos - 5, this.contentWidth, 25);

            this.pdf.setTextColor(0, 0, 0); // Black color
            this.pdf.setFontSize(16);
            const endFont = this.getChelseaMarketFont('bold');
            this.pdf.setFont(endFont.font, endFont.style);
            this.pdf.text('THE END', this.pageWidth / 2, yPos + 8, { align: 'center' });
            yPos += 15;
            this.pdf.setTextColor(0, 0, 0); // Black color
            this.pdf.setFontSize(12);
            const thankFont = this.getChelseaMarketFont('normal');
            this.pdf.setFont(thankFont.font, thankFont.style);
            this.pdf.text('Thank you for playing!', this.pageWidth / 2, yPos, { align: 'center' });
        }
    }

    async createBookletVersion() {
        console.log(`📄 Creating booklet version for 4-up printing...`);

        // Create new PDF for booklet
        this.pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a5'
        });

        // Setup font again for new PDF
        await this.setupCustomFont();

        // Get all node IDs in the same order as readable version
        const nodeIds = Object.keys(this.story.nodes);
        const endNodes = nodeIds.filter(id => this.story.nodes[id].isEnd && !this.story.nodes[id].badEnding);
        const middleNodes = nodeIds.filter(id =>
            id !== this.story.startNode && (!this.story.nodes[id].isEnd || this.story.nodes[id].badEnding)
        );

        const shuffleWithSeed = (array, seed = 42) => {
            const shuffled = [...array];
            let rng = seed;
            for (let i = shuffled.length - 1; i > 0; i--) {
                rng = (rng * 1664525 + 1013904223) % 4294967296;
                const j = Math.floor((rng / 4294967296) * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            return shuffled;
        };

        const randomMiddleNodes = shuffleWithSeed(middleNodes);
        const readableOrder = [this.story.startNode, ...randomMiddleNodes, ...endNodes];

        // Calculate total pages needed (cover + story pages, rounded up to multiple of 8)
        const totalStoryPages = readableOrder.length;
        const totalPages = totalStoryPages + 1; // +1 for cover
        const pagesNeeded = Math.ceil(totalPages / 8) * 8;

        // Create booklet page order for 8-page sequence
        const bookletOrder = [];

        for (let group = 0; group < pagesNeeded / 8; group++) {
            const basePageNum = group * 8;

            // 8-page sequence: 0,1,6,7,2,3,4,5 (adding 1 since PDF pages are 1-indexed)
            bookletOrder.push(basePageNum + 0); // 0 -> page 1
            bookletOrder.push(basePageNum + 6); // 1 -> page 2  
            bookletOrder.push(basePageNum + 3); // 6 -> page 7
            bookletOrder.push(basePageNum + 5); // 7 -> page 8
            bookletOrder.push(basePageNum + 2); // 2 -> page 3
            bookletOrder.push(basePageNum + 4); // 3 -> page 4
            bookletOrder.push(basePageNum + 1); // 4 -> page 5
            bookletOrder.push(basePageNum + 7); // 5 -> page 6
        }

        // Generate pages in booklet order
        for (let i = 0; i < bookletOrder.length; i++) {
            const pageNum = bookletOrder[i] + 1;

            // if (i > 0) {
            //     this.pdf.addPage();
            // }

            if (pageNum === 1) {
                // Cover page
                this.generateCoverPage();
            } else if (pageNum <= totalPages) {
                // Story page
                const nodeIndex = pageNum - 2; // -2 because cover is page 1, story starts at page 2
                if (nodeIndex >= 0 && nodeIndex < readableOrder.length) {
                    const nodeId = readableOrder[nodeIndex];
                    await this.generateStoryPage(nodeId, true);
                }
            }
            // Pages beyond totalPages are automatically blank
        }

        console.log(`✅ Booklet version created with ${this.pdf.getNumberOfPages()} pages`);
    }

    getItemDisplayName(itemId) {
        const displayNames = {
            'magic_flowers': 'Magic Flowers',
            'glowing_crystals': 'Glowing Crystals',
            'ancient_knowledge': 'Ancient Knowledge',
            'Map of the land': 'Map of the Land'
        };
        return displayNames[itemId] || itemId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    savePDF(version = 'readable') {
        const filename = version === 'booklet'
            ? `${OUTPUT_FILE_BASE}-Book-BOOKLET.pdf`
            : `${OUTPUT_FILE_BASE}-Book-READABLE.pdf`;

        this.pdf.save(filename);
        console.log(`💾 ${version} PDF saved: ${filename} (${this.pdf.getNumberOfPages()} pages)`);
    }
}

// Run the generator
if (import.meta.url === `file://${process.argv[1]}`) {
    const generator = new StoryBookGenerator();
    generator.generateBook();
}

export { StoryBookGenerator };