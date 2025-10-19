# Interactive Story Collection

## 🎮 [**PLAY LIVE →**](https://wigglys-diamond-quest.netlify.app/)

![Cover](public/preview.png)

A collection of interactive story games/books created by my son and me. Stories are generated using Claude AI, guided by my son's creative ideas. Currently featuring **Wiggly's Diamond Quest** - follow Wiggly (a boy with crazy hair and a rainbow t-shirt) as he helps recover stolen diamonds from a museum by exploring different themed rooms and making choices.

The platform supports multiple stories with a story selection interface and individual story experiences.

## Features

- **Multi-Story Platform**: Story selection interface with individual story experiences
- **Interactive Web Games**: Play through stories with choices that affect the outcome
- **AI-Generated Images**: Uses AWS Bedrock Nova Canvas to generate Arcane League of Legends style illustrations for each scene
- **PDF Book Generation**: Creates printable books in two formats per story:
  - Readable version (normal page order)
  - Booklet version (reordered for 4-up printing and folding)
- **Story Visualization**: D3.js graph showing the decision tree structure and node validation

## Project Structure

Stories are organized in individual folders under `public/[story-id]/` containing:
- `story.json` - Story definition and structure
- `cover.png` - Story cover image
- `generated-images/` - AI-generated scene illustrations

Each story is defined with this structure:

```json
{
  "startNode": "start",
  "nodes": {
    "node_id": {
      "text": "Story text for this scene",
      "image-text": "Description for AI image generation",
      "choices": [
        { "text": "Choice description", "next": "next_node_id" }
      ],
      "isEnd": true  // Optional, marks ending nodes
    }
  }
}
```

## AWS Integration

Images are generated using AWS Bedrock's Nova Canvas model with prompts optimized for the Arcane art style. 

```bash
# Generate images for specific story
node generate-images.js [story-id]

# Generate images for Wiggly's Diamond Quest
node generate-images.js wigglys-diamond-quest
```

## PDF Generation

The PDF generator creates A5 format books with:
- Chelsea Market font
- Page numbers in squares (alternating left/right)
- Two versions per story: readable and booklet (for 4-up printing)

```bash
# Generate PDFs for specific story
node generate-pdf.js [story-id]

# Generate PDFs for Wiggly's Diamond Quest
node generate-pdf.js wigglys-diamond-quest
```

For home printing: Use the booklet version, print 4-up, flip paper, print reverse, cut in half, and stack for correct page order.

## Quick Start

```bash
npm install
npm run dev
```

Visit the web interface to play the game or use the visualization tab to explore the story structure.