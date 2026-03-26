// Browser compatibility layer for Firefox (MV2) and Chrome (MV3)

// Namespace polyfill: Chrome uses chrome.*, Firefox uses browser.*
if (typeof browser === "undefined") {
  globalThis.browser = chrome;
}

// Browser detection
const IS_CHROME = typeof chrome !== "undefined" && !!chrome.sidePanel;
const IS_FIREFOX = typeof browser !== "undefined" && !!browser.sidebarAction;

// Open the side panel / sidebar
// Called synchronously from event handlers for user gesture context
function openSidePanel(tabId) {
  if (IS_FIREFOX) {
    browser.sidebarAction.open();
  } else if (IS_CHROME && tabId) {
    chrome.sidePanel.open({ tabId })
      .catch(e => console.error("sidePanel.open() failed:", e));
  }
}

// Check if the side panel / sidebar is currently open
async function isSidePanelOpen(windowId) {
  if (IS_FIREFOX) {
    return browser.sidebarAction.isOpen({ windowId });
  } else if (IS_CHROME) {
    try {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ["SIDE_PANEL"]
      });
      return contexts.length > 0;
    } catch (e) {
      return false;
    }
  }
  return false;
}

// Get selected text from a tab
async function getSelectedText(tabId) {
  if (IS_CHROME) {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.getSelection().toString()
    });
    return (results && results[0] && results[0].result) || "";
  } else {
    const results = await browser.tabs.executeScript(tabId, {
      code: "window.getSelection().toString();"
    });
    return results[0] || "";
  }
}

// Function that runs in the page context to extract selection with surrounding context
function _extractSelectionWithContext(contextWords) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return JSON.stringify({ selectedText: "", beforeContext: "", afterContext: "" });
  const range = sel.getRangeAt(0);
  const selectedText = sel.toString();

  const beforeRange = document.createRange();
  beforeRange.setStart(document.body, 0);
  beforeRange.setEnd(range.startContainer, range.startOffset);
  const beforeWords = beforeRange.toString().split(/\s+/).filter(Boolean);
  const beforeContext = beforeWords.slice(-contextWords).join(" ");

  const afterRange = document.createRange();
  afterRange.setStart(range.endContainer, range.endOffset);
  afterRange.setEnd(document.body, document.body.childNodes.length);
  const afterWords = afterRange.toString().split(/\s+/).filter(Boolean);
  const afterContext = afterWords.slice(0, contextWords).join(" ");

  return JSON.stringify({ selectedText, beforeContext, afterContext });
}

// Get selected text with surrounding context from a tab
async function getSelectionWithContext(tabId, contextWords) {
  if (contextWords <= 0) {
    const text = await getSelectedText(tabId);
    return { selectedText: text, contextText: text };
  }

  let resultJson;
  if (IS_CHROME) {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: _extractSelectionWithContext,
      args: [contextWords]
    });
    resultJson = results && results[0] && results[0].result;
  } else {
    const results = await browser.tabs.executeScript(tabId, {
      code: `(${_extractSelectionWithContext.toString()})(${contextWords})`
    });
    resultJson = results[0];
  }

  const parsed = JSON.parse(resultJson);
  const contextText = `<before>${parsed.beforeContext}</before>[SELECTION]${parsed.selectedText}[/SELECTION]<after>${parsed.afterContext}</after>`;
  return { selectedText: parsed.selectedText, contextText };
}
