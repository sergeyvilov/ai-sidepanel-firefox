// This script runs inside AI provider pages (including when loaded in iframe)
// It listens for messages and fills the input field

(function() {
  // Detect current provider based on URL
  const currentProvider = detectProviderFromHostname(window.location.hostname);

  if (!currentProvider) {
    console.log("inject.js: Not running on a supported provider domain");
    return;
  }

  console.log(`inject.js: Running on ${currentProvider.name}`);

  // Request queue for when model is generating
  let requestQueue = [];
  let isProcessingQueue = false;

  // Listen for messages from parent window (sidebar iframe container)
  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "fill-input") {
      handleNewRequest(event.data.text);
    }
    if (event.data && event.data.type === "clear-queue") {
      clearQueue();
    }
    if (event.data && event.data.type === "get-url") {
      // Send current URL back to parent
      event.source.postMessage({
        type: "current-url",
        url: window.location.href
      }, event.origin);
    }
  });

  // Also listen for messages via browser.runtime (for direct communication)
  if (typeof browser !== "undefined" && browser.runtime) {
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === "fill-input") {
        handleNewRequest(message.text);
      }
      if (message.type === "clear-queue") {
        clearQueue();
      }
    });
  }

  // Clear the request queue
  function clearQueue() {
    requestQueue = [];
    console.log(`${currentProvider.name} queue cleared`);
  }

  // Check if model is currently generating (stop button visible)
  function isGenerating() {
    if (!currentProvider.stopButtonSelectors) return false;
    for (const selector of currentProvider.stopButtonSelectors) {
      const button = document.querySelector(selector);
      if (button && isVisible(button)) {
        return true;
      }
    }
    return false;
  }

  // Check if element is visible
  function isVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           style.opacity !== '0' &&
           element.offsetParent !== null;
  }

  // Handle new request - queue if generating, otherwise process immediately
  function handleNewRequest(text) {
    if (isGenerating()) {
      console.log(`${currentProvider.name} is generating, queueing request`);
      requestQueue.push(text);
      // Start watching for generation to complete
      watchForGenerationComplete();
    } else {
      fillInput(text);
    }
  }

  // Watch for generation to complete, then process queue
  function watchForGenerationComplete() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;

    const checkInterval = setInterval(() => {
      if (!isGenerating()) {
        clearInterval(checkInterval);
        isProcessingQueue = false;
        processQueue();
      }
    }, 500);

    // Timeout after 60 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      isProcessingQueue = false;
    }, 60000);
  }

  // Process the next item in the queue
  function processQueue() {
    if (requestQueue.length === 0) return;

    // Get the first request (oldest in queue - FIFO)
    const text = requestQueue.shift();

    console.log(`${currentProvider.name} processing queued request (${requestQueue.length} remaining)`);

    // Small delay to ensure UI is ready, then fill and submit
    setTimeout(() => {
      fillInput(text);

      // If there are more items in queue, watch for this generation to complete
      if (requestQueue.length > 0) {
        // Wait a bit for generation to start, then watch for completion
        setTimeout(() => watchForGenerationComplete(), 1000);
      }
    }, 500);
  }

  // Watch for stop button clicks to clear queue
  function setupStopButtonWatcher() {
    if (!currentProvider.stopButtonSelectors) return;

    // Use MutationObserver to watch for clicks on stop buttons
    document.addEventListener('click', (event) => {
      const target = event.target;
      for (const selector of currentProvider.stopButtonSelectors) {
        if (target.matches(selector) || target.closest(selector)) {
          console.log(`${currentProvider.name} stop button clicked, clearing queue`);
          clearQueue();
          break;
        }
      }
    }, true);
  }

  // Initialize stop button watcher
  setupStopButtonWatcher();

  // Find input element using provider-specific selectors
  function findInputElement() {
    for (const selector of currentProvider.inputSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    }
    return null;
  }

  // Find send button using provider-specific selectors
  function findSendButton() {
    for (const selector of currentProvider.sendButtonSelectors) {
      const button = document.querySelector(selector);
      if (button && !button.disabled) return button;
    }
    return null;
  }

  // Fill input field (handles both textarea and contenteditable)
  function fillInput(text, retryCount = 0) {
    const inputElement = findInputElement();

    if (!inputElement) {
      if (retryCount < 5) {
        console.log(`${currentProvider.name} input not found, retrying... (${retryCount + 1}/5)`);
        setTimeout(() => fillInput(text, retryCount + 1), 1000);
      }
      return;
    }

    // Handle based on element type
    if (inputElement.tagName === "TEXTAREA") {
      fillTextarea(inputElement, text);
    } else if (inputElement.classList.contains("ProseMirror")) {
      // Claude and Mistral use ProseMirror editor
      fillProseMirror(inputElement, text);
    } else if (inputElement.classList.contains("ql-editor")) {
      // Gemini uses Quill editor
      fillQuillEditor(inputElement, text);
    } else if (inputElement.getAttribute("contenteditable") === "true" ||
               inputElement.getAttribute("role") === "textbox") {
      fillContentEditable(inputElement, text);
    } else {
      // Fallback: try textarea approach first
      try {
        fillTextarea(inputElement, text);
      } catch (e) {
        fillContentEditable(inputElement, text);
      }
    }

    // Focus the input
    inputElement.focus();

    console.log(`${currentProvider.name} input filled`);

    // Auto-submit after a short delay to ensure the input is registered
    setTimeout(() => autoSubmit(), 300);
  }

  // Fill a textarea element
  function fillTextarea(element, text) {
    element.value = text;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Fill a contenteditable element
  function fillContentEditable(element, text) {
    // Clear existing content
    element.innerHTML = "";
    element.textContent = text;

    // Dispatch input event
    element.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: text
    }));
  }

  // Fill ProseMirror editor (used by Claude and Mistral)
  function fillProseMirror(element, text) {
    // Clear existing content
    element.innerHTML = "";

    // ProseMirror expects content inside paragraph tags
    const p = document.createElement("p");
    p.textContent = text;
    element.appendChild(p);

    // Dispatch input event
    element.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: text
    }));
  }

  // Fill Quill editor (used by Gemini)
  function fillQuillEditor(element, text) {
    // Clear existing content
    element.innerHTML = "";

    // Quill uses paragraph tags
    const p = document.createElement("p");
    p.textContent = text;
    element.appendChild(p);

    // Dispatch input event
    element.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: text
    }));
  }

  // Auto-submit the form (press Enter or click send button)
  function autoSubmit() {
    // Count existing responses before submitting
    const existingResponses = countResponses();

    const sendButton = findSendButton();

    if (sendButton) {
      sendButton.click();
      console.log(`${currentProvider.name} send button clicked`);
      // Wait for new response and scroll to it
      waitForResponseAndScroll(existingResponses);
      return;
    }

    // Fallback: simulate Enter key press on the input
    const inputElement = findInputElement();
    if (inputElement) {
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      });
      inputElement.dispatchEvent(enterEvent);
      console.log(`${currentProvider.name} Enter key simulated`);
      // Wait for new response and scroll to it
      waitForResponseAndScroll(existingResponses);
    }
  }

  // Count current response elements
  function countResponses() {
    if (!currentProvider.responseSelectors) return 0;
    for (const selector of currentProvider.responseSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) return elements.length;
    }
    return 0;
  }

  // Find the latest response element
  function findLatestResponse() {
    if (!currentProvider.responseSelectors) return null;
    for (const selector of currentProvider.responseSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        return elements[elements.length - 1];
      }
    }
    return null;
  }

  // Wait for a new response to appear and scroll to it
  function waitForResponseAndScroll(previousCount, attempts = 0) {
    if (attempts > 30) {
      console.log("Timeout waiting for response");
      return;
    }

    const currentCount = countResponses();

    if (currentCount > previousCount) {
      // New response appeared, scroll to it
      const latestResponse = findLatestResponse();
      if (latestResponse) {
        setTimeout(() => {
          latestResponse.scrollIntoView({ behavior: 'smooth', block: 'start' });
          console.log(`${currentProvider.name} scrolled to response`);
        }, 300);
      }
    } else {
      // Check again after a delay
      setTimeout(() => waitForResponseAndScroll(previousCount, attempts + 1), 500);
    }
  }

  // Expose functions globally for debugging
  window.fillInput = fillInput;
  window.clearQueue = clearQueue;
  window.getQueueLength = () => requestQueue.length;
})();
