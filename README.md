# SillyTavern Persona Generator Extension

Generate personas from character cards using AI, directly inside SillyTavern.

## Features

- **Multiple AI Providers** - Uses SillyTavern's configured API (OpenAI, Anthropic, Groq, etc.)
- **Auto-detect Character** - Automatically detects the current character
- **Multiple Characters** - Select from any loaded character
- **4 Prompt Styles** - Narrative, Structured, Profile, Dialogue
- **Person Options** - First person or third person perspective
- **Dark Theme** - Matches SillyTavern's dark theme

## Installation

### Method 1: Via Git (Recommended)

1. Open SillyTavern
2. Go to Extensions > Install Extensions
3. Enter the repository URL:
   ```
   https://github.com/rafaelramalheteagls-cmd/sillytavern-extension-persona-generator.git
   ```
4. Click Install

### Method 2: Manual Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/rafaelramalheteagls-cmd/sillytavern-extension-persona-generator.git
   ```
2. Copy the folder to `SillyTavern/public/scripts/extensions/third-party/`
3. Restart SillyTavern

## Usage

### Via Slash Command

Type `/persona-gen` in the chat input to open the Persona Generator.

### Via Extension Settings

1. Go to Extensions > Persona Generator
2. Click "Open Persona Generator"

### Via UI

1. Click the extension icon in the toolbar (if available)

## How It Works

1. **Select Character** - Choose which character to generate a persona for
2. **Configure Options** - Set gender, age, species, prompt style, and person
3. **Generate** - Click "Generate Persona" to create the persona
4. **Save** - Download the persona as a JSON file or copy to clipboard
5. **Import** - Import the JSON file into SillyTavern as a persona

## Prompt Styles

| Style | Description |
|-------|-------------|
| **Narrative** | Natural, flowing first/third person narrative |
| **Structured** | XML-tagged sections with detailed breakdown |
| **Profile** | Character sheet format with fields |
| **Dialogue** | Spoken dialogue format |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Default Prompt Style | Structured | Default style for new generations |
| Default Person | First person | Default narrative perspective |
| Default Gender | Male | Default gender for personas |
| Default Age | 25 | Default age for personas |
| Default Species | Human | Default species/race |

## Compatibility

- SillyTavern Version: 1.0.0+
- Works with: Chat Completion API, Text Completion API

## License

MIT License
