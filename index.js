/**
 * SillyTavern Persona Generator Extension
 * Generate personas from character cards using AI
 */

const MODULE_NAME = 'persona_generator';
const EXTENSION_NAME = 'Persona Generator';
const AVATAR_TYPES = 'image/png,image/jpeg,image/webp,image/gif';
const LIBRARY_BACKUP_FORMAT = 'sillytavern-persona-generator-library';

const STYLES = ['Narrative', 'Structured', 'Profile', 'Dialogue'];
const PERSONS = ['First person', 'Third person'];
const GENDERS = ['Male', 'Female', 'Other', 'Not specified'];

const CARD_FIELDS = {
    personality: 'Personality',
    scenario: 'Scenario',
    description: 'Description',
    first_mes: 'First Message',
};
const STRUCTURED_SECTIONS = {
    overview: 'Overview',
    general_info: 'General info',
    backstory: 'Backstory',
    personality_core: 'Personality',
    quick_reference: 'Quick reference',
    physical_presence: 'Physical presence',
    expression_patterns: 'Expression',
    worldview: 'Worldview',
    capabilities: 'Capabilities',
    style_choices: 'Style',
};

const defaultSettings = {
    enabled: true,
    style: 'Structured',
    person: 'First person',
    gender: 'Male',
    age: '25',
    species: 'Human',
    userDescription: '',
    lastUsedCharacter: null,
    relationship: '',
    openingHook: '',
    cardFields: Object.keys(CARD_FIELDS),
    tokenBudget: '',
    generationDraft: null,
    editDraft: null,
    personaLibrary: {},
    customPrompts: []
};

function escapeHTML(value) {
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(value ?? '').replace(/[&<>"']/g, character => entities[character]);
}

function applyTokenBudget(prompt, tokenBudget) {
    return tokenBudget ? `${prompt}\n\nKeep the complete response within ${tokenBudget} tokens.` : prompt;
}

async function generatePersonaText(prompt, tokenBudget = null) {
    const result = await SillyTavern.getContext().generateRaw({
        prompt: applyTokenBudget(prompt, tokenBudget),
        responseLength: tokenBudget,
    });
    if (typeof result !== 'string' || !result.trim()) {
        throw new Error('The provider returned an empty persona description.');
    }
    return result;
}

function saveDraft(key, draft) {
    getSettings()[key] = draft;
    SillyTavern.getContext().saveSettingsDebounced();
}

function personaRecord(avatarId) {
    const library = getSettings().personaLibrary;
    return Object.hasOwn(library, avatarId) ? library[avatarId] : {};
}

function savePersonaRecord(avatarId, changes) {
    const settings = getSettings();
    settings.personaLibrary = {
        ...settings.personaLibrary,
        [avatarId]: { ...personaRecord(avatarId), ...changes },
    };
    SillyTavern.getContext().saveSettingsDebounced();
}

function protectedFacts(value) {
    return [...new Set(value.split('\n').map(line => line.trim()).filter(Boolean))];
}

function missingFacts(description, facts) {
    const normalize = text => text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ');
    const text = normalize(description);
    return facts.filter(fact => !text.includes(normalize(fact)));
}

function characterCardContext(character, fields = Object.keys(CARD_FIELDS)) {
    return [
        `Name: ${character.name || 'Unknown'}`,
        ...fields.map(key => `${CARD_FIELDS[key]}: ${character[key] || ''}`),
    ].join('\n');
}

async function updateTokenStatus(popup) {
    const result = popup.querySelector('#persona-gen-result');
    const input = popup.querySelector('#persona-gen-token-budget');
    const status = popup.querySelector('#persona-gen-token-status');
    const text = result.value;
    const budget = input.value;
    if (!text.trim()) {
        status.textContent = '';
        return;
    }

    const { getTokenCountAsync } = SillyTavern.getContext();
    let tokens;
    try {
        tokens = await getTokenCountAsync(text);
        if (!Number.isFinite(tokens)) throw new Error('Token count unavailable');
    } catch {
        tokens = Math.ceil(Array.from(text).length / 4);
    }
    if (popup.isConnected && result.value === text && input.value === budget) {
        status.textContent = `Estimated tokens: ${tokens}${budget ? ` / ${budget}` : ''}${budget && tokens > Number(budget) ? ' (over budget)' : ''}`;
    }
}

function getAllPrompts() {
    const settings = getSettings();
    // Built-in prompts
    const builtIn = [
        { id: 'Narrative', name: 'Narrative', builtIn: true },
        { id: 'Structured', name: 'Structured', builtIn: true },
        { id: 'Profile', name: 'Profile', builtIn: true },
        { id: 'Dialogue', name: 'Dialogue', builtIn: true },
    ];
    // Custom prompts from settings
    const custom = (settings.customPrompts || []).map((p, i) => ({
        id: `custom_${i}`,
        name: p.name,
        builtIn: false,
        systemPrompt: p.systemPrompt || '',
        userTemplate: p.userTemplate || ''
    }));
    return [...builtIn, ...custom];
}

function getPromptById(id) {
    const settings = getSettings();
    if (id.startsWith('custom_')) {
        const index = parseInt(id.replace('custom_', ''));
        return settings.customPrompts?.[index] || null;
    }
    // Built-in prompts don't store templates, they use the hardcoded functions
    return null;
}

function saveCustomPrompt(prompt) {
    const settings = getSettings();
    if (!settings.customPrompts) settings.customPrompts = [];
    settings.customPrompts.push(prompt);
    saveSettings();
}

function updateCustomPrompt(index, prompt) {
    const settings = getSettings();
    if (settings.customPrompts && settings.customPrompts[index]) {
        settings.customPrompts[index] = prompt;
        saveSettings();
    }
}

function deleteCustomPrompt(index) {
    const settings = getSettings();
    if (settings.customPrompts && settings.customPrompts[index]) {
        settings.customPrompts.splice(index, 1);
        if (settings.style.startsWith('custom_')) {
            const selectedIndex = Number(settings.style.slice('custom_'.length));
            if (selectedIndex === index) settings.style = defaultSettings.style;
            if (selectedIndex > index) settings.style = `custom_${selectedIndex - 1}`;
        }
        saveSettings();
    }
}

function getSettings() {
    const { extensionSettings } = SillyTavern.getContext();
    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    }
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(extensionSettings[MODULE_NAME], key)) {
            extensionSettings[MODULE_NAME][key] = structuredClone(defaultSettings[key]);
        }
    }
    return extensionSettings[MODULE_NAME];
}

function saveSettings() {
    const { saveSettingsDebounced } = SillyTavern.getContext();
    saveSettingsDebounced();
    updateSettingsPanel();
}

function openPersonaGeneratorPopup() {
    const existing = document.getElementById('persona-generator-popup');
    if (existing?.dataset.saving) return;
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
        return `<option value="${index}" ${selected}>${escapeHTML(char.name)}</option>`;
    }).join('');

    // Build style options from built-in + custom prompts
    const allPrompts = getAllPrompts();
    const styleOptions = allPrompts.map(prompt => {
        const selected = prompt.id === settings.style ? 'selected' : '';
        return `<option value="${prompt.id}" ${selected}>${escapeHTML(prompt.name)}</option>`;
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
            
            <div class="persona-generator-content" role="region" aria-label="Persona generator form" tabindex="0">
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
                        <input type="text" id="persona-gen-age" value="${escapeHTML(settings.age)}" />
                    </div>
                    <div class="persona-generator-field">
                        <label>Species/Race:</label>
                        <input type="text" id="persona-gen-species" value="${escapeHTML(settings.species)}" />
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
                    <textarea id="persona-gen-description" rows="3">${escapeHTML(settings.userDescription)}</textarea>
                </div>

                <div class="persona-generator-row">
                    <div class="persona-generator-field">
                        <label for="persona-gen-relationship">Relationship to character (optional)</label>
                        <input id="persona-gen-relationship" type="text" value="${escapeHTML(settings.relationship)}" placeholder="Ally, rival, stranger…">
                    </div>
                    <div class="persona-generator-field">
                        <label for="persona-gen-opening-hook">Opening hook (optional)</label>
                        <input id="persona-gen-opening-hook" type="text" value="${escapeHTML(settings.openingHook)}" placeholder="What does the persona want in the first scene?">
                    </div>
                </div>
                <details class="persona-generator-section">
                    <summary>Group chat</summary>
                    <label for="persona-gen-group">Additional characters</label>
                    <select id="persona-gen-group" multiple size="4">${characters.map((character, index) => `<option value="${index}">${escapeHTML(character.name)}</option>`).join('')}</select>
                    <label for="persona-gen-group-relationships">Give each named character a relationship (optional)</label>
                    <textarea id="persona-gen-group-relationships" rows="3" placeholder="Mira: childhood friend&#10;Theo: uneasy ally"></textarea>
                </details>
                <fieldset class="persona-generator-section persona-generator-card-fields">
                    <legend>Include from the character card</legend>
                    ${Object.entries(CARD_FIELDS).map(([key, label]) => `
                        <label><input type="checkbox" name="persona-card-field" value="${key}" ${settings.cardFields.includes(key) ? 'checked' : ''}> ${label}</label>
                    `).join('')}
                </fieldset>
                <div class="persona-generator-section">
                    <label for="persona-gen-token-budget">Maximum output tokens (optional)</label>
                    <input id="persona-gen-token-budget" type="number" min="1" step="1" value="${escapeHTML(settings.tokenBudget)}">
                </div>
                <div class="persona-generator-section">
                    <label for="persona-gen-variation-count">Number of proposals</label>
                    <select id="persona-gen-variation-count"><option>1</option><option>2</option><option>3</option></select>
                </div>
                <div class="persona-generator-actions">
                    <button id="persona-gen-generate" class="persona-generator-btn primary">Generate Persona</button>
                    <button id="persona-gen-preview" class="persona-generator-btn secondary" aria-expanded="false">Preview Prompt</button>
                </div>
                <pre id="persona-gen-prompt-preview" class="persona-generator-preview" hidden></pre>

                <div class="persona-generator-section" id="persona-gen-result-section" style="display: none;">
                    <label for="persona-gen-result" id="persona-gen-result-label">Generated Persona</label>
                    <div id="persona-gen-variation-controls" hidden>
                        <label for="persona-gen-variation">Proposal to edit and save</label>
                        <select id="persona-gen-variation"></select>
                        <details>
                            <summary>Compare proposals</summary>
                            <div id="persona-gen-variation-comparison" class="persona-generator-variation-comparison"></div>
                        </details>
                    </div>
                    <textarea id="persona-gen-result" rows="8"></textarea>
                    <label for="persona-gen-avatar">Custom avatar (optional)</label>
                    <input id="persona-gen-avatar" type="file" accept="${AVATAR_TYPES}">
                    <small id="persona-gen-token-status" role="status"></small>
                    <div id="persona-gen-section-controls" class="persona-generator-section" hidden>
                        <label for="persona-gen-section">Structured section to regenerate</label>
                        <select id="persona-gen-section"></select>
                        <label for="persona-gen-section-request">Instructions for this section (optional)</label>
                        <input id="persona-gen-section-request" type="text">
                        <button id="persona-gen-regenerate" class="persona-generator-btn secondary">Regenerate Section</button>
                    </div>
                    <div class="persona-generator-result-actions">
                        <button id="persona-gen-create" class="persona-generator-btn primary">
                            <i class="fa-solid fa-plus"></i> Create in SillyTavern
                        </button>
                        <button id="persona-gen-download" class="persona-generator-btn secondary">
                            <i class="fa-solid fa-download"></i> Download JSON
                        </button>
                        <button id="persona-gen-discard" class="persona-generator-btn secondary">Discard Draft</button>
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

    const close = () => {
        if (!popup.dataset.saving) popup.remove();
    };
    overlay.addEventListener('click', close);
    closeBtn.addEventListener('click', close);

    generateBtn.addEventListener('click', () => handleGenerate(popup, characters, settings));
    popup.querySelector('#persona-gen-preview').addEventListener('click', () => {
        const input = readGenerationInput(popup, characters);
        if (input) showPromptPreview(popup, 'gen', applyTokenBudget(buildPrompt(input.character, input.options), input.tokenBudget));
    });
    popup.querySelector('#persona-gen-variation').addEventListener('change', event => {
        const draft = settings.generationDraft;
        const activeVariation = Number(event.target.value);
        const text = draft?.variations?.[activeVariation];
        if (typeof text !== 'string') return;
        const updated = { ...draft, activeVariation, text };
        saveDraft('generationDraft', updated);
        showGenerationDraft(popup, updated);
    });
    createBtn.addEventListener('click', () => handleSave(popup));
    downloadBtn.addEventListener('click', () => handleDownload(popup));
    copyBtn.addEventListener('click', () => handleCopy(popup));
    const result = popup.querySelector('#persona-gen-result');
    const budget = popup.querySelector('#persona-gen-token-budget');
    popup.querySelector('#persona-gen-regenerate').addEventListener('click', () => handleSectionRegenerate(popup));
    popup.querySelector('#persona-gen-discard').addEventListener('click', () => {
        if (generateBtn.disabled || !confirm('Discard this persona draft?')) return;
        saveDraft('generationDraft', null);
        result.value = '';
        popup.querySelector('#persona-gen-result-section').style.display = 'none';
    });
    result.addEventListener('input', () => {
        saveGenerationText(popup, { ...settings.generationDraft, text: result.value });
        updateSectionOptions(popup);
        void updateTokenStatus(popup);
    });
    budget.addEventListener('input', () => {
        settings.tokenBudget = budget.value;
        SillyTavern.getContext().saveSettingsDebounced();
        if (settings.generationDraft) void updateTokenStatus(popup);
    });

    if (settings.generationDraft) showGenerationDraft(popup, settings.generationDraft);

    popup.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
    });
}

function readGenerationInput(popup, characters) {
    const characterSelect = popup.querySelector('#persona-gen-character');
    const genderSelect = popup.querySelector('#persona-gen-gender');
    const ageInput = popup.querySelector('#persona-gen-age');
    const speciesInput = popup.querySelector('#persona-gen-species');
    const styleSelect = popup.querySelector('#persona-gen-style');
    const personSelect = popup.querySelector('#persona-gen-person');
    const descTextarea = popup.querySelector('#persona-gen-description');
    const budget = popup.querySelector('#persona-gen-token-budget');
    if (!budget.reportValidity()) return;

    const characterId = parseInt(characterSelect.value);
    const options = {
        gender: genderSelect.value,
        age: ageInput.value,
        species: speciesInput.value,
        style: styleSelect.value,
        person: personSelect.value,
        description: descTextarea.value,
        relationship: popup.querySelector('#persona-gen-relationship').value.trim(),
        openingHook: popup.querySelector('#persona-gen-opening-hook').value.trim(),
        cardFields: Array.from(popup.querySelectorAll('[name="persona-card-field"]:checked'), field => field.value),
    };

    const character = characters[characterId];
    options.groupCharacters = Array.from(popup.querySelector('#persona-gen-group').selectedOptions, option => Number(option.value))
        .filter(id => id !== characterId && characters[id])
        .map(id => characters[id]);
    options.groupRelationships = popup.querySelector('#persona-gen-group-relationships').value.trim();
    if (!character) {
        toastr.warning('Select a character first.');
        return;
    }

    return { character, characterId, options, tokenBudget: Number(budget.value) || null };
}

function showPromptPreview(popup, prefix, prompt) {
    const preview = popup.querySelector(`#persona-${prefix}-prompt-preview`);
    preview.hidden = !preview.hidden && preview.textContent === prompt;
    preview.textContent = prompt;
    popup.querySelector(`#persona-${prefix}-preview`).setAttribute('aria-expanded', String(!preview.hidden));
}

async function handleGenerate(popup, characters, settings) {
    const generateBtn = popup.querySelector('#persona-gen-generate');
    if (generateBtn.disabled) return;
    const input = readGenerationInput(popup, characters);
    if (!input) return;
    const { character, characterId, options, tokenBudget } = input;
    const variationCount = Number(popup.querySelector('#persona-gen-variation-count').value) || 1;

    settings.gender = options.gender;
    settings.age = options.age;
    settings.species = options.species;
    settings.style = options.style;
    settings.person = options.person;
    settings.userDescription = options.description;
    settings.lastUsedCharacter = characterId;
    settings.relationship = options.relationship;
    settings.openingHook = options.openingHook;
    settings.cardFields = options.cardFields;
    settings.tokenBudget = tokenBudget ? String(tokenBudget) : '';
    saveSettings();

    const variations = [];
    const baseDraft = {
        style: options.style,
        characterName: character.name || 'Character',
        sources: [character, ...options.groupCharacters].map(card => card.name || 'Character'),
    };
    setGenerationBusy(popup, 'Generating...');
    try {
        const prompt = buildPrompt(character, options);
        for (let iteration = 0; iteration < variationCount; iteration++) {
            generateBtn.textContent = variationCount === 1 ? 'Generating...' : `Generating ${iteration + 1} of ${variationCount}...`;
            const text = await generatePersonaText(prompt, tokenBudget);
            if (!popup.isConnected) return;
            if (variations.includes(text)) continue;
            variations.push(text);
            const draft = { ...baseDraft, text: variations[0], variations: [...variations], activeVariation: 0 };
            saveDraft('generationDraft', draft);
            showGenerationDraft(popup, draft);
            if (variations.length === 1) {
                popup.querySelector('#persona-gen-result-section').scrollIntoView({ block: 'start' });
            }
        }
        if (variations.length < variationCount) toastr.info('Identical proposals were combined.');
        else toastr.success('Persona generated successfully!');
    } catch (error) {
        console.error('Error generating persona:', error);
        if (variations.length) toastr.warning('Some proposals could not be generated. Completed proposals are available.');
        else toastr.error('Failed to generate persona. Check console for details.');
    } finally {
        setGenerationBusy(popup);
    }
}

function setGenerationBusy(popup, message = '') {
    const busy = Boolean(message);
    const generate = popup.querySelector('#persona-gen-generate');
    generate.textContent = message || 'Generate Persona';
    for (const id of ['generate', 'create', 'discard', 'regenerate', 'token-budget', 'section', 'section-request', 'preview', 'variation-count', 'variation', 'avatar']) {
        popup.querySelector(`#persona-gen-${id}`).disabled = busy;
    }
    popup.querySelector('#persona-gen-result').readOnly = busy;
}

function showGenerationDraft(popup, draft) {
    const result = popup.querySelector('#persona-gen-result');
    result.value = draft.text;
    result.dataset.characterName = draft.characterName;
    popup.querySelector('#persona-gen-result-label').textContent = `Persona draft for ${draft.characterName}`;
    popup.querySelector('#persona-gen-result-section').style.display = 'block';
    renderVariations(popup, draft);
    updateSectionOptions(popup);
    void updateTokenStatus(popup);
}

function saveGenerationText(popup, draft) {
    if (draft.variations) {
        draft.variations = draft.variations.map((text, index) => index === draft.activeVariation ? draft.text : text);
    }
    saveDraft('generationDraft', draft);
    renderVariationComparison(popup, draft);
}

function renderVariations(popup, draft) {
    const select = popup.querySelector('#persona-gen-variation');
    const alternatives = draft.variations ?? [];
    select.replaceChildren(...alternatives.map((_, index) => new Option(`Proposal ${index + 1}`, String(index))));
    select.value = String(draft.activeVariation ?? 0);
    popup.querySelector('#persona-gen-variation-controls').hidden = alternatives.length < 2;
    renderVariationComparison(popup, draft);
}

function renderVariationComparison(popup, draft) {
    const container = popup.querySelector('#persona-gen-variation-comparison');
    const alternatives = draft.variations ?? [];
    container.replaceChildren();
    if (alternatives.length < 2) return;

    for (const [index, text] of alternatives.entries()) {
        const panel = document.createElement('div');
        const heading = document.createElement('strong');
        const description = document.createElement('pre');
        heading.textContent = `Proposal ${index + 1}`;
        description.textContent = text;
        panel.append(heading, description);
        container.append(panel);
    }
}

function findStructuredSection(text, tag) {
    const pattern = new RegExp(`(<${tag}>)([\\s\\S]*?)(</${tag}>)`, 'gi');
    const matches = [...text.matchAll(pattern)];
    return matches.length === 1 ? matches[0] : null;
}

function updateSectionOptions(popup) {
    const text = popup.querySelector('#persona-gen-result').value;
    const select = popup.querySelector('#persona-gen-section');
    const selected = select.value;
    const isStructured = getSettings().generationDraft?.style === 'Structured';
    const sections = isStructured
        ? Object.entries(STRUCTURED_SECTIONS).filter(([tag]) => findStructuredSection(text, tag))
        : [];
    select.replaceChildren(...sections.map(([tag, label]) => new Option(label, tag)));
    if (sections.some(([tag]) => tag === selected)) select.value = selected;
    popup.querySelector('#persona-gen-section-controls').hidden = sections.length === 0;
}

async function handleSectionRegenerate(popup) {
    const draft = getSettings().generationDraft;
    const result = popup.querySelector('#persona-gen-result');
    const budget = popup.querySelector('#persona-gen-token-budget');
    const tag = popup.querySelector('#persona-gen-section').value;
    const request = popup.querySelector('#persona-gen-section-request').value.trim();
    if (popup.querySelector('#persona-gen-generate').disabled || !budget.reportValidity()) return;
    if (draft?.style !== 'Structured' || !Object.hasOwn(STRUCTURED_SECTIONS, tag)) return;
    const original = result.value;
    const section = findStructuredSection(original, tag);
    if (!section) return;

    setGenerationBusy(popup, 'Regenerating section...');
    try {
        const limit = Number(budget.value) || null;
        const prompt = `Rewrite only the contents of the <${tag}> section. Preserve the persona's facts and narrative perspective unless the request changes them. Return only the new section contents, without outer tags or code fences.

Request: ${request || 'Write a revised version consistent with the rest of the persona.'}

Current persona:
${original}`;
        let replacement = (await generatePersonaText(prompt, limit)).trim();
        const wrapped = findStructuredSection(replacement, tag);
        if (wrapped?.[0] === replacement) replacement = wrapped[2].trim();
        if (!replacement || /^```/.test(replacement)
            || Object.keys(STRUCTURED_SECTIONS).some(key => new RegExp(`</?${key}>`, 'i').test(replacement))) {
            throw new Error('The model returned invalid section contents.');
        }
        if (!popup.isConnected || result.value !== original) return;

        const text = original.slice(0, section.index) + section[1] + '\n' + replacement + '\n' + section[3]
            + original.slice(section.index + section[0].length);
        const updated = { ...draft, text };
        saveGenerationText(popup, updated);
        showGenerationDraft(popup, updated);
    } catch (error) {
        console.error('Error regenerating persona section:', error);
        toastr.error('Could not regenerate this section. The draft is still available.');
    } finally {
        setGenerationBusy(popup);
    }
}

function buildPrompt(character, options) {
    const { gender, age, species, style, person, description, relationship, openingHook } = options;
    const name = character.name || 'Unknown';
    const userPrefs = [
        `Gender: ${gender}`,
        `Age: ${age}`,
        `Species/Race: ${species}`,
        `Narrative Perspective: ${person}`,
        relationship && `Relationship to the character: ${relationship}`,
        openingHook && `Opening scene goal or hook: ${openingHook}`,
        description && `Additional details from user: ${description}`,
    ].filter(Boolean).join('\n');

    const includedFields = options.cardFields ?? Object.keys(CARD_FIELDS);
    const groupCharacters = options.groupCharacters ?? [];
    const groupContext = groupCharacters.length
        ? `\n\nAdditional group characters:\n${groupCharacters.map(card => characterCardContext(card, includedFields)).join('\n\n')}`
            + `\nGive the persona a reason to join the group scene and a distinct relationship with each named character.`
            + (options.groupRelationships ? `\nRequested relationships:\n${options.groupRelationships}` : '')
        : '';
    const cardContext = characterCardContext(character, includedFields) + groupContext;

    // Check if it's a custom prompt
    if (style && style.startsWith('custom_')) {
        const settings = getSettings();
        const customIndex = parseInt(style.replace('custom_', ''));
        const customPrompt = settings.customPrompts?.[customIndex];
        if (customPrompt) {
            // Use custom prompt template
            let template = customPrompt.userTemplate || '';
            // Replace placeholders
            template = template.replace(/{name}/g, name);
            template = template.replace(/{userPrefs}/g, userPrefs);
            template = template.replace(/{cardContext}/g, cardContext);
            // Add system prompt if provided
            if (customPrompt.systemPrompt) {
                return `${customPrompt.systemPrompt}\n\n${template}`;
            }
            return template;
        }
    }

    // Built-in prompts
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
        : 'Write a third-person narrative description. Describe the character as if telling their story to someone else - casual, vivid, with personality showing through details.\n\nInclude: name, age, appearance, personality, skills, history with {name}, and and current motivation.\n\nRULES:\n- Third person only ("he/she", "his/her", "the character")';

    return `You are an expert persona designer for roleplay scenarios. Design a PERSONA FOR THE USER who will interact with the character ${name}.

IMPORTANT: This persona represents the USER/PLAYER, NOT the character ${name}. The persona must have a COMPLETELY DIFFERENT name from ${name}. Create an original name that is NOT related to ${name}.

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

    return `You are an expert persona designer for roleplay scenarios. Create a PERSONA FOR THE USER who will interact with the character ${name}.

IMPORTANT: This persona represents the USER/PLAYER, NOT the character ${name}. The persona must have a COMPLETELY DIFFERENT name from ${name}. Create an original name that is NOT related to ${name}.

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

    return `You are an expert persona designer for roleplay scenarios. Create a PERSONA PROFILE FOR THE USER who will interact with the character ${name}.

IMPORTANT: This persona represents the USER/PLAYER, NOT the character ${name}. The persona must have a COMPLETELY DIFFERENT name from ${name}. Create an original name that is NOT related to ${name}.

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

    return `You are an expert persona designer for roleplay scenarios. Create a self-introduction FOR THE USER who will meet the character ${name}.

IMPORTANT: This persona represents the USER/PLAYER, NOT the character ${name}. The persona must have a COMPLETELY DIFFERENT name from ${name}. Create an original name that is NOT related to ${name}.

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
    const saveButton = popup.querySelector('#persona-gen-create');
    const generateButton = popup.querySelector('#persona-gen-generate');
    if (saveButton.disabled || generateButton.disabled) return;

    const description = resultTextarea.value;
    if (!description.trim()) {
        toastr.warning('No persona to save. Generate one first.');
        return;
    }

    const name = extractPersonaName(description) || resultTextarea.dataset.characterName || 'Character';
    popup.dataset.saving = 'true';
    setGenerationBusy(popup, 'Saving...');
    try {
        const file = popup.querySelector('#persona-gen-avatar').files[0];
        const avatar = file ? await readAvatarImage(file) : null;
        const avatarId = await createPersona(name, description, avatar);
        const draft = getSettings().generationDraft;
        savePersonaRecord(avatarId, { sources: draft?.sources ?? [resultTextarea.dataset.characterName].filter(Boolean) });
        saveDraft('generationDraft', null);
        popup.remove();
    } catch (error) {
        console.error('Error creating persona:', error);
        toastr.error('Failed to create persona in SillyTavern. Check console for details.');
    } finally {
        delete popup.dataset.saving;
        setGenerationBusy(popup);
    }
}

function placeholderAvatar() {
    const canvas = document.createElement('canvas');
    canvas.width = 10;
    canvas.height = 10;
    const drawing = canvas.getContext('2d');
    drawing.fillStyle = '#9b59b6';
    drawing.fillRect(0, 0, 10, 10);
    return canvas.toDataURL('image/png');
}

async function createPersona(name, description, avatar = null, settings = {}) {
    const { SlashCommandParser } = SillyTavern.getContext();

    // Pass literal values to the registered command, without parsing them as STscript.
    const avatarId = await SlashCommandParser.commands['persona-create'].callback({
        name,
        description,
        select: 'false',
        avatarPromptResize: 'false',
        avatar: avatar ?? placeholderAvatar(),
        title: settings.title,
        lorebook: settings.lorebook,
        descriptionPosition: settings.position,
        descriptionRole: settings.role,
        descriptionDepth: settings.depth,
    });
    if (!avatarId) throw new Error('SillyTavern did not return a new persona ID.');
    return avatarId;
}

function isAvatarData(value) {
    return typeof value === 'string' && /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/]+={0,2}$/i.test(value);
}

async function readAvatarImage(blob) {
    if (!AVATAR_TYPES.split(',').includes(blob.type)) {
        throw new Error('Choose a PNG, JPEG, WebP or GIF avatar.');
    }
    const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
    await validateAvatarImage(data);
    return data;
}

async function validateAvatarImage(data) {
    if (!isAvatarData(data)) throw new Error('Invalid avatar image.');
    const comma = data.indexOf(',');
    const header = atob(data.slice(comma + 1, comma + 17));
    const type = data.slice(5, data.indexOf(';')).toLowerCase();
    const signatures = {
        'image/png': header.startsWith('\x89PNG\r\n\x1a\n'),
        'image/jpeg': header.startsWith('\xff\xd8\xff'),
        'image/webp': header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP',
        'image/gif': /^(GIF87a|GIF89a)/.test(header),
    };
    if (!signatures[type]) throw new Error('The avatar contents do not match its image format.');
    const image = new Image();
    image.src = data;
    await image.decode();
}

async function getPersonaAvatar(avatarId) {
    const response = await fetch(`User%20Avatars/${encodeURIComponent(avatarId)}`);
    if (!response.ok) throw new Error(`Could not read the avatar for ${avatarId}.`);
    return readAvatarImage(await response.blob());
}

function downloadJson(value, filename) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

function handleDownload(popup) {
    const resultTextarea = popup.querySelector('#persona-gen-result');
    const personaText = resultTextarea.value;

    if (!personaText) {
        toastr.warning('No persona to download. Generate one first.');
        return;
    }

    const characterName = resultTextarea.dataset.characterName || 'character';

    const persona = {
        name: '{{user}}',
        description: personaText,
        avatar: ''
    };

    downloadJson(persona, `persona_${characterName}.json`);

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

function openEditPersonaPopup() {
    const existing = document.getElementById('persona-edit-popup');
    if (existing?.dataset.saving) return;
    if (existing) existing.remove();

    const { powerUserSettings, characters } = SillyTavern.getContext();
    const personas = powerUserSettings?.personas || {};
    const personaDescriptions = powerUserSettings?.persona_descriptions || {};

    const popup = document.createElement('div');
    popup.id = 'persona-edit-popup';
    popup.className = 'persona-generator-popup';
    popup.innerHTML = buildEditPopupHTML(characters);

    document.body.appendChild(popup);
    setupEditPopupEventListeners(popup, personas, personaDescriptions, characters);
}

function buildEditPopupHTML(characters) {
    return `
        <div class="persona-generator-overlay"></div>
        <div class="persona-generator-modal">
            <div class="persona-generator-header">
                <h2>Edit Persona</h2>
                <button class="persona-generator-close" id="persona-edit-close">&times;</button>
            </div>
            
            <div class="persona-generator-content" role="region" aria-label="Persona editor form" tabindex="0">
                <div class="persona-generator-section">
                    <label for="persona-edit-search">Search personas</label>
                    <input id="persona-edit-search" type="search" placeholder="Name or description">
                    <label for="persona-edit-source">Character of origin</label>
                    <select id="persona-edit-source"></select>
                    <label class="persona-generator-checkbox"><input id="persona-edit-favorites" type="checkbox"> Favorites only</label>
                    <label for="persona-edit-tag-filter">Tag</label>
                    <select id="persona-edit-tag-filter"></select>
                    <label for="persona-edit-archive-filter">Library view</label>
                    <select id="persona-edit-archive-filter">
                        <option value="active">Active personas</option><option value="archived">Archived personas</option><option value="all">All personas</option>
                    </select>
                    <label for="persona-edit-select">Select Persona</label>
                    <select id="persona-edit-select"></select>
                    <small id="persona-edit-empty" role="status" hidden>No personas match these filters.</small>
                    <label class="persona-generator-checkbox"><input id="persona-edit-favorite" type="checkbox"> Favorite selected persona</label>
                    <label class="persona-generator-checkbox"><input id="persona-edit-archived" type="checkbox"> Archive selected persona</label>
                    <label for="persona-edit-tags">Tags (comma-separated)</label>
                    <input id="persona-edit-tags" type="text" placeholder="Fantasy, current campaign">
                    <details>
                        <summary>Library backup</summary>
                        <button id="persona-edit-export-backup" class="persona-generator-btn secondary">Export Library JSON</button>
                        <label for="persona-edit-backup-file">Preview an import</label>
                        <input id="persona-edit-backup-file" type="file" accept=".json,application/json">
                        <div id="persona-edit-import-controls" hidden>
                            <label for="persona-edit-import-conflict">If the name already exists</label>
                            <select id="persona-edit-import-conflict">
                                <option value="skip">Skip that entry</option>
                                <option value="copy">Import under a new name</option>
                            </select>
                            <ul id="persona-edit-import-preview"></ul>
                            <button id="persona-edit-import-backup" class="persona-generator-btn primary">Import Library</button>
                        </div>
                        <small id="persona-edit-backup-status" role="status"></small>
                    </details>
                </div>

                <div class="persona-generator-section">
                    <label>Current Description:</label>
                    <textarea id="persona-edit-current" rows="6" readonly></textarea>
                    <details id="persona-edit-roleplay-controls">
                        <summary>Roleplay reference card</summary>
                        <label for="persona-edit-roleplay-card">Reference notes for this persona</label>
                        <textarea id="persona-edit-roleplay-card" rows="6"></textarea>
                        <button id="persona-edit-generate-card" class="persona-generator-btn secondary">Generate Reference Card</button>
                    </details>
                    <label for="persona-edit-facts">Protected facts (one phrase per line)</label>
                    <textarea id="persona-edit-facts" rows="3" placeholder="Use the exact phrases that should be retained"></textarea>
                    <details id="persona-edit-history-controls" hidden>
                        <summary>Previous versions</summary>
                        <label for="persona-edit-history">Version to preview</label>
                        <select id="persona-edit-history"></select>
                        <button id="persona-edit-preview-history" class="persona-generator-btn secondary">Preview Version</button>
                    </details>
                </div>

                <div class="persona-generator-section">
                    <label for="persona-edit-target">Adapt to a different character (optional)</label>
                    <select id="persona-edit-target">
                        <option value="">Keep current context</option>
                        ${characters.map((card, index) => `<option value="${index}">${escapeHTML(card.name)}</option>`).join('')}
                    </select>
                    <label for="persona-edit-request">Describe the changes you want, or add instructions for the adaptation</label>
                    <textarea id="persona-edit-request" rows="4" placeholder="Example: Make the persona more cheerful, add that she is a doctor, change age to 30..."></textarea>
                </div>

                <div class="persona-generator-actions">
                    <button id="persona-edit-generate" class="persona-generator-btn primary">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> Generate Changes
                    </button>
                    <button id="persona-edit-preview" class="persona-generator-btn secondary" aria-expanded="false">Preview Prompt</button>
                </div>
                <pre id="persona-edit-prompt-preview" class="persona-generator-preview" hidden></pre>

                <div class="persona-generator-section" id="persona-edit-result-section" style="display: none;">
                    <label>New Description:</label>
                    <textarea id="persona-edit-result" rows="8"></textarea>
                    <div class="persona-generator-result-actions">
                        <button id="persona-edit-save" class="persona-generator-btn primary">
                            <i class="fa-solid fa-save"></i> <span>Save Changes</span>
                        </button>
                        <button id="persona-edit-save-copy" class="persona-generator-btn secondary">Save as New Persona</button>
                        <button id="persona-edit-discard" class="persona-generator-btn secondary">Discard Draft</button>
                        <button id="persona-edit-copy" class="persona-generator-btn secondary">
                            <i class="fa-solid fa-copy"></i> Copy to Clipboard
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function setupEditPopupEventListeners(popup, personas, personaDescriptions, characters) {
    const overlay = popup.querySelector('.persona-generator-overlay');
    const closeBtn = popup.querySelector('#persona-edit-close');
    const select = popup.querySelector('#persona-edit-select');
    const currentTextarea = popup.querySelector('#persona-edit-current');
    const generateBtn = popup.querySelector('#persona-edit-generate');
    const saveBtn = popup.querySelector('#persona-edit-save');
    const copyBtn = popup.querySelector('#persona-edit-copy');

    const close = () => {
        if (!popup.dataset.saving) popup.remove();
    };
    overlay.addEventListener('click', close);
    closeBtn.addEventListener('click', close);

    const fields = id => popup.querySelector(`#persona-edit-${id}`);
    const history = fields('history');
    const sourceFilter = fields('source');
    const favorites = fields('favorites');
    const favorite = fields('favorite');
    const search = fields('search');
    const facts = fields('facts');
    const tags = fields('tags');
    const tagFilter = fields('tag-filter');
    const archived = fields('archived');
    const archiveFilter = fields('archive-filter');
    const card = fields('roleplay-card');

    function showSelection() {
        const avatarId = select.value;
        const record = personaRecord(avatarId);
        const draft = getSettings().editDraft;
        currentTextarea.value = personaDescriptions[avatarId]?.description || '';
        hideEditDraft(popup);
        fields('request').value = '';
        fields('target').value = '';
        facts.value = (record.facts ?? []).join('\n');
        favorite.checked = Boolean(record.favorite);
        archived.checked = Boolean(record.archived);
        tags.value = (record.tags ?? []).join(', ');
        card.value = record.roleplayCard ?? '';
        fields('roleplay-controls').hidden = !avatarId;
        fields('prompt-preview').hidden = true;
        fields('preview').setAttribute('aria-expanded', 'false');
        favorite.disabled = !avatarId;
        archived.disabled = !avatarId;
        tags.disabled = !avatarId;
        fields('preview').disabled = !avatarId;
        facts.disabled = !avatarId;
        generateBtn.disabled = !avatarId;
        fields('empty').hidden = Boolean(avatarId);
        history.replaceChildren(...(record.history ?? []).map((version, index) => {
            const date = new Date(version.timestamp).toLocaleString();
            return new Option(date, String(index));
        }));
        fields('history-controls').hidden = history.options.length === 0;
        if (draft?.avatarId === avatarId) showEditDraft(popup, draft, characters);
    }

    function filterPersonas(preferred = select.value) {
        const query = search.value.trim().toLocaleLowerCase();
        const sources = [...new Set(Object.keys(personas).flatMap(id => personaRecord(id).sources ?? []))].sort();
        const source = sourceFilter.value;
        sourceFilter.replaceChildren(new Option('All characters', ''), ...sources.map(name => new Option(name, name)));
        if (sources.includes(source)) sourceFilter.value = source;
        refreshTagOptions();
        const filtered = Object.entries(personas).filter(([id, name]) => {
            const record = personaRecord(id);
            const text = `${name} ${personaDescriptions[id]?.description ?? ''}`.toLocaleLowerCase();
            return text.includes(query) && (!favorites.checked || record.favorite)
                && (!sourceFilter.value || record.sources?.includes(sourceFilter.value))
                && (!tagFilter.value || record.tags?.includes(tagFilter.value))
                && (archiveFilter.value === 'all' || Boolean(record.archived) === (archiveFilter.value === 'archived'));
        });
        select.replaceChildren(...filtered.map(([id, name]) => new Option(name, id)));
        if (filtered.some(([id]) => id === preferred)) select.value = preferred;
        showSelection();
    }

    for (const field of [search, sourceFilter, favorites, tagFilter, archiveFilter]) {
        field.addEventListener('input', () => filterPersonas());
    }
    select.addEventListener('change', showSelection);
    favorite.addEventListener('change', () => {
        if (!select.value) return;
        savePersonaRecord(select.value, { favorite: favorite.checked });
        if (favorites.checked) filterPersonas();
    });
    archived.addEventListener('change', () => {
        if (!select.value) return;
        savePersonaRecord(select.value, { archived: archived.checked });
        filterPersonas();
    });
    tags.addEventListener('change', () => {
        if (!select.value) return;
        savePersonaRecord(select.value, { tags: [...new Set(tags.value.split(',').map(tag => tag.trim()).filter(Boolean))] });
        if (tagFilter.value) filterPersonas();
        else refreshTagOptions();
    });

    function refreshTagOptions() {
        const allTags = [...new Set(Object.keys(personas).flatMap(id => personaRecord(id).tags ?? []))].sort();
        const tag = tagFilter.value;
        tagFilter.replaceChildren(new Option('All tags', ''), ...allTags.map(value => new Option(value, value)));
        if (allTags.includes(tag)) tagFilter.value = tag;
    }

    card.addEventListener('input', () => {
        if (select.value) savePersonaRecord(select.value, { roleplayCard: card.value });
    });
    fields('generate-card').addEventListener('click', () => generateRoleplayCard(popup, personas, personaDescriptions));
    fields('preview').addEventListener('click', () => {
        const input = readEditInput(popup, personas, personaDescriptions, characters);
        if (input) showPromptPreview(popup, 'edit', input.prompt);
    });
    fields('copy-avatar-mode').addEventListener('change', () => {
        fields('copy-avatar').hidden = fields('copy-avatar-mode').value !== 'custom';
    });
    setupLibraryBackup(popup, filterPersonas);
    facts.addEventListener('input', () => {
        if (!select.value) return;
        savePersonaRecord(select.value, { facts: protectedFacts(facts.value) });
        updateEditReview(popup);
    });
    fields('preview-history').addEventListener('click', () => {
        const avatarId = select.value;
        const version = personaRecord(avatarId).history?.[Number(history.value)];
        if (!version || generateBtn.disabled) return;
        const draft = {
            avatarId,
            text: version.text,
            request: '',
            copyName: `${personas[avatarId]} (Copy)`,
            restoreVersion: true,
        };
        saveDraft('editDraft', draft);
        showEditDraft(popup, draft, characters);
    });
    generateBtn.addEventListener('click', () => handleEditGenerate(popup, personas, personaDescriptions, characters));
    saveBtn.addEventListener('click', async () => {
        if (await handleEditSave(popup)) filterPersonas();
    });
    fields('save-copy').addEventListener('click', async () => {
        if (await handleEditSave(popup, true)) filterPersonas();
    });
    copyBtn.addEventListener('click', () => handleEditCopy(popup));
    fields('discard').addEventListener('click', () => {
        if (generateBtn.disabled || !confirm('Discard this edit draft?')) return;
        saveDraft('editDraft', null);
        hideEditDraft(popup);
    });
    for (const [id, key] of [['result', 'text'], ['copy-name', 'copyName'], ['request', 'request']]) {
        const input = fields(id);
        input.addEventListener('input', () => {
            const draft = getSettings().editDraft;
            if (draft?.avatarId === select.value) saveDraft('editDraft', { ...draft, [key]: input.value });
            if (id === 'result') updateEditReview(popup);
        });
    }
    const savedAvatarId = getSettings().editDraft?.avatarId;
    if (savedAvatarId && personaRecord(savedAvatarId).archived) archiveFilter.value = 'archived';
    filterPersonas(savedAvatarId);

    popup.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
    });
}

function showEditDraft(popup, draft, characters) {
    const result = popup.querySelector('#persona-edit-result');
    result.dataset.avatarId = draft.avatarId;
    result.value = draft.text;
    popup.querySelector('#persona-edit-request').value = draft.request;
    const targetIndex = characters.findIndex(card => draft.targetId && (card.avatar || card.name) === draft.targetId);
    popup.querySelector('#persona-edit-target').value = targetIndex >= 0 ? String(targetIndex) : '';
    popup.querySelector('#persona-edit-copy-name').value = draft.copyName;
    popup.querySelector('#persona-edit-result-section').style.display = 'block';
    updateEditReview(popup);
}

function updateEditReview(popup) {
    const original = popup.querySelector('#persona-edit-current').value;
    const result = popup.querySelector('#persona-edit-result');
    const missing = missingFacts(result.value, protectedFacts(popup.querySelector('#persona-edit-facts').value));
    const status = popup.querySelector('#persona-edit-fact-status');
    status.textContent = result.dataset.avatarId && missing.length ? `Missing protected phrases: ${missing.join('; ')}` : '';

    const before = original.split('\n');
    const after = result.value.split('\n');
    popup.querySelector('#persona-edit-removed').textContent = differentLines(before, after).join('\n');
    popup.querySelector('#persona-edit-added').textContent = differentLines(after, before).join('\n');
    const draft = getSettings().editDraft;
    const adaptation = result.dataset.avatarId && draft?.targetSource;
    const restore = result.dataset.avatarId && draft?.restoreVersion;
    const save = popup.querySelector('#persona-edit-save');
    save.disabled = Boolean(adaptation);
    save.querySelector('span').textContent = restore ? 'Restore This Version' : 'Save Changes';
    popup.querySelector('#persona-edit-result-mode').textContent = adaptation
        ? `Adaptation for ${adaptation}. Save it as a new persona to keep the original.`
        : '';
}

function differentLines(lines, comparison) {
    const occurrences = new Map();
    for (const line of comparison) occurrences.set(line, (occurrences.get(line) ?? 0) + 1);
    return lines.filter(line => {
        const count = occurrences.get(line) ?? 0;
        if (!count) return true;
        occurrences.set(line, count - 1);
        return false;
    });
}

function hideEditDraft(popup) {
    const result = popup.querySelector('#persona-edit-result');
    result.value = '';
    delete result.dataset.avatarId;
    popup.querySelector('#persona-edit-copy-name').value = '';
    popup.querySelector('#persona-edit-copy-avatar').value = '';
    popup.querySelector('#persona-edit-copy-avatar').hidden = true;
    popup.querySelector('#persona-edit-copy-avatar-mode').value = 'original';
    popup.querySelector('#persona-edit-result-section').style.display = 'none';
}

function setEditBusy(popup, busy) {
    for (const id of ['generate', 'select', 'save', 'save-copy', 'discard', 'target', 'preview-history', 'search', 'source', 'favorites', 'favorite', 'archived', 'tag-filter', 'archive-filter', 'preview', 'generate-card', 'copy-avatar-mode', 'copy-avatar', 'export-backup', 'backup-file', 'import-conflict']) {
        popup.querySelector(`#persona-edit-${id}`).disabled = busy;
    }
    for (const id of ['result', 'request', 'copy-name', 'facts', 'tags', 'roleplay-card']) {
        popup.querySelector(`#persona-edit-${id}`).readOnly = busy;
    }
    if (!busy) {
        const hasSelection = Boolean(popup.querySelector('#persona-edit-select').value);
        for (const id of ['generate', 'favorite', 'archived', 'preview']) {
            popup.querySelector(`#persona-edit-${id}`).disabled = !hasSelection;
        }
        updateEditReview(popup);
    }
}

function readEditInput(popup, personas, personaDescriptions, characters) {
    const select = popup.querySelector('#persona-edit-select');
    const requestTextarea = popup.querySelector('#persona-edit-request');
    const generateBtn = popup.querySelector('#persona-edit-generate');
    if (generateBtn.disabled) return;

    const avatarId = select.value;
    const currentDescription = personaDescriptions[avatarId]?.description || '';
    if (!Object.hasOwn(personas, avatarId)) {
        toastr.warning('Select a persona first.');
        return;
    }

    const userRequest = requestTextarea.value.trim();
    const personaName = personas[avatarId] || 'Unknown';

    const targetIndex = popup.querySelector('#persona-edit-target').value;
    const target = targetIndex === '' ? null : characters[Number(targetIndex)];
    const facts = protectedFacts(popup.querySelector('#persona-edit-facts').value);
    if (!userRequest && !target) {
        toastr.warning('Describe the changes or choose a character to adapt to.');
        return;
    }

    return {
        avatarId, personaName, userRequest, target,
        prompt: buildEditPrompt(personaName, currentDescription, userRequest, facts, target),
    };
}

async function handleEditGenerate(popup, personas, personaDescriptions, characters) {
    const generateBtn = popup.querySelector('#persona-edit-generate');
    if (generateBtn.disabled) return;
    const input = readEditInput(popup, personas, personaDescriptions, characters);
    if (!input) return;
    const { avatarId, personaName, userRequest, target, prompt } = input;

    setEditBusy(popup, true);
    const initialLabel = generateBtn.innerHTML;
    generateBtn.textContent = 'Generating...';
    try {
        const text = await generatePersonaText(prompt);
        if (!popup.isConnected || popup.querySelector('#persona-edit-select').value !== avatarId) return;

        const previous = getSettings().editDraft;
        const copyName = previous?.avatarId === avatarId ? previous.copyName : `${personaName} (Copy)`;
        const draft = {
            avatarId,
            text,
            request: userRequest,
            copyName,
            targetId: target ? target.avatar || target.name : null,
            targetSource: target?.name || null,
        };
        saveDraft('editDraft', draft);
        showEditDraft(popup, draft, characters);
        toastr.success('Changes generated successfully!');
    } catch (error) {
        console.error('Error generating changes:', error);
        toastr.error('Failed to generate changes. Check console for details.');
    } finally {
        generateBtn.innerHTML = initialLabel;
        setEditBusy(popup, false);
    }
}

function buildEditPrompt(personaName, currentDescription, userRequest, facts = [], target = null) {
    return `You are an expert persona editor for roleplay scenarios. You need to modify an existing persona description based on the user's request.

CURRENT PERSONA NAME: ${personaName}

CURRENT PERSONA DESCRIPTION:
${currentDescription || '(No description yet)'}

USER'S REQUEST:
${userRequest || '(No additional instructions)'}
${target ? `\nTARGET CHARACTER:\n${characterCardContext(target)}\nPreserve the persona's identity, voice, and personality. Rewrite the relationship and the opening hook for the target character's setting.\n` : ''}
${facts.length ? `\nPROTECTED PHRASES (keep each phrase verbatim):\n${facts.map(fact => `- ${fact}`).join('\n')}\n` : ''}
INSTRUCTIONS:
- Apply the requested changes to the persona description
- Keep the same writing style and format as the original
- Maintain consistency with the existing content
- If the request is unclear, make reasonable interpretations
- Do NOT add any meta-commentary or explanations
- Return ONLY the modified persona description, nothing else

Generate the updated persona description:`;
}

async function handleEditSave(popup, asCopy = false) {
    const select = popup.querySelector('#persona-edit-select');
    const resultTextarea = popup.querySelector('#persona-edit-result');
    const saveButton = popup.querySelector('#persona-edit-save');
    const generateButton = popup.querySelector('#persona-edit-generate');
    if (generateButton.disabled || (!asCopy && saveButton.disabled)) return;

    const avatarId = resultTextarea.dataset.avatarId;
    const description = resultTextarea.value;
    const draft = getSettings().editDraft;
    if ((!description.trim() && (asCopy || !draft?.restoreVersion)) || !avatarId || select.value !== avatarId) {
        toastr.warning('Generate changes for the selected persona first.');
        return;
    }

    const record = personaRecord(avatarId);
    const facts = protectedFacts(popup.querySelector('#persona-edit-facts').value);
    if (missingFacts(description, facts).length) {
        toastr.warning('Restore the missing protected phrases before saving.');
        return;
    }
    if (!asCopy && draft?.targetSource) return;
    const copyName = popup.querySelector('#persona-edit-copy-name').value.trim();
    if (asCopy && !copyName) {
        toastr.warning('Enter a name for the new persona.');
        return;
    }

    popup.dataset.saving = 'true';
    setEditBusy(popup, true);
    try {
        if (asCopy) {
            const mode = popup.querySelector('#persona-edit-copy-avatar-mode').value;
            const file = popup.querySelector('#persona-edit-copy-avatar').files[0];
            if (mode === 'custom' && !file) {
                toastr.warning('Choose an avatar image for the copy.');
                return;
            }
            const avatar = mode === 'original' ? await getPersonaAvatar(avatarId) : mode === 'custom' ? await readAvatarImage(file) : null;
            const newId = await createPersona(copyName, description, avatar);
            savePersonaRecord(newId, { facts, tags: record.tags ?? [], sources: draft?.targetSource ? [draft.targetSource] : record.sources ?? [] });
            return true;
        }

        const { SlashCommandParser, powerUserSettings } = SillyTavern.getContext();
        if (!Object.hasOwn(powerUserSettings.personas, avatarId)) {
            throw new Error('The selected persona no longer exists.');
        }

        // The 1.19.0 command can prefer the active persona's name over an avatar ID.
        const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const normalizedId = normalize(avatarId);
        const ambiguous = Object.entries(powerUserSettings.personas).some(
            ([id, name]) => id !== avatarId && normalize(name) === normalizedId,
        );
        if (ambiguous) {
            toastr.warning('Another persona uses this avatar ID as its name. Rename that persona before saving.');
            return;
        }

        const previousDescription = powerUserSettings.persona_descriptions?.[avatarId]?.description ?? '';
        const updatedId = await SlashCommandParser.commands['persona-update'].callback({
            persona: avatarId,
            description,
        });
        if (updatedId !== avatarId) throw new Error('SillyTavern could not update the selected persona.');

        if (previousDescription !== description) {
            const previous = { text: previousDescription, timestamp: Date.now() };
            savePersonaRecord(avatarId, { history: [previous, ...(record.history ?? [])].slice(0, 10) });
        }
        popup.querySelector('#persona-edit-current').value = description;
        saveDraft('editDraft', null);
        hideEditDraft(popup);
        return true;
    } catch (error) {
        console.error('Error saving persona:', error);
        toastr.error(asCopy ? 'Failed to save a new persona.' : 'Failed to save persona changes.');
    } finally {
        delete popup.dataset.saving;
        setEditBusy(popup, false);
    }
}

function backupPersonaSettings(source) {
    const settings = {};
    for (const key of ['title', 'lorebook']) {
        if (typeof source?.[key] === 'string') settings[key] = source[key];
    }
    for (const key of ['position', 'role', 'depth']) {
        if (Number.isInteger(source?.[key])) settings[key] = source[key];
    }
    return settings;
}

function backupLibraryRecord(source) {
    const record = {};
    for (const key of ['facts', 'sources', 'tags']) {
        if (Array.isArray(source?.[key])) {
            record[key] = [...new Set(source[key].filter(value => typeof value === 'string' && value.trim()))];
        }
    }
    for (const key of ['favorite', 'archived']) {
        if (typeof source?.[key] === 'boolean') record[key] = source[key];
    }
    if (typeof source?.roleplayCard === 'string') record.roleplayCard = source.roleplayCard;
    if (Array.isArray(source?.history)) {
        record.history = source.history
            .filter(version => typeof version?.text === 'string' && Number.isFinite(version.timestamp))
            .slice(0, 10)
            .map(({ text, timestamp }) => ({ text, timestamp }));
    }
    return record;
}

function parseLibraryBackup(value) {
    if (value?.format !== LIBRARY_BACKUP_FORMAT || value.version !== 1 || !Array.isArray(value.personas)) {
        throw new Error('Choose a Persona Generator library backup.');
    }
    return value.personas.map((entry, index) => {
        if (typeof entry?.name !== 'string' || !entry.name.trim()
            || typeof entry.description !== 'string' || !isAvatarData(entry.avatar)) {
            throw new Error(`Invalid persona entry at position ${index + 1}.`);
        }
        return {
            name: entry.name.trim(),
            description: entry.description,
            avatar: entry.avatar,
            settings: backupPersonaSettings(entry.settings),
            record: backupLibraryRecord(entry.record),
        };
    });
}

async function buildLibraryBackup() {
    const { powerUserSettings } = SillyTavern.getContext();
    const entries = [];
    for (const [avatarId, name] of Object.entries(powerUserSettings.personas)) {
        const descriptor = powerUserSettings.persona_descriptions?.[avatarId];
        const entry = {
            name,
            description: descriptor?.description ?? '',
            avatar: await getPersonaAvatar(avatarId),
            settings: backupPersonaSettings(descriptor),
            record: backupLibraryRecord(personaRecord(avatarId)),
        };
        entries.push(entry);
    }
    return { format: LIBRARY_BACKUP_FORMAT, version: 1, personas: entries };
}

function importPersonaName(name, used, policy) {
    const normalize = value => value.trim().normalize('NFC').toLowerCase();
    if (!used.has(normalize(name))) {
        used.add(normalize(name));
        return name;
    }
    if (policy === 'skip') return null;

    let number = 1;
    let candidate;
    do {
        candidate = `${name} (Imported ${number++})`;
    } while (used.has(normalize(candidate)));
    used.add(normalize(candidate));
    return candidate;
}

function setupLibraryBackup(popup, refreshLibrary) {
    const fields = id => popup.querySelector(`#persona-edit-${id}`);
    const file = fields('backup-file');
    const exportButton = fields('export-backup');
    const importButton = fields('import-backup');
    const policy = fields('import-conflict');
    const controls = fields('import-controls');
    const status = fields('backup-status');
    const preview = fields('import-preview');
    let entries = [];
    let imported = new Map();

    function planImport() {
        const { powerUserSettings } = SillyTavern.getContext();
        const used = new Set(Object.values(powerUserSettings.personas).map(name => name.trim().normalize('NFC').toLowerCase()));
        return entries.map((entry, index) => imported.get(index) ?? importPersonaName(entry.name, used, policy.value));
    }

    function showPreview() {
        const plan = planImport();
        preview.replaceChildren(...entries.map((entry, index) => {
            const row = document.createElement('li');
            const name = plan[index];
            row.textContent = imported.has(index) ? `${name} (imported)`
                : !name ? `${entry.name} (skip: name already exists)`
                    : name === entry.name ? `${name} (add)` : `${entry.name} → ${name}`;
            return row;
        }));
        importButton.disabled = plan.every((name, index) => !name || imported.has(index));
    }

    file.addEventListener('change', async () => {
        const selected = file.files[0];
        entries = [];
        imported = new Map();
        controls.hidden = true;
        importButton.disabled = true;
        status.textContent = '';
        if (!selected) return;
        try {
            const parsed = parseLibraryBackup(JSON.parse(await selected.text()));
            if (!popup.isConnected || file.files[0] !== selected) return;
            entries = parsed;
            controls.hidden = entries.length === 0;
            showPreview();
            status.textContent = entries.length ? `${entries.length} personas ready to review.` : 'This backup is empty.';
        } catch (error) {
            if (!popup.isConnected || file.files[0] !== selected) return;
            status.textContent = error instanceof SyntaxError ? 'The selected file is not valid JSON.' : error.message;
        }
    });
    policy.addEventListener('change', showPreview);

    exportButton.addEventListener('click', async () => {
        setEditBusy(popup, true);
        status.textContent = 'Preparing backup with avatars…';
        try {
            const backup = await buildLibraryBackup();
            if (!popup.isConnected) return;
            downloadJson(backup, 'persona-generator-library.json');
            status.textContent = `Exported ${backup.personas.length} personas.`;
        } catch (error) {
            status.textContent = `Backup failed: ${error.message}`;
        } finally {
            setEditBusy(popup, false);
            showPreview();
        }
    });

    importButton.addEventListener('click', async () => {
        if (importButton.disabled || exportButton.disabled) return;
        const plan = planImport();
        importButton.disabled = true;
        const failures = [];
        let added = 0;
        popup.dataset.saving = 'true';
        setEditBusy(popup, true);
        status.textContent = 'Importing personas…';
        try {
            for (const [index, name] of plan.entries()) {
                if (!name || imported.has(index)) continue;
                const entry = entries[index];
                try {
                    await validateAvatarImage(entry.avatar);
                    const avatarId = await createPersona(name, entry.description, entry.avatar, entry.settings);
                    savePersonaRecord(avatarId, entry.record);
                    imported.set(index, name);
                    added++;
                } catch (error) {
                    console.error('Persona import failed:', error);
                    failures.push(name);
                }
            }
            refreshLibrary();
            const skipped = plan.filter(name => !name).length;
            status.textContent = `Imported ${added}. Skipped ${skipped} due to name conflicts.`
                + (failures.length ? ` Failed: ${failures.join(', ')}. You can retry those entries.` : '');
        } finally {
            delete popup.dataset.saving;
            setEditBusy(popup, false);
            showPreview();
        }
    });
}

async function generateRoleplayCard(popup, personas, personaDescriptions) {
    const avatarId = popup.querySelector('#persona-edit-select').value;
    const input = popup.querySelector('#persona-edit-roleplay-card');
    const button = popup.querySelector('#persona-edit-generate-card');
    if (button.disabled || !Object.hasOwn(personas, avatarId)) return;
    const description = personaDescriptions[avatarId]?.description?.trim();
    if (!description) {
        toastr.warning('Add a description to this persona before generating a reference card.');
        return;
    }

    setEditBusy(popup, true);
    try {
        const prompt = `Create a short roleplay reference card for ${personas[avatarId]}. Include voice and mannerisms, current goals, and two example replies. Use the facts in the persona description. Return only the card.\n\n${description}`;
        const text = await generatePersonaText(prompt, 350);
        if (!popup.isConnected) return;
        input.value = text;
        savePersonaRecord(avatarId, { roleplayCard: text });
    } catch (error) {
        console.error('Error generating roleplay reference card:', error);
        toastr.error('Could not generate the reference card.');
    } finally {
        setEditBusy(popup, false);
    }
}

function handleEditCopy(popup) {
    const resultTextarea = popup.querySelector('#persona-edit-result');
    const text = resultTextarea.value;

    if (!text) {
        toastr.warning('No text to copy.');
        return;
    }

    navigator.clipboard.writeText(text).then(() => {
        toastr.success('Copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy:', err);
        toastr.error('Failed to copy to clipboard.');
    });
}

function openPromptEditor() {
    const existing = document.getElementById('persona-prompt-editor-popup');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.id = 'persona-prompt-editor-popup';
    popup.className = 'persona-generator-popup';
    popup.innerHTML = buildPromptEditorHTML();

    document.body.appendChild(popup);
    setupPromptEditorEventListeners(popup);
}

function buildPromptEditorHTML() {
    const prompts = getAllPrompts();
    
    const promptListHTML = prompts.map((prompt, index) => `
        <div class="prompt-item" data-id="${prompt.id}">
            <div class="prompt-item-header">
                <span class="prompt-name">${escapeHTML(prompt.name)}</span>
                ${prompt.builtIn 
                    ? '<span class="prompt-badge built-in">Built-in</span>'
                    : `<div class="prompt-actions">
                        <button class="prompt-edit-btn" data-index="${index}" title="Edit">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="prompt-delete-btn" data-index="${index}" title="Delete">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>`
                }
            </div>
        </div>
    `).join('');

    return `
        <div class="persona-generator-overlay"></div>
        <div class="persona-generator-modal" style="max-width: 700px;">
            <div class="persona-generator-header">
                <h2>Edit Prompts</h2>
                <button class="persona-generator-close" id="prompt-editor-close">&times;</button>
            </div>
            
            <div class="persona-generator-content" role="region" aria-label="Prompt editor form" tabindex="0">
                <div class="persona-generator-section">
                    <label>Available Prompts:</label>
                    <div class="prompt-list" id="prompt-list">
                        ${promptListHTML}
                    </div>
                </div>

                <div class="persona-generator-actions">
                    <button id="prompt-editor-add" class="persona-generator-btn primary">
                        <i class="fa-solid fa-plus"></i> Add New Prompt
                    </button>
                </div>

                <div class="persona-generator-section" id="prompt-editor-section" style="display: none;">
                    <label id="prompt-editor-label">Edit Prompt:</label>
                    <div class="persona-generator-section">
                        <label>Prompt Name:</label>
                        <input type="text" id="prompt-editor-name" placeholder="My Custom Prompt" />
                    </div>
                    <div class="persona-generator-section">
                        <label>System Prompt (instructions for the AI):</label>
                        <textarea id="prompt-editor-system" rows="6" placeholder="You are an expert persona designer..."></textarea>
                    </div>
                    <div class="persona-generator-section">
                        <label>User Template (use {name}, {userPrefs}, {cardContext} as placeholders):</label>
                        <textarea id="prompt-editor-template" rows="8" placeholder="Create a persona for the user who will interact with {name}..."></textarea>
                    </div>
                    <div class="persona-generator-result-actions">
                        <button id="prompt-editor-save" class="persona-generator-btn primary">
                            <i class="fa-solid fa-save"></i> Save Prompt
                        </button>
                        <button id="prompt-editor-cancel" class="persona-generator-btn secondary">
                            <i class="fa-solid fa-xmark"></i> Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function setupPromptEditorEventListeners(popup) {
    const overlay = popup.querySelector('.persona-generator-overlay');
    const closeBtn = popup.querySelector('#prompt-editor-close');
    const addBtn = popup.querySelector('#prompt-editor-add');
    const saveBtn = popup.querySelector('#prompt-editor-save');
    const cancelBtn = popup.querySelector('#prompt-editor-cancel');

    overlay.addEventListener('click', () => popup.remove());
    closeBtn.addEventListener('click', () => popup.remove());
    
    addBtn.addEventListener('click', () => {
        showPromptEditor(popup, null, -1);
    });
    
    saveBtn.addEventListener('click', () => handleSavePrompt(popup));
    cancelBtn.addEventListener('click', () => {
        popup.querySelector('#prompt-editor-section').style.display = 'none';
    });

    // Edit buttons
    popup.querySelectorAll('.prompt-edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(btn.dataset.index);
            const prompts = getAllPrompts();
            const prompt = prompts[index];
            if (prompt && !prompt.builtIn) {
                showPromptEditor(popup, prompt, index);
            }
        });
    });

    // Delete buttons
    popup.querySelectorAll('.prompt-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(btn.dataset.index);
            const prompts = getAllPrompts();
            const prompt = prompts[index];
            if (prompt && !prompt.builtIn && confirm(`Delete prompt "${prompt.name}"?`)) {
                const customIndex = parseInt(prompt.id.replace('custom_', ''));
                deleteCustomPrompt(customIndex);
                refreshPromptList(popup);
                toastr.success('Prompt deleted!');
            }
        });
    });

    popup.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') popup.remove();
    });
}

function showPromptEditor(popup, prompt, index) {
    const section = popup.querySelector('#prompt-editor-section');
    const label = popup.querySelector('#prompt-editor-label');
    const nameInput = popup.querySelector('#prompt-editor-name');
    const systemTextarea = popup.querySelector('#prompt-editor-system');
    const templateTextarea = popup.querySelector('#prompt-editor-template');

    if (prompt) {
        label.textContent = 'Edit Prompt:';
        nameInput.value = prompt.name;
        systemTextarea.value = prompt.systemPrompt || '';
        templateTextarea.value = prompt.userTemplate || '';
        section.dataset.editIndex = index;
        section.dataset.customIndex = prompt.id.startsWith('custom_') ? prompt.id.replace('custom_', '') : '';
    } else {
        label.textContent = 'Add New Prompt:';
        nameInput.value = '';
        systemTextarea.value = '';
        templateTextarea.value = '';
        section.dataset.editIndex = '-1';
        section.dataset.customIndex = '';
    }

    section.style.display = 'block';
}

function handleSavePrompt(popup) {
    const section = popup.querySelector('#prompt-editor-section');
    const nameInput = popup.querySelector('#prompt-editor-name');
    const systemTextarea = popup.querySelector('#prompt-editor-system');
    const templateTextarea = popup.querySelector('#prompt-editor-template');

    const name = nameInput.value.trim();
    const systemPrompt = systemTextarea.value.trim();
    const userTemplate = templateTextarea.value.trim();

    if (!name) {
        toastr.warning('Please enter a prompt name.');
        return;
    }

    const promptData = { name, systemPrompt, userTemplate };
    const editIndex = parseInt(section.dataset.editIndex);
    const customIndex = section.dataset.customIndex;

    if (customIndex !== '' && !isNaN(parseInt(customIndex))) {
        // Update existing custom prompt
        updateCustomPrompt(parseInt(customIndex), promptData);
        toastr.success('Prompt updated!');
    } else {
        // Add new custom prompt
        saveCustomPrompt(promptData);
        toastr.success('Prompt added!');
    }

    section.style.display = 'none';
    refreshPromptList(popup);
}

function refreshPromptList(popup) {
    const list = popup.querySelector('#prompt-list');
    const prompts = getAllPrompts();
    
    list.innerHTML = prompts.map((prompt, index) => `
        <div class="prompt-item" data-id="${prompt.id}">
            <div class="prompt-item-header">
                <span class="prompt-name">${escapeHTML(prompt.name)}</span>
                ${prompt.builtIn 
                    ? '<span class="prompt-badge built-in">Built-in</span>'
                    : `<div class="prompt-actions">
                        <button class="prompt-edit-btn" data-index="${index}" title="Edit">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="prompt-delete-btn" data-index="${index}" title="Delete">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>`
                }
            </div>
        </div>
    `).join('');

    // Re-attach event listeners
    popup.querySelectorAll('.prompt-edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(btn.dataset.index);
            const p = prompts[index];
            if (p && !p.builtIn) {
                showPromptEditor(popup, p, index);
            }
        });
    });

    popup.querySelectorAll('.prompt-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(btn.dataset.index);
            const p = prompts[index];
            if (p && !p.builtIn && confirm(`Delete prompt "${p.name}"?`)) {
                const customIndex = parseInt(p.id.replace('custom_', ''));
                deleteCustomPrompt(customIndex);
                refreshPromptList(popup);
                toastr.success('Prompt deleted!');
            }
        });
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
    
    // Create "Edit Persona" menu item
    const editMenuItem = document.createElement('a');
    editMenuItem.id = 'option_edit_persona';
    editMenuItem.innerHTML = `
        <i class="fa-lg fa-solid fa-user-pen"></i>
        <span>Edit Persona</span>
    `;
    editMenuItem.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditPersonaPopup();
    });
    
    // Create "Persona Generator" menu item
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
        insertAfterLink.parentNode.insertBefore(editMenuItem, insertAfterLink.nextSibling);
        insertAfterLink.parentNode.insertBefore(menuItem, editMenuItem.nextSibling);
        console.log(`${EXTENSION_NAME} menu items inserted after ${insertAfterLink.textContent}`);
    } else {
        optionsContent.appendChild(editMenuItem);
        optionsContent.appendChild(menuItem);
        console.log(`${EXTENSION_NAME} menu items appended to options menu`);
    }
}

async function addExtensionSettings() {
    const response = await fetch(new URL('./settings.html', import.meta.url));
    if (!response.ok) throw new Error('Failed to load Persona Generator settings.');
    const $panel = $(await response.text());
    const $settings = $('#extensions_settings2').length ? $('#extensions_settings2') : $('#extensions_settings');
    $settings.append($panel);

    const settings = getSettings();
    for (const key of ['style', 'person', 'gender', 'age', 'species']) {
        const $input = $panel.find(`#persona_gen_${key}`);
        $input.on('change', () => {
            settings[key] = $input.val();
            saveSettings();
        });
    }

    updateSettingsPanel();
    $panel.find('#persona_gen_open').on('click', openPersonaGeneratorPopup);
    $panel.find('#persona_gen_edit_prompts_btn').on('click', openPromptEditor);
}

function updateSettingsPanel() {
    const style = document.querySelector('#persona_gen_style');
    if (!style) return;

    const settings = getSettings();
    style.replaceChildren(...getAllPrompts().map(prompt => new Option(prompt.name, prompt.id)));
    style.value = settings.style;
    for (const key of ['person', 'gender', 'age', 'species']) {
        document.querySelector(`#persona_gen_${key}`).value = settings[key];
    }
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
            addExtensionSettings().catch(error => console.error(error));
            // Add toolbar button with a delay to ensure DOM is ready
            setTimeout(() => {
                addToolbarButton();
                console.log(`${EXTENSION_NAME} loaded successfully`);
            }, 500);
        });
    }

    initExtension();
})();
