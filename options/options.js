// Default prompts
const DEFAULT_PROMPTS = [
  { enabled: true, name: "Explain", text: "Explain: %s", contextWords: 0 },
  { enabled: true, name: "Translate", text: "Translate to English: %c", contextWords: 0 },
  { enabled: true, name: "Summarize", text: "Summarize: %s", contextWords: 0 },
  { enabled: false, name: "", text: "", contextWords: 0 },
  { enabled: false, name: "", text: "", contextWords: 0 }
];

let recordingInput = null;
let saveTimeout = null;

// Load saved prompts and populate form
async function loadPrompts() {
  const data = await browser.storage.sync.get("prompts");
  let prompts = data.prompts;

  // Check if prompts exist and first 3 have names
  let needsReset = !prompts || !Array.isArray(prompts) || prompts.length < 5;

  if (!needsReset) {
    for (let i = 0; i < 3; i++) {
      if (!prompts[i] || !prompts[i].name || prompts[i].name.trim() === "") {
        needsReset = true;
        break;
      }
    }
  }

  if (needsReset) {
    prompts = DEFAULT_PROMPTS;
    await browser.storage.sync.set({ prompts: DEFAULT_PROMPTS });
  }

  // Populate form
  for (let i = 0; i < 5; i++) {
    const prompt = prompts[i] || {};
    const defaultPrompt = DEFAULT_PROMPTS[i];

    const enabled = prompt.enabled !== undefined ? prompt.enabled : defaultPrompt.enabled;
    const name = (prompt.name && prompt.name.trim()) || defaultPrompt.name || "";
    const text = (prompt.text && prompt.text.trim()) || defaultPrompt.text || "";

    document.getElementById(`prompt${i + 1}-enabled`).checked = enabled;
    document.getElementById(`prompt${i + 1}-name`).value = name;
    document.getElementById(`prompt${i + 1}-text`).value = text;
    document.getElementById(`prompt${i + 1}-context`).value = prompt.contextWords || 0;
    updatePromptDisabledState(i + 1);
  }
}

// Toggle disabled state of a prompt's inputs based on its checkbox
function updatePromptDisabledState(num) {
  const enabled = document.getElementById(`prompt${num}-enabled`).checked;
  const inputs = document.getElementById(`prompt${num}-name`);
  const textarea = document.getElementById(`prompt${num}-text`);
  const contextInput = document.getElementById(`prompt${num}-context`);
  const shortcut = document.getElementById(`prompt${num}-shortcut`);

  for (const el of [inputs, textarea, contextInput, shortcut]) {
    if (el) el.disabled = !enabled;
  }
}

// Auto-save prompts with debounce
function autoSavePrompts() {
  // Clear existing timeout
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  // Debounce - wait 500ms after last change before saving
  saveTimeout = setTimeout(async () => {
    const prompts = [];

    for (let i = 0; i < 5; i++) {
      prompts.push({
        enabled: document.getElementById(`prompt${i + 1}-enabled`).checked,
        name: document.getElementById(`prompt${i + 1}-name`).value.trim(),
        text: document.getElementById(`prompt${i + 1}-text`).value.trim(),
        contextWords: parseInt(document.getElementById(`prompt${i + 1}-context`).value) || 0
      });
    }

    try {
      await browser.storage.sync.set({ prompts });
      showStatus("Saved", "success");
    } catch (e) {
      showStatus("Error saving: " + e.message, "error");
    }
  }, 500);
}

// Reset to default prompts
async function resetPrompts() {
  await browser.storage.sync.set({ prompts: DEFAULT_PROMPTS });

  // Reset shortcuts to defaults
  for (let i = 1; i <= 5; i++) {
    try {
      await browser.commands.reset(`prompt-${i}`);
    } catch (e) {
      // Ignore errors
    }
  }

  await loadPrompts();
  await loadShortcuts();
  showStatus("Reset to defaults", "success");
}

// Show status message
function showStatus(message, type) {
  const status = document.getElementById("status");
  status.textContent = message;
  status.className = "status " + type;

  setTimeout(() => {
    status.textContent = "";
    status.className = "status";
  }, 2000);
}

// Load and display current shortcuts
async function loadShortcuts() {
  const commands = await browser.commands.getAll();
  for (const cmd of commands) {
    let input = null;
    if (cmd.name.startsWith("prompt-")) {
      const num = cmd.name.split("-")[1];
      input = document.getElementById(`prompt${num}-shortcut`);
    }
    if (input) {
      input.value = cmd.shortcut || "";
      input.placeholder = cmd.shortcut ? "" : "Click to set";
    }
  }
}

// Detect if running on Mac
const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform) ||
              (navigator.userAgentData && navigator.userAgentData.platform === 'macOS');

// Convert key event to shortcut string
function keyEventToShortcut(e) {
  const parts = [];

  // On Mac, use "MacCtrl" for the Control key (⌃)
  if (e.ctrlKey) {
    parts.push(isMac ? "MacCtrl" : "Ctrl");
  }
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Command");

  let key = e.key;
  let code = e.code;

  // Skip if only modifier pressed
  if (["Control", "Alt", "Shift", "Meta"].includes(key)) {
    return null;
  }

  // Use physical key code for digits and letters
  if (code.startsWith("Digit")) {
    key = code.replace("Digit", "");
  } else if (code.startsWith("Key")) {
    key = code.replace("Key", "");
  } else if (key === " ") {
    key = "Space";
  } else if (key.startsWith("Arrow")) {
    key = key.replace("Arrow", "");
  } else if (key === "Escape") {
    key = "Escape";
  } else if (key.length === 1) {
    key = key.toUpperCase();
  }

  parts.push(key);

  // Firefox requires at least one modifier
  if (parts.length < 2) {
    return null;
  }

  return parts.join("+");
}

// Format a command name for display in conflict messages
function formatCommandLabel(commandName) {
  const num = commandName.split("-")[1];
  return `Prompt ${num}`;
}

// Setup shortcut recording for a single input
function setupShortcutInput(inputId, commandName) {
  const input = document.getElementById(inputId);
  if (!input) return;

  input.addEventListener("focus", () => {
    recordingInput = input;
    input.classList.add("recording");
    input.value = "Press keys...";
  });

  input.addEventListener("blur", () => {
    input.classList.remove("recording");
    recordingInput = null;
    loadShortcuts();
  });

  input.addEventListener("keydown", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Escape cancels recording and restores the previous shortcut
    if (e.key === "Escape") {
      input.blur();
      return;
    }

    const shortcut = keyEventToShortcut(e);
    if (!shortcut) return;

    // Check if used by another command in our extension
    const existingCommands = await browser.commands.getAll();
    const conflict = existingCommands.find(cmd =>
      cmd.shortcut === shortcut && cmd.name !== commandName
    );

    if (conflict) {
      showStatus(`Already used by ${formatCommandLabel(conflict.name)}`, "error");
      input.blur();
      return;
    }

    try {
      await browser.commands.update({
        name: commandName,
        shortcut: shortcut
      });

      // Verify update
      const updatedCommands = await browser.commands.getAll();
      const updated = updatedCommands.find(cmd => cmd.name === commandName);

      if (updated && updated.shortcut === shortcut) {
        input.value = shortcut;
        input.blur();
        showStatus(`Shortcut: ${shortcut}`, "success");
      } else {
        input.blur();
        showStatus("Failed to update shortcut", "error");
      }
    } catch (err) {
      showStatus(`"${shortcut}" may be in use`, "error");
      input.blur();
    }
  });
}

// Setup shortcut recording
function setupShortcutRecording() {
  for (let i = 1; i <= 5; i++) {
    setupShortcutInput(`prompt${i}-shortcut`, `prompt-${i}`);
  }
}

// Persist just the enabled flag for a single prompt
async function saveEnabledState(promptIndex, enabled) {
  const data = await browser.storage.sync.get("prompts");
  const prompts = data.prompts || DEFAULT_PROMPTS;
  prompts[promptIndex].enabled = enabled;
  await browser.storage.sync.set({ prompts });
}

// Setup auto-save listeners
function setupAutoSave() {
  for (let i = 1; i <= 5; i++) {
    const checkbox = document.getElementById(`prompt${i}-enabled`);
    checkbox.addEventListener("change", () => {
      updatePromptDisabledState(i);
      saveEnabledState(i - 1, checkbox.checked);
    });
    document.getElementById(`prompt${i}-name`).addEventListener("input", autoSavePrompts);
    document.getElementById(`prompt${i}-text`).addEventListener("input", autoSavePrompts);
    document.getElementById(`prompt${i}-context`).addEventListener("input", autoSavePrompts);
  }
}

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  loadPrompts();
  loadShortcuts();
  setupAutoSave();
  setupShortcutRecording();

  document.getElementById("reset-btn").addEventListener("click", resetPrompts);
});
