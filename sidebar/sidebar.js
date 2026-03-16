// Current provider state
let currentProvider = DEFAULT_PROVIDER;
// Flag to skip pending text check when user manually switches providers
let isManualProviderSwitch = false;
// Track if we're in a detached popup window
const urlParams = new URLSearchParams(window.location.search);
const isDetachedWindow = urlParams.has("detached");

// Initialize provider from storage
async function initProvider() {
  const iframe = document.getElementById("ai-frame");
  const select = document.getElementById("provider-select");

  // If this is a detached window, load the saved chat URL
  if (isDetachedWindow) {
    const detachData = await browser.storage.local.get(["detachedChatUrl", "detachedProvider"]);
    console.log("Detached window init, data:", detachData);
    if (detachData.detachedChatUrl) {
      currentProvider = detachData.detachedProvider || DEFAULT_PROVIDER;
      select.value = currentProvider;
      console.log("Loading chat URL:", detachData.detachedChatUrl);
      iframe.src = detachData.detachedChatUrl;
      // Clear the stored data after a delay to ensure it's been read
      setTimeout(() => {
        browser.storage.local.remove(["detachedChatUrl", "detachedProvider"]);
      }, 1000);
      return;
    }
  }

  // Normal initialization
  const data = await browser.storage.sync.get("selectedProvider");
  currentProvider = data.selectedProvider || DEFAULT_PROVIDER;
  select.value = currentProvider;
  iframe.src = PROVIDERS[currentProvider].url;
}

// Handle provider change
async function handleProviderChange(event) {
  const newProvider = event.target.value;
  if (newProvider === currentProvider) return;

  // Clear queue on old provider before switching
  clearQueueOnProvider();

  currentProvider = newProvider;

  // Save preference
  await browser.storage.sync.set({ selectedProvider: newProvider });

  // Mark as manual switch to prevent old requests from being sent
  isManualProviderSwitch = true;

  // Update iframe
  const iframe = document.getElementById("ai-frame");
  iframe.src = PROVIDERS[newProvider].url;
}

// Send clear-queue message to the current provider iframe
function clearQueueOnProvider() {
  const iframe = document.getElementById("ai-frame");
  const provider = PROVIDERS[currentProvider];

  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage({
      type: "clear-queue"
    }, provider.url);
    console.log("Sent clear-queue to", provider.name);
  }
}

// Check if this is first use and show welcome message
async function checkFirstUse() {
  const data = await browser.storage.local.get("welcomeShown");
  if (!data.welcomeShown) {
    document.getElementById("welcome-overlay").classList.remove("hidden");
  }
}

// Dismiss welcome message
function dismissWelcome() {
  document.getElementById("welcome-overlay").classList.add("hidden");
  browser.storage.local.set({ welcomeShown: true });
}

// Sync sidebar with the last chat from closed detached window
async function syncFromDetachedWindow() {
  const data = await browser.storage.local.get(["lastDetachedChatUrl", "lastDetachedProvider"]);
  if (data.lastDetachedChatUrl) {
    console.log("Syncing to chat URL:", data.lastDetachedChatUrl);

    // Update provider if different
    if (data.lastDetachedProvider && data.lastDetachedProvider !== currentProvider) {
      currentProvider = data.lastDetachedProvider;
      document.getElementById("provider-select").value = currentProvider;
      await browser.storage.sync.set({ selectedProvider: currentProvider });
    }

    // Load the chat URL
    const iframe = document.getElementById("ai-frame");
    isManualProviderSwitch = true; // Prevent pending text check
    iframe.src = data.lastDetachedChatUrl;

    // Clean up
    await browser.storage.local.remove(["lastDetachedChatUrl", "lastDetachedProvider"]);
  }
}

// Check for pending text when sidebar loads
async function checkPendingText() {
  // Skip pending text check for detached windows - they already have their chat
  if (isDetachedWindow) {
    return;
  }

  try {
    const data = await browser.runtime.sendMessage({ type: "get-pending-text" });
    if (data && data.pendingText) {
      // If a different provider was specified, switch to it
      if (data.provider && data.provider !== currentProvider) {
        currentProvider = data.provider;
        document.getElementById("provider-select").value = currentProvider;
        const iframe = document.getElementById("ai-frame");
        iframe.src = PROVIDERS[currentProvider].url;

        // Wait for iframe to load before sending text
        iframe.addEventListener("load", () => {
          setTimeout(() => sendTextToIframe(data.pendingText), 2000);
        }, { once: true });
      } else {
        sendTextToIframe(data.pendingText);
      }
    }
  } catch (e) {
    console.error("Error getting pending text:", e);
  }
}

function sendTextToIframe(text) {
  const iframe = document.getElementById("ai-frame");
  const provider = PROVIDERS[currentProvider];

  console.log("sendTextToIframe called:", { text: text.substring(0, 50), provider: currentProvider });

  if (iframe && iframe.contentWindow) {
    console.log("Posting message to iframe:", provider.url);
    iframe.contentWindow.postMessage({
      type: "fill-input",
      text: text,
      provider: currentProvider
    }, provider.url);
  } else {
    console.error("Iframe or contentWindow not available");
  }
}

// Get current URL from iframe via postMessage
function getIframeUrl() {
  return new Promise((resolve) => {
    const iframe = document.getElementById("ai-frame");
    const provider = PROVIDERS[currentProvider];

    // Set up listener for response
    const handler = (event) => {
      if (event.data && event.data.type === "current-url") {
        window.removeEventListener("message", handler);
        resolve(event.data.url);
      }
    };
    window.addEventListener("message", handler);

    // Request URL from iframe
    iframe.contentWindow.postMessage({ type: "get-url" }, provider.url);

    // Timeout after 500ms - fall back to default URL
    setTimeout(() => {
      window.removeEventListener("message", handler);
      resolve(provider.url);
    }, 500);
  });
}

// Detach sidebar to a separate popup window
async function detachToWindow() {
  // Get the current iframe URL to preserve the chat
  const currentChatUrl = await getIframeUrl();
  console.log("Detaching with chat URL:", currentChatUrl);

  // Store the chat URL in local storage (more reliable than URL params for long URLs)
  await browser.storage.local.set({
    detachedChatUrl: currentChatUrl,
    detachedProvider: currentProvider
  });

  const sidebarUrl = browser.runtime.getURL("sidebar/sidebar.html?detached=true");

  // Create a popup window
  const newWindow = await browser.windows.create({
    url: sidebarUrl,
    type: "popup",
    width: 450,
    height: 700
  });

  // Notify background that we have a detached window with its ID
  browser.runtime.sendMessage({
    type: "window-detached",
    windowId: newWindow.id
  });
}

// Register this window as detached if it is one
async function registerDetachedWindow() {
  if (isDetachedWindow) {
    const windowInfo = await browser.windows.getCurrent();
    console.log("Registering detached window with ID:", windowInfo.id);
    browser.runtime.sendMessage({
      type: "window-detached",
      windowId: windowInfo.id
    });

    // Save current chat URL when window is about to close
    window.addEventListener("beforeunload", async () => {
      const chatUrl = await getIframeUrl();
      await browser.storage.local.set({
        lastDetachedChatUrl: chatUrl,
        lastDetachedProvider: currentProvider
      });
    });
  }
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  // Initialize provider selection
  initProvider();

  // Set up provider change handler
  document.getElementById("provider-select").addEventListener("change", handleProviderChange);

  // Show welcome message on first use
  checkFirstUse();

  // Dismiss welcome when button clicked
  document.getElementById("welcome-btn").addEventListener("click", dismissWelcome);

  // Set up detach button
  const detachBtn = document.getElementById("detach-btn");
  if (detachBtn) {
    // Hide detach button if already in detached window
    if (isDetachedWindow) {
      detachBtn.style.display = "none";
      // Register this detached window with background
      registerDetachedWindow();
    } else {
      detachBtn.addEventListener("click", detachToWindow);
    }
  }
});

// When iframe loads, check for pending text (unless it was a manual provider switch)
document.getElementById("ai-frame").addEventListener("load", () => {
  if (isManualProviderSwitch) {
    // Reset flag and skip pending text check
    isManualProviderSwitch = false;
    return;
  }
  // Give the AI provider a moment to fully initialize
  setTimeout(checkPendingText, 2000);
});

// Listen for new text from background script (when sidebar is already open)
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle detached window closed - sync chat to sidebar
  if (message.type === "detached-window-closed" && !isDetachedWindow) {
    console.log("Detached window closed, syncing chat to sidebar");
    syncFromDetachedWindow();
    return;
  }

  if (message.type === "new-text-to-explain") {
    console.log("Received new-text-to-explain:", {
      isDetachedWindow,
      targetDetached: message.targetDetached,
      text: message.text?.substring(0, 30)
    });

    // Check if we should handle this message
    // Detached windows should handle if they exist, otherwise sidebar handles
    if (message.targetDetached && !isDetachedWindow) {
      console.log("Ignoring - message for detached but we're sidebar");
      return;
    }
    if (!message.targetDetached && isDetachedWindow) {
      console.log("Ignoring - message for sidebar but we're detached");
      return;
    }

    console.log("Processing message in", isDetachedWindow ? "detached window" : "sidebar");

    // If a different provider was specified, switch to it
    if (message.provider && message.provider !== currentProvider) {
      currentProvider = message.provider;
      document.getElementById("provider-select").value = currentProvider;
      const iframe = document.getElementById("ai-frame");
      iframe.src = PROVIDERS[currentProvider].url;

      // Wait for iframe to load before sending text
      iframe.addEventListener("load", () => {
        setTimeout(() => sendTextToIframe(message.text), 2000);
      }, { once: true });
    } else {
      sendTextToIframe(message.text);
    }
  }
});
