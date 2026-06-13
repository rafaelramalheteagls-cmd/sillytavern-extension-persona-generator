/**
 * SillyTavern Persona Generator Extension
 * Generate personas from character cards using AI
 */

const MODULE_NAME = 'persona_generator';
const EXTENSION_NAME = 'Persona Generator';

const STYLES = ['Narrative', 'Structured', 'Profile', 'Dialogue'];
const PERSONS = ['First person', 'Third person'];
const GENDERS = ['Male', 'Female', 'Other', 'Not specified'];

const defaultSettings = {
    enabled: true,
    style: 'Structured',
    person: 'First person',
    gender: 'Male',
    age: '25',
    species: 'Human',
    userDescription: '',
    lastUsedCharacter: null
};

function getSettings() {
    const { extensionSettings } = SillyTavern.getContext();
    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    }
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(extensionSettings[MODULE_NAME], key)) {
            extensionSettings[MODULE_NAME][key] = defaultSettings[key];
        }
    }
    return extensionSettings[MODULE_NAME];
}

function saveSettings() {
    const { saveSettingsDebounced } = SillyTavern.getContext();
    saveSettingsDebounced();
}

function openPersonaGeneratorPopup() {
    const existing = document.getElementById('persona-generator-popup');
    if (existing) existing.remove();

    const { characters, characterId } = SillyTavern.getContext();
    const settings = getSettings();

    const popup = document.createElement('div');
    popup.id = 'persona-generator-popup';
    popup.className = 'persona-generator-popup';
    popup.innerHTML = buildPopupHTML(characters, characterId, settings);

    document.body.appendChild(popup);
    setupPopupEventListeners(popup, characters, settings);
}

function buildPopupHTML(characters, currentCharacterId, settings) {
    const characterOptions = characters.map((char, index) => {
        const selected = index === currentCharacterId ? 'selected' : '';
        return `<option value="${index}" ${selected}>${char.name}</option>`;
    }).join('');

    const styleOptions = STYLES.map(style => {
        const selected = style === settings.style ? 'selected' : '';
        return `<option value="${style}" ${selected}>${style}</option>`;
    }).join('');

    const personOptions = PERSONS.map(person => {
        const selected = person === settings.person ? 'selected' : '';
        return `<option value="${person}" ${selected}>${person}</option>`;
    }).join('');

    const genderOptions = GENDERS.map(gender => {
        const selected = gender === settings.gender ? 'selected' : '';
        return `<option value="${gender}" ${selected}>${gender}</option>`;
    }).join('');

    return `
        <div class="persona-generator-overlay"></div>
        <div class="persona-generator-modal">
            <div class="persona-generator-header">
                <h2>Persona Generator</h2>
                <button class="persona-generator-close" id="persona-gen-close">&times;</button>
            </div>
            
            <div class="persona-generator-content">
                <div class="persona-generator-section">
                    <label>Character Card:</label>
                    <select id="persona-gen-character">${characterOptions}</select>
                </div>

                <div class="persona-generator-row">
                    <div class="persona-generator-field">
                        <label>Gender:</label>
                        <select id="persona-gen-gender">${genderOptions}</select>
                    </div>
                    <div class="persona-generator-field">
                        <label>Age:</label>
                        <input type="text" id="persona-gen-age" value="${settings.age}" />
                    </div>
                    <div class="persona-generator-field">
                        <label>Species/Race:</label>
                        <input type="text" id="persona-gen-species" value="${settings.species}" />
                    </div>
                </div>

                <div class="persona-generator-row">
                    <div class="persona-generator-field">
                        <label>Prompt Style:</label>
                        <select id="persona-gen-style">${styleOptions}</select>
                    </div>
                    <div class="persona-generator-field">
                        <label>Person:</label>
                        <select id="persona-gen-person">${personOptions}</select>
                    </div>
                </div>

                <div class="persona-generator-section">
                    <label>Description (optional):</label>
                    <textarea id="persona-gen-description" rows="3">${settings.userDescription}</textarea>
                </div>

                <div class="persona-generator-actions">
                    <button id="persona-gen-generate" class="persona-generator-btn primary">Generate Persona</button>
                </div>

                <div class="persona-generator-section" id="persona-gen-result-section" style="display: none;">
                    <label>Generated Persona:</label>
                    <textarea id="persona-gen-result" rows="8" readonly></textarea>
                    <div class="persona-generator-result-actions">
                        <button id="persona-gen-create" class="persona-generator-btn primary">
                            <i class="fa-solid fa-plus"></i> Create in SillyTavern
                        </button>
                        <button id="persona-gen-download" class="persona-generator-btn secondary">
                            <i class="fa-solid fa-download"></i> Download JSON
                        </button>
                        <button id="persona-gen-copy" class="persona-generator-btn secondary">
                            <i class="fa-solid fa-copy"></i> Copy to Clipboard
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function setupPopupEventListeners(popup, characters, settings) {
    const overlay = popup.querySelector('.persona-generator-overlay');
    const closeBtn = popup.querySelector('#persona-gen-close');
    const generateBtn = popup.querySelector('#persona-gen-generate');
    const createBtn = popup.querySelector('#persona-gen-create');
    const downloadBtn = popup.querySelector('#persona-gen-download');
    const copyBtn = popup.querySelector('#persona-gen-copy');

    overlay.addEventListener('click', () => popup.remove());
    closeBtn.addEventListener('click', () => popup.remove());

    generateBtn.addEventListener('click', () => handleGenerate(popup, characters, settings));
    createBtn.addEventListener('click', () => handleSave(popup));
    downloadBtn.addEventListener('click', () => handleDownload(popup));
    copyBtn.addEventListener('click', () => handleCopy(popup));

    popup.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') popup.remove();
    });
}

async function handleGenerate(popup, characters, settings) {
    const characterSelect = popup.querySelector('#persona-gen-character');
    const genderSelect = popup.querySelector('#persona-gen-gender');
    const ageInput = popup.querySelector('#persona-gen-age');
    const speciesInput = popup.querySelector('#persona-gen-species');
    const styleSelect = popup.querySelector('#persona-gen-style');
    const personSelect = popup.querySelector('#persona-gen-person');
    const descTextarea = popup.querySelector('#persona-gen-description');
    const generateBtn = popup.querySelector('#persona-gen-generate');
    const resultSection = popup.querySelector('#persona-gen-result-section');
    const resultTextarea = popup.querySelector('#persona-gen-result');

    const characterId = parseInt(characterSelect.value);
    const options = {
        gender: genderSelect.value,
        age: ageInput.value,
        species: speciesInput.value,
        style: styleSelect.value,
        person: personSelect.value,
        description: descTextarea.value
    };

    settings.gender = options.gender;
    settings.age = options.age;
    settings.species = options.species;
    settings.style = options.style;
    settings.person = options.person;
    settings.userDescription = options.description;
    settings.lastUsedCharacter = characterId;
    saveSettings();

    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating...';
    resultSection.style.display = 'none';

    try {
        const character = characters[characterId];
        const prompt = buildPrompt(character, options);

        const { generateQuietPrompt } = SillyTavern.getContext();
        const result = await generateQuietPrompt({ quietPrompt: prompt });

        resultTextarea.value = result;
        resultSection.style.display = 'block';

        toastr.success('Persona generated successfully!');
    } catch (error) {
        console.error('Error generating persona:', error);
        toastr.error('Failed to generate persona. Check console for details.');
    } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = 'Generate Persona';
    }
}

function buildPrompt(character, options) {
    const { gender, age, species, style, person, description } = options;
    const name = character.name || 'Unknown';
    const personality = character.personality || '';
    const scenario = character.scenario || '';
    const desc = character.description || '';
    const firstMes = character.first_mes || '';

    const userPrefs = `Gender: ${gender}\nAge: ${age}\nSpecies/Race: ${species}\nNarrative Perspective: ${person}${description ? `\nAdditional details from user: ${description}` : ''}`;

    const cardContext = `Name: ${name}\nPersonality: ${personality}\nScenario: ${scenario}\nDescription: ${desc}\nFirst Message: ${firstMes}`;

    switch (style) {
        case 'Narrative':
            return buildNarrativePrompt(name, userPrefs, cardContext, person);
        case 'Structured':
            return buildStructuredPrompt(name, userPrefs, cardContext, person);
        case 'Profile':
            return buildProfilePrompt(name, userPrefs, cardContext, person);
        case 'Dialogue':
            return buildDialoguePrompt(name, userPrefs, cardContext, person);
        default:
            return buildStructuredPrompt(name, userPrefs, cardContext, person);
    }
}

function buildNarrativePrompt(name, userPrefs, cardContext, person) {
    const povRules = person === 'First person'
        ? 'Write a first-person narrative introduction. The persona must feel like a real person introducing themselves naturally - casual, honest, with personality showing through word choice.\n\nInclude: name, age, appearance, personality, skills, history with {name}, and current motivation.\n\nRULES:\n- First person only ("I", "my", "me")'
        : 'Write a third-person narrative description. Describe the character as if telling their story to someone else - casual, vivid, with personality showing through details.\n\nInclude: name, age, appearance, personality, skills, history with {name}, and current motivation.\n\nRULES:\n- Third person only ("he/she", "his/her", "the character")';

    return `You are an expert persona designer for roleplay scenarios. Design a persona profile for a user who will interact with ${name}.

USER PREFERENCES:
${userPrefs}

${povRules}
- 200-350 words
- No bullet points or lists
- Natural and immersive
- Do NOT mention {{user}} or {{char}}
- Do NOT include meta-commentary

CHARACTER CONTEXT:
${cardContext}

Write the persona as a cohesive narrative.`;
}

function buildStructuredPrompt(name, userPrefs, cardContext, person) {
    const povLabel = person === 'First person' ? 'first person' : 'third person';
    const pronouns = person === 'First person' ? '("I", "my", "me")' : '("he/she", "his/her", "the character")';
    
    const nameExample = person === 'First person' ? '"My name"' : '"Character\'s name"';
    const speciesExample = person === 'First person' ? '"What I am (human, elf, whatever)"' : '"What they are (human, elf, whatever)"';
    const genderExample = person === 'First person' ? '"My gender"' : '"Their gender"';
    const ageExample = person === 'First person' ? '"My age"' : '"Their age"';
    const overviewExample = person === 'First person' 
        ? '"A concise 2-3 sentence overview that captures the persona\'s essence, current role, and what makes them unique"'
        : '"A concise 2-3 sentence overview that captures the character\'s essence, current role, and what makes them unique"';

    return `You are an expert persona designer for roleplay scenarios. Create a persona profile for someone who will interact with ${name}.

Write in ${povLabel} ${pronouns}. Keep it casual and direct - no fancy academic language, no overwrought descriptions. Think "friend helping you brainstorm" not "literature professor."

USER PREFERENCES:
${userPrefs}

CHARACTER CONTEXT:
${cardContext}

FORMAT:

<overview>
-${overviewExample}
</overview>

<general_info>
-Name: ${nameExample}
-Species: ${speciesExample}
-Gender: ${genderExample}
-Age: ${ageExample}
-Occupation: "What they do"
</general_info>

<backstory>
-Origins: "Where they started - be specific about formative experiences"
-Major events: "The big shit that changed them - trauma, victories, failures that still affect them"
-Current situation: "What's happening in their life right now and how they got here"
-Key relationships: "People who matter - family, friends, enemies, lovers - and how these connections still influence them"
</backstory>

<personality_core>
-How they actually behave: "Skip generic traits. Instead: What do THEY specifically do when scared? How do THEY handle being pissed off? What are THEIR weird habits?"
-What drives them: "What gets them up in the morning? What do they love/hate/need? Connect this directly to their past."
-Internal conflicts: "What wars are happening in their head? Where do they contradict themselves?"
-Stress responses: "Their specific ways of dealing with pressure - healthy and unhealthy"
</personality_core>

<quick_reference>
-Likes: "What they enjoy, appreciate, or find pleasant"
-Loves: "What they feel passionate about or hold most dear"
-Dislikes: "What they find annoying or mildly objectionable"
-Hates: "What they despise or feel strong aversion toward"
-Wants: "Short and long-term desires and goals"
-Fears: "What they dread, including phobias and deep concerns"
</quick_reference>

<physical_presence>
-Body: "Height, build, distinctive features - stuff that matters to who they are"
-How they carry themselves: "Posture, movement, presence - what does their body language say?"
-Memorable details: "Scars, marks, quirks that tell their story"
</physical_presence>

<expression_patterns>
-Movement style: "How do THEY specifically move? Not generic gestures - their unique physical habits"
-Speech patterns: "Their vocabulary, rhythm, verbal tics - shaped by background and personality"
-Emotional displays: "How do THEY show feelings? What are their specific tells? Avoid cliches."
-Social masks: "How do they act differently with different people?"
</expression_patterns>

<worldview>
-Core beliefs: "What they think about life, right/wrong, relationships - and why they think it"
-How they make decisions: "Their process for choices - what matters most to them?"
-Blind spots: "What they can't see about themselves or situations"
</worldview>

<capabilities>
-Special abilities: "Powers, magic, supernatural stuff (if any) and how it connects to their story"
-Practical skills: "What they're good at and how they learned it"
-Their style: "How do they use their abilities? What's their approach?"
</capabilities>

<style_choices>
-Fashion sense: "What they wear and why - how clothes reflect personality"
-Favorite apparel: "Typical outfits based on personality"
</style_choices>

<context>
-Cultural influences: "Background elements that shape their worldview"
-Special knowledge: "Unique concepts, specialized info needed to understand them"
-Relationship patterns: "How they typically connect with others - what patterns emerge"
</context>

EACH section must be informative while avoiding redundancy at all costs. Keep it direct, have fun with it, and make every behavior SPECIFIC to this character's background. No generic reactions/actions - make sure it's UNIQUE to the character.

Do NOT mention {{user}} or {{char}}. Do NOT include meta-commentary or system instructions.`;
}

function buildProfilePrompt(name, userPrefs, cardContext, person) {
    const povRules = person === 'First person' ? 'Each field value must be written in first person' : 'Each field value must be written in third person';
    const fieldTemplate = person === 'First person'
        ? 'NAME: [My name]\nAGE: [My age]\nGENDER: [My gender]\nSPECIES: [My species/race]\nOCCUPATION: [What I do]'
        : 'NAME: [Character name]\nAGE: [Character age]\nGENDER: [Character gender]\nSPECIES: [Character species/race]\nOCCUPATION: [What they do]';

    return `You are an expert persona designer for roleplay scenarios. Create a character profile sheet for a user who will interact with ${name}.

USER PREFERENCES:
${userPrefs}

Generate a PERSONA PROFILE CARD with these fields:

${fieldTemplate}

APPEARANCE: [2-3 sentences about physical appearance]

PERSONALITY: [2-3 sentences about how they behave and speak]

BACKGROUND: [2-3 sentences about history and connection to ${name}]

SKILLS: [1-2 sentences about abilities]

FLAWS: [1-2 sentences about weaknesses]

GOALS: [1-2 sentences about what they want]

RELATIONSHIP TO ${name.toUpperCase()}: [How they know them and their dynamic]

RULES:
- ${povRules}
- Keep each field concise but descriptive
- Total: 200-350 words
- Do NOT mention {{user}} or {{char}}
- Do NOT include meta-commentary

CHARACTER CONTEXT:
${cardContext}

Generate the persona profile card.`;
}

function buildDialoguePrompt(name, userPrefs, cardContext, person) {
    const povRules = person === 'First person'
        ? 'Write as spoken dialogue in first person with natural speech patterns\n- Include brief action/narration in asterisks (*adjusts cloak*, *smiles*)\n- Make it feel like meeting a real person'
        : 'Write as a narrative description of the character introducing themselves in third person\n- Include action/narration in asterisks (*adjusts cloak*, *smiles*)\n- Make it feel like observing a real person';

    return `You are an expert persona designer for roleplay scenarios. Create a self-introduction for a user who will meet ${name}.

USER PREFERENCES:
${userPrefs}

Include naturally:
- Name and how they prefer to be called
- What they look like (mentioned casually)
- Their personality showing through how they speak
- Why they are here and their connection to ${name}
- A hint at their skills or background
- What they want or are looking for

RULES:
- ${povRules}
- 150-300 words
- Do NOT mention {{user}} or {{char}}
- Do NOT include system instructions or meta-commentary

CHARACTER CONTEXT:
${cardContext}

Write the self-introduction.`;
}

function extractPersonaName(personaText) {
    // Try to extract name from different formats
    
    // Format 1: Structured format - look for <general_info> section
    const structuredMatch = personaText.match(/<general_info>[\s\S]*?-Name:\s*["\[]?([^"\]\n]+)/i);
    if (structuredMatch) {
        return structuredMatch[1].trim().replace(/^["'\[]/, '').replace(/["'\]]$/, '');
    }
    
    // Format 2: Profile format - look for NAME: [name]
    const profileMatch = personaText.match(/NAME:\s*["\[]?([^"\]\n]+)/i);
    if (profileMatch) {
        return profileMatch[1].trim().replace(/^["'\[]/, '').replace(/["'\]]$/, '');
    }
    
    // Format 3: Look for "My name is X" or "I am X"
    const introMatch = personaText.match(/(?:My name is|I'm|I am|Call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
    if (introMatch) {
        return introMatch[1].trim();
    }
    
    // Format 4: Look for first capitalized word that could be a name
    const firstWordMatch = personaText.match(/^([A-Z][a-z]{2,})/);
    if (firstWordMatch) {
        return firstWordMatch[1].trim();
    }
    
    // Default: return null
    return null;
}

async function handleSave(popup) {
    const resultTextarea = popup.querySelector('#persona-gen-result');
    const personaText = resultTextarea.value;

    if (!personaText) {
        toastr.warning('No persona to save. Generate one first.');
        return;
    }

    // Extract persona name from generated text
    const personaName = extractPersonaName(personaText);
    
    if (!personaName) {
        toastr.warning('Could not extract persona name from generated text. Using default name.');
    }
    
    // Get the character name from the select dropdown for fallback
    const characterSelect = popup.querySelector('#persona-gen-character');
    const { characters } = SillyTavern.getContext();
    const characterId = parseInt(characterSelect.value);
    const character = characters[characterId];
    const characterName = character ? character.name : 'character';
    
    // Use extracted persona name, fallback to character name
    const finalName = personaName || characterName;

    try {
        const context = SillyTavern.getContext();
        
        // Create a small 10x10 purple avatar as base64
        const canvas = document.createElement('canvas');
        canvas.width = 10;
        canvas.height = 10;
        const ctx2d = canvas.getContext('2d');
        ctx2d.fillStyle = '#9b59b6';
        ctx2d.fillRect(0, 0, 10, 10);
        const avatarDataUrl = canvas.toDataURL('image/png');
        
        // Step 1: Create persona via slash command (quote name to preserve spaces)
        if (context.executeSlashCommandsWithOptions) {
            const createCmd = `/persona-create name="${finalName}" select=false avatarPromptResize=false avatar=${avatarDataUrl}`;
            console.log('[PersonaGen] Running persona-create for:', finalName);
            await context.executeSlashCommandsWithOptions(createCmd);
        }
        
        // Wait longer for slash command to fully complete
        await new Promise(r => setTimeout(r, 500));
        
        // Step 2: Find the avatar ID
        const powerUser = context.powerUserSettings;
        let avatarId = null;
        
        console.log('[PersonaGen] powerUser keys:', Object.keys(powerUser || {}));
        console.log('[PersonaGen] personas:', JSON.stringify(powerUser?.personas || {}));
        
        if (powerUser && powerUser.personas) {
            // First try exact match
            for (const [key, name] of Object.entries(powerUser.personas)) {
                if (name === finalName) {
                    avatarId = key;
                    break;
                }
            }
            // If not found, try finding the most recently created persona_gen_ entry
            if (!avatarId) {
                const genEntries = Object.entries(powerUser.personas).filter(([key]) => key.startsWith('persona_gen_'));
                if (genEntries.length > 0) {
                    avatarId = genEntries[genEntries.length - 1][0];
                    console.log('[PersonaGen] Using latest persona_gen_ entry:', avatarId, powerUser.personas[avatarId]);
                }
            }
        }
        
        console.log('[PersonaGen] Found avatarId:', avatarId);
        
        // Step 3: Set description
        if (avatarId && powerUser) {
            if (!powerUser.persona_descriptions) powerUser.persona_descriptions = {};
            if (!powerUser.persona_descriptions[avatarId]) {
                powerUser.persona_descriptions[avatarId] = {};
            }
            powerUser.persona_descriptions[avatarId].description = personaText || '';
            powerUser.persona_descriptions[avatarId].position = 0;
            powerUser.persona_descriptions[avatarId].depth = 2;
            powerUser.persona_descriptions[avatarId].role = 0;
            powerUser.persona_descriptions[avatarId].lorebook = '';
            powerUser.persona_descriptions[avatarId].title = '';
            
            console.log('[PersonaGen] Description set:', powerUser.persona_descriptions[avatarId].description.substring(0, 50) + '...');
            
            // Save settings
            if (context.saveSettingsDebounced) context.saveSettingsDebounced();
            
            // Emit event
            if (context.eventSource && context.event_types) {
                context.eventSource.emit(context.event_types.PERSONA_UPDATED, avatarId);
            }
            
            // Refresh UI
            if (context.getUserAvatars) {
                await context.getUserAvatars(true, avatarId);
            }
        } else {
            console.warn('[PersonaGen] Could not find avatar for name:', finalName);
            // Fallback: try /persona-update via fetch
            if (personaText && avatarId) {
                const updateCmd = `/persona-update persona=${avatarId} description="${personaText.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
                console.log('[PersonaGen] Trying fallback /persona-update');
                await context.executeSlashCommandsWithOptions(updateCmd);
            }
        }
        
        console.log('[PersonaGen] Done:', { name: finalName, avatarId });
        toastr.success(`Persona "${finalName}" created in SillyTavern!`);
        
        popup.remove();
    } catch (error) {
        console.error('Error creating persona:', error);
        toastr.error('Failed to create persona in SillyTavern. Check console for details.');
    }
}

function handleDownload(popup) {
    const resultTextarea = popup.querySelector('#persona-gen-result');
    const personaText = resultTextarea.value;

    if (!personaText) {
        toastr.warning('No persona to download. Generate one first.');
        return;
    }

    const { characters, characterId } = SillyTavern.getContext();
    const character = characters[characterId];
    const characterName = character ? character.name : 'character';

    const persona = {
        name: '{{user}}',
        description: personaText,
        avatar: ''
    };

    const blob = new Blob([JSON.stringify(persona, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `persona_${characterName}.json`;
    a.click();
    URL.revokeObjectURL(url);

    toastr.success('Persona downloaded as JSON!');
}

function handleCopy(popup) {
    const resultTextarea = popup.querySelector('#persona-gen-result');
    const personaText = resultTextarea.value;

    if (!personaText) {
        toastr.warning('No persona to copy. Generate one first.');
        return;
    }

    navigator.clipboard.writeText(personaText).then(() => {
        toastr.success('Persona copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy:', err);
        toastr.error('Failed to copy to clipboard.');
    });
}

function addToolbarButton() {
    // Find the Chat Options menu (hamburger menu)
    const optionsContent = document.querySelector('.options-content');
    
    if (!optionsContent) {
        console.warn(`${EXTENSION_NAME} could not find .options-content menu`);
        return;
    }
    
    console.log(`${EXTENSION_NAME} found .options-content menu`);
    
    // Create menu item matching SillyTavern's style
    const menuItem = document.createElement('a');
    menuItem.id = 'option_persona_generator';
    menuItem.innerHTML = `
        <i class="fa-lg fa-solid fa-user-plus"></i>
        <span>Persona Generator</span>
    `;
    menuItem.addEventListener('click', (e) => {
        e.stopPropagation();
        openPersonaGeneratorPopup();
    });
    
    // Find the "Impersonate" or "Continue" option to insert after
    const allLinks = optionsContent.querySelectorAll('a');
    let insertAfterLink = null;
    
    for (const link of allLinks) {
        const text = link.textContent || '';
        if (text.includes('Impersonate') || text.includes('Continue')) {
            insertAfterLink = link;
            break;
        }
    }
    
    if (insertAfterLink) {
        insertAfterLink.parentNode.insertBefore(menuItem, insertAfterLink.nextSibling);
        console.log(`${EXTENSION_NAME} menu item inserted after ${insertAfterLink.textContent}`);
    } else {
        optionsContent.appendChild(menuItem);
        console.log(`${EXTENSION_NAME} menu item appended to options menu`);
    }
}

function addExtensionSettings() {
    const { renderExtensionTemplateAsync } = SillyTavern.getContext();
    
    const settingsHtml = `
        <div class="persona-gen-settings-container">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>Persona Generator</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <div class="persona-gen-setting">
                        <label for="persona_gen_default_style">Default Style:</label>
                        <select id="persona_gen_default_style">
                            <option value="Narrative">Narrative</option>
                            <option value="Structured" selected>Structured</option>
                            <option value="Profile">Profile</option>
                            <option value="Dialogue">Dialogue</option>
                        </select>
                    </div>
                    <div class="persona-gen-setting">
                        <label for="persona_gen_default_person">Default Person:</label>
                        <select id="persona_gen_default_person">
                            <option value="First person" selected>First person</option>
                            <option value="Third person">Third person</option>
                        </select>
                    </div>
                    <button id="persona_gen_open_btn" class="menu_button">
                        <i class="fa-solid fa-user-plus"></i>
                        <span>Open Persona Generator</span>
                    </button>
                    <small>Or use <code>/persona-gen</code> in chat</small>
                </div>
            </div>
        </div>
    `;
    
    // Try both selectors for extensions settings
    const $settings = $('#extensions_settings2').length ? $('#extensions_settings2') : $('#extensions_settings');
    $settings.append(settingsHtml);
    
    $('#persona_gen_open_btn').on('click', () => openPersonaGeneratorPopup());
    
    console.log(`${EXTENSION_NAME} settings panel added to Extensions menu`);
}

// Initialize extension
(function() {
    function initExtension() {
        if (typeof SillyTavern === 'undefined') {
            setTimeout(initExtension, 100);
            return;
        }

        const { SlashCommandParser, SlashCommand, eventSource, event_types } = SillyTavern.getContext();

        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'persona-gen',
            callback: () => {
                openPersonaGeneratorPopup();
                return '';
            },
            helpString: 'Open the Persona Generator extension',
        }));

        eventSource.on(event_types.APP_READY, () => {
            addExtensionSettings();
            // Add toolbar button with a delay to ensure DOM is ready
            setTimeout(() => {
                addToolbarButton();
                console.log(`${EXTENSION_NAME} loaded successfully`);
            }, 500);
        });
    }

    initExtension();
})();
