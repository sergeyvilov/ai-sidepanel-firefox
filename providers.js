// Provider configuration for multi-LLM support
const PROVIDERS = {
  chatgpt: {
    id: "chatgpt",
    name: "ChatGPT",
    url: "https://chatgpt.com",
    domains: ["chatgpt.com", "chat.openai.com"],
    inputSelectors: [
      '#prompt-textarea',
      'textarea[placeholder*="Message"]',
      'textarea[data-id="root"]',
      '[contenteditable="true"]',
      'div[role="textbox"]',
      'textarea'
    ],
    sendButtonSelectors: [
      'button[data-testid="send-button"]',
      'button[data-testid="fruitjuice-send-button"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="send"]',
      'form button[type="submit"]'
    ],
    stopButtonSelectors: [
      'button[data-testid="stop-button"]',
      'button[aria-label*="Stop"]',
      'button[aria-label*="stop"]'
    ],
    responseSelectors: [
      '[data-message-author-role="assistant"]',
      '.agent-turn',
      '.markdown'
    ]
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    url: "https://gemini.google.com",
    domains: ["gemini.google.com"],
    inputSelectors: [
      'rich-textarea .ql-editor',
      'div.ql-editor[contenteditable="true"]',
      '.input-area-container [contenteditable="true"]',
      'div[contenteditable="true"]',
      '[aria-label*="Enter a prompt"]',
      'textarea'
    ],
    sendButtonSelectors: [
      'button[aria-label*="Send"]',
      'button.send-button',
      'mat-icon-button[aria-label*="Send"]',
      'button[mattooltip*="Send"]',
      'button[data-test-id="send-button"]'
    ],
    stopButtonSelectors: [
      'button[aria-label*="Stop"]',
      'button[aria-label*="Cancel"]'
    ],
    responseSelectors: [
      '.model-response-text',
      '.response-content',
      'message-content'
    ]
  },
  claude: {
    id: "claude",
    name: "Claude",
    url: "https://claude.ai",
    domains: ["claude.ai"],
    inputSelectors: [
      'div.ProseMirror[contenteditable="true"]',
      'fieldset div[contenteditable="true"]',
      'div[contenteditable="true"]',
      '[data-placeholder*="Reply"]',
      'textarea'
    ],
    sendButtonSelectors: [
      'button[aria-label*="Send"]',
      'button[type="submit"]',
      'fieldset button:last-child'
    ],
    stopButtonSelectors: [
      'button[aria-label*="Stop"]',
      'button:has(svg[aria-label*="stop"])'
    ],
    responseSelectors: [
      '[data-is-streaming]',
      '.font-claude-message',
      '.prose'
    ]
  },
  mistral: {
    id: "mistral",
    name: "Le Chat Mistral",
    url: "https://chat.mistral.ai",
    domains: ["chat.mistral.ai"],
    inputSelectors: [
      '[data-placeholder="Ask Le Chat"]',
      'div.ProseMirror[contenteditable="true"]',
      '.ProseMirror',
      'div[contenteditable="true"]',
      '[role="textbox"]',
      'textarea'
    ],
    sendButtonSelectors: [
      'button[type="submit"]',
      'button[aria-label*="Send"]',
      'form button:last-of-type'
    ],
    stopButtonSelectors: [
      'button[aria-label*="Stop"]',
      'button[aria-label*="Cancel"]'
    ],
    responseSelectors: [
      '.prose',
      '.message-content',
      '.assistant-message'
    ]
  }
};

const DEFAULT_PROVIDER = "chatgpt";

// Get all provider URLs for header stripping
function getAllProviderUrls() {
  const urls = [];
  for (const provider of Object.values(PROVIDERS)) {
    for (const domain of provider.domains) {
      urls.push(`*://${domain}/*`);
    }
  }
  return urls;
}

// Detect provider from hostname
function detectProviderFromHostname(hostname) {
  for (const [id, provider] of Object.entries(PROVIDERS)) {
    if (provider.domains.some(domain => hostname.includes(domain))) {
      return provider;
    }
  }
  return null;
}
