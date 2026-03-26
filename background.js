// Load dependencies in service worker (Chrome MV3)
if (typeof importScripts === "function") {
  importScripts("compat.js", "providers.js");
}

console.log("Background script loading...");
console.log("PROVIDERS available:", typeof PROVIDERS !== 'undefined');
console.log("DEFAULT_PROVIDER:", typeof DEFAULT_PROVIDER !== 'undefined' ? DEFAULT_PROVIDER : 'NOT DEFINED');

// Default prompts
const DEFAULT_PROMPTS = [
  { enabled: true, name: "Explain", text: "Explain: %s", contextWords: 0 },
  { enabled: true, name: "Translate", text: "Translate to English: %s", contextWords: 0 },
  { enabled: true, name: "Summarize", text: "Summarize: %s", contextWords: 0 },
  { enabled: false, name: "", text: "", contextWords: 0 },
  { enabled: false, name: "", text: "", contextWords: 0 },
  { enabled: false, name: "", text: "", contextWords: 0 },
  { enabled: false, name: "", text: "", contextWords: 0 },
  { enabled: false, name: "", text: "", contextWords: 0 },
  { enabled: false, name: "", text: "", contextWords: 0 },
  { enabled: false, name: "", text: "", contextWords: 0 }
];

// getSelectionWithContext and getSelectedText are provided by compat.js

// Centralized placeholder substitution
function replacePlaceholders(promptText, selectedText, contextText, pageTitle, pageUrl) {
  return promptText
    .replace(/%c/g, contextText)
    .replace(/%s/g, selectedText)
    .replace(/%title/g, pageTitle)
    .replace(/%url/g, pageUrl);
}

// Track which tab has the sidebar open
let sidebarTabId = null;

// Track detached popup windows
let detachedWindowIds = new Set();

// Cache the active tab URL for smart prompt routing
let activeTabUrl = '';

browser.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await browser.tabs.get(activeInfo.tabId);
    activeTabUrl = tab.url || '';
  } catch (e) { activeTabUrl = ''; }
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && changeInfo.url) {
    activeTabUrl = changeInfo.url;
  }
});

// Initialize active tab URL
browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
  if (tabs[0]) activeTabUrl = tabs[0].url || '';
});

// Current prompts in memory
let currentPrompts = DEFAULT_PROMPTS;

// Focus a detached window
async function focusDetachedWindow() {
  if (detachedWindowIds.size > 0) {
    const windowId = detachedWindowIds.values().next().value;
    try {
      await browser.windows.update(windowId, { focused: true });
    } catch (e) {
      // Window might have been closed
      detachedWindowIds.delete(windowId);
    }
  }
}

// Build context menu with simple submenu
async function buildContextMenu() {
  try {
    await browser.contextMenus.removeAll();

    // Get prompts from storage
    const data = await browser.storage.sync.get("prompts");
    currentPrompts = data.prompts || DEFAULT_PROMPTS;

    // Filter enabled prompts
    const enabledPrompts = currentPrompts.filter(p => p.enabled && p.name && p.text);
    if (enabledPrompts.length === 0) return;

    // Create parent menu
    browser.contextMenus.create({
      id: "ai-assistant-parent",
      title: "AI Assistant",
      contexts: ["selection"]
    });

    // Create submenu items for all enabled prompts
    enabledPrompts.forEach((prompt, index) => {
      browser.contextMenus.create({
        id: `ai-prompt-${index}`,
        parentId: "ai-assistant-parent",
        title: prompt.name,
        contexts: ["selection"]
      });
    });

  } catch (e) {
    console.error("Error building menu:", e);
  }
}

// Execute prompt and open sidebar
async function executePrompt(promptIndex, selectedText, contextText, pageTitle, pageUrl, tabId) {
  const enabledPrompts = currentPrompts.filter(p => p.enabled && p.name && p.text);
  const prompt = enabledPrompts[promptIndex];
  if (!prompt) return;

  // Replace placeholders
  let formattedText = replacePlaceholders(prompt.text, selectedText, contextText, pageTitle, pageUrl);

  // Track which tab opened the sidebar
  sidebarTabId = tabId;

  // Get selected provider
  const providerData = await browser.storage.sync.get("selectedProvider");
  const provider = providerData.selectedProvider || DEFAULT_PROVIDER;

  // Store the formatted text with provider
  await browser.storage.local.set({
    pendingText: formattedText,
    provider: provider,
    timestamp: Date.now()
  });

  // Note: sidebar must be opened synchronously by the caller

  // Send message to sidebar or detached window
  const hasDetached = detachedWindowIds.size > 0;
  console.log("Sending command, detached windows:", detachedWindowIds.size, "targeting:", hasDetached ? "detached" : "sidebar");

  setTimeout(() => {
    browser.runtime.sendMessage({
      type: "new-text-to-explain",
      text: formattedText,
      provider: provider,
      targetDetached: hasDetached
    }).catch((e) => console.log("Message send failed:", e));
  }, 500);
}

// Handle context menu click
browser.contextMenus.onClicked.addListener((info, tab) => {
  console.log("Context menu clicked:", info.menuItemId);
  const menuId = info.menuItemId.toString();

  if (menuId.startsWith("ai-prompt-")) {
    const promptIndex = parseInt(menuId.split("-")[2]);
    console.log("Executing prompt index:", promptIndex, "with text:", info.selectionText?.substring(0, 30));

    const hasDetachedWindow = detachedWindowIds.size > 0;

    // Only open sidebar/panel if no detached windows exist
    // MUST be called synchronously in the event handler for user gesture context
    if (!hasDetachedWindow) {
      openSidePanel(tab.windowId);
    }

    // Look up the prompt to check if context is needed
    const enabledPrompts = currentPrompts.filter(p => p.enabled && p.name && p.text);
    const prompt = enabledPrompts[promptIndex];
    const contextWords = prompt ? (prompt.contextWords || 0) : 0;
    const needsContext = prompt && prompt.text.includes('%c') && contextWords > 0;

    const doExecute = async () => {
      let selectedText = info.selectionText;
      let contextText = info.selectionText;

      if (needsContext) {
        try {
          const result = await getSelectionWithContext(tab.id, contextWords);
          selectedText = result.selectedText;
          contextText = result.contextText;
        } catch (e) {
          console.log("Context fetch failed, using selectionText:", e);
        }
      }

      await executePrompt(promptIndex, selectedText, contextText, tab.title || "", tab.url || "", tab.id);
      if (hasDetachedWindow) {
        await focusDetachedWindow();
      }
    };

    doExecute();
  }
});

// Rebuild menu when settings change
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.prompts) {
    buildContextMenu();
  }
});

// Note: Auto-hide sidebar removed - Firefox only allows sidebarAction.close()
// from user input handlers

// Strip X-Frame-Options and CSP headers from all provider responses
// Firefox: use webRequest blocking. Chrome: uses declarativeNetRequest rules (chrome_rules.json)
if (IS_FIREFOX) {
  browser.webRequest.onHeadersReceived.addListener(
    (details) => {
      const headers = details.responseHeaders.filter(header => {
        const name = header.name.toLowerCase();
        return name !== "x-frame-options" &&
               name !== "content-security-policy" &&
               name !== "content-security-policy-report-only";
      });
      return { responseHeaders: headers };
    },
    {
      urls: getAllProviderUrls()
    },
    ["blocking", "responseHeaders"]
  );
}

// Listen for messages from sidebar
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "get-pending-text") {
    browser.storage.local.get(["pendingText", "provider", "timestamp"]).then(data => {
      sendResponse(data);
      browser.storage.local.remove(["pendingText", "provider", "timestamp"]);
    });
    return true;
  }

  if (message.type === "window-detached") {
    // Track the detached window
    if (message.windowId) {
      detachedWindowIds.add(message.windowId);
      console.log("Detached window registered:", message.windowId);
    }
  }
});

// Clean up when windows are closed
browser.windows.onRemoved.addListener((windowId) => {
  if (detachedWindowIds.has(windowId)) {
    detachedWindowIds.delete(windowId);
    console.log("Detached window closed:", windowId);

    // Notify sidebar to sync with the closed detached window's chat
    browser.runtime.sendMessage({
      type: "detached-window-closed"
    }).catch(() => {});
  }
});

// Initialize prompts if not set or corrupted
async function initializePrompts() {
  const data = await browser.storage.sync.get("prompts");
  let prompts = data.prompts;

  // Check if prompts are valid
  let needsReset = !prompts || !Array.isArray(prompts);

  if (!needsReset) {
    // Check if first 3 prompts have valid names (required for defaults)
    for (let i = 0; i < 3; i++) {
      if (!prompts[i] || !prompts[i].name || prompts[i].name.trim() === "") {
        needsReset = true;
        break;
      }
    }
  }

  if (needsReset) {
    await browser.storage.sync.set({ prompts: DEFAULT_PROMPTS });
  } else if (prompts.length < 10) {
    // Pad short arrays with empty disabled entries
    while (prompts.length < 10) {
      prompts.push({ enabled: false, name: "", text: "", contextWords: 0 });
    }
    await browser.storage.sync.set({ prompts });
  }

  buildContextMenu();
}

// Check if a URL belongs to a supported AI provider
function isProviderUrl(url) {
  try {
    return detectProviderFromHostname(new URL(url).hostname) !== null;
  } catch { return false; }
}

// Smart prompt routing: detect AI page + sidebar/panel state
async function handleSmartPrompt(promptIndex) {
  const win = await browser.windows.getCurrent();
  const sidebarOpen = await isSidePanelOpen(win.id);

  if (sidebarOpen) {
    handleKeyboardShortcut(promptIndex, false);
  } else {
    handleDirectInjection(promptIndex);
  }
}

// Handle keyboard shortcuts
// Chrome passes tab as second arg; Firefox does not
browser.commands.onCommand.addListener((command, tab) => {
  if (!command.startsWith("prompt-")) return;

  const promptIndex = parseInt(command.split("-")[1]) - 1;
  const hasDetachedWindow = detachedWindowIds.size > 0;

  if (hasDetachedWindow) {
    handleKeyboardShortcut(promptIndex, true);
  } else if (isProviderUrl(activeTabUrl)) {
    // On AI page — check sidebar state, then route
    handleSmartPrompt(promptIndex);
  } else {
    // Not on AI page — open sidebar/panel synchronously for user gesture context
    if (tab) {
      openSidePanel(tab.windowId);
    } else {
      openSidePanel();
    }
    handleKeyboardShortcut(promptIndex, false);
  }
});

// Async handler for keyboard shortcuts
async function handleKeyboardShortcut(promptIndex, hasDetachedWindow) {
  // Get the active tab BEFORE focusing detached window
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (tabs.length === 0) {
    console.log("No active tab found");
    return;
  }

  const tab = tabs[0];
  console.log("Active tab:", tab.id, tab.url);

  // Find the prompt at this index among ALL prompts (not just enabled)
  const data = await browser.storage.sync.get("prompts");
  const prompts = data.prompts || DEFAULT_PROMPTS;
  const prompt = prompts[promptIndex];
  console.log("Prompt at index:", prompt);

  if (!prompt || !prompt.enabled || !prompt.name || !prompt.text) {
    console.log("Prompt not valid or not enabled:", prompt);
    return;
  }

  // Get selected text (with context if needed)
  try {
    const contextWords = prompt.contextWords || 0;
    const needsContext = prompt.text.includes('%c') && contextWords > 0;

    let selectedText, contextText;
    if (needsContext) {
      const result = await getSelectionWithContext(tab.id, contextWords);
      selectedText = result.selectedText;
      contextText = result.contextText;
    } else {
      selectedText = await getSelectedText(tab.id);
      contextText = selectedText;
    }

    console.log("Selected text:", selectedText ? selectedText.substring(0, 50) : "(none)");

    if (selectedText && selectedText.trim()) {
      // Now focus the detached window if we have one
      if (hasDetachedWindow) {
        await focusDetachedWindow();
      }

      console.log("Prompt is valid, executing...");
      // Replace placeholders
      let formattedText = replacePlaceholders(prompt.text, selectedText, contextText, tab.title || "", tab.url || "");

      // Track which tab opened the sidebar
      sidebarTabId = tab.id;

      // Get selected provider
      const providerData = await browser.storage.sync.get("selectedProvider");
      const provider = providerData.selectedProvider || DEFAULT_PROVIDER;

      // Store the formatted text with provider
      await browser.storage.local.set({
        pendingText: formattedText,
        provider: provider,
        timestamp: Date.now()
      });

      // Send message to sidebar or detached window
      console.log("Keyboard shortcut: detached windows:", detachedWindowIds.size, "targeting:", hasDetachedWindow ? "detached" : "sidebar");

      setTimeout(() => {
        console.log("Sending message to sidebar/detached window...");
        browser.runtime.sendMessage({
          type: "new-text-to-explain",
          text: formattedText,
          provider: provider,
          targetDetached: hasDetachedWindow
        }).catch((e) => console.log("Message send error (expected if sidebar just opened):", e));
      }, 500);
    } else {
      console.log("No text selected");
    }
  } catch (e) {
    console.error("Error getting selection:", e);
  }
}

// Inject prompt directly into the current AI page (called only when on AI page)
async function handleDirectInjection(promptIndex) {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (tabs.length === 0) return;

  const tab = tabs[0];

  // Get prompt first to know if context is needed
  const data = await browser.storage.sync.get("prompts");
  const prompts = data.prompts || DEFAULT_PROMPTS;
  const prompt = prompts[promptIndex];

  if (!prompt || !prompt.enabled || !prompt.name || !prompt.text) {
    console.log("Inject: prompt not valid or not enabled");
    return;
  }

  // Get selected text (with context if needed)
  try {
    const contextWords = prompt.contextWords || 0;
    const needsContext = prompt.text.includes('%c') && contextWords > 0;

    let selectedText, contextText;
    if (needsContext) {
      const result = await getSelectionWithContext(tab.id, contextWords);
      selectedText = result.selectedText;
      contextText = result.contextText;
    } else {
      selectedText = await getSelectedText(tab.id);
      contextText = selectedText;
    }

    if (!selectedText || !selectedText.trim()) {
      console.log("Inject: no text selected");
      return;
    }

    // Format prompt text
    const formattedText = replacePlaceholders(prompt.text, selectedText, contextText, tab.title || "", tab.url || "");

    // Send fill-input message to the top frame only
    try {
      await browser.tabs.sendMessage(tab.id, { type: "fill-input", text: formattedText }, { frameId: 0 });
      console.log("Inject: message sent to tab", tab.id);
    } catch (e) {
      console.log("Inject: sendMessage failed:", e);
    }
  } catch (e) {
    console.error("Inject: error getting selection:", e);
  }
}

// Initialize on startup
initializePrompts();
