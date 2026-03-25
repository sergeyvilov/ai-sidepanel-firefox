# AI Sidebar Extension

A Firefox extension that adds a sidebar with AI chat providers (ChatGPT, Gemini, Claude, Mistral) and lets you send selected text to them using custom prompts — via the context menu or keyboard shortcuts.

## Supported AI Providers

| Provider | URL |
|----------|-----|
| ChatGPT | chatgpt.com |
| Google Gemini | gemini.google.com |
| Claude | claude.ai |
| Mistral Le Chat | chat.mistral.ai |

You can switch between providers using the dropdown in the sidebar. Your selection is saved across sessions.

## Features

### Custom Prompts

Configure up to **10 custom prompts** in the options page. Each prompt has:

- **Name** — displayed in the context menu (max 30 characters)
- **Prompt text** — the template sent to the AI, supporting placeholders
- **Enabled/Disabled toggle** — controls visibility in the context menu
- **Context size** — number of surrounding words to include (0–500)

Three prompts come pre-configured:

1. **Explain** — `Explain: %s`
2. **Translate** — `Translate to English: %c`
3. **Summarize** — `Summarize: %s`

#### Placeholders

| Placeholder | Description |
|-------------|-------------|
| `%s` | Selected text |
| `%c` | Selected text with surrounding context (see [Context](#context) below) |
| `%title` | Page title |
| `%url` | Page URL |

### Keyboard Shortcuts

Each prompt can be triggered with a keyboard shortcut.

**Default shortcuts (prompts 1–5):**

| OS | Shortcuts |
|----|-----------|
| Windows / Linux | `Alt+Shift+1` through `Alt+Shift+5` |
| Mac | `Ctrl+Shift+1` through `Ctrl+Shift+5` |

Prompts 6–10 have no default shortcuts but can be assigned in the options page. To set a shortcut, click the shortcut field and press your desired key combination. At least one modifier key (Ctrl, Alt, Shift, or Command) is required. Duplicate shortcuts are detected and prevented.

### Context

When a prompt uses the `%c` placeholder and a context size greater than 0, the extension extracts surrounding words from the page and formats them as:

```
<before>words before selection</before>[SELECTION]selected text[/SELECTION]<after>words after selection</after>
```

This gives the AI model a better understanding of where the selected text appears on the page. The context size (0–500 words) is configured per prompt.

If the prompt uses `%s` instead, only the raw selected text is sent with no surrounding context.

### Smart Routing

The extension decides where to send the prompt based on what tab is active:

- **Regular page** — opens the sidebar and sends the prompt there
- **AI provider page (sidebar closed)** — injects the prompt directly into the page's input field and auto-submits it
- **AI provider page (sidebar open)** — sends to the sidebar
- **Detached window exists** — sends to the detached window and focuses it

This means if you're already on ChatGPT or Claude, the prompt goes straight into the conversation without needing the sidebar.

### Request Queuing

When a prompt is sent directly to an AI provider page and the model is still generating a response, the request is queued. Queued prompts are processed in FIFO order — once the model finishes (stop button disappears), the next prompt is automatically submitted.

### Detached Window

The sidebar can be detached into a standalone popup window. The detached window stays synced — when closed, the current chat URL and provider are restored back to the sidebar.

## Installation

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on...**
3. Select the `manifest.json` file from this project

## Configuration

Open the extension's options page (right-click the extension icon → **Manage Extension** → **Options**) to:

- Edit prompt names, templates, and context sizes
- Enable or disable individual prompts
- Assign or change keyboard shortcuts
- Reset all prompts to defaults

## How It Works

1. **Trigger** — Select text on any page, then right-click and choose a prompt from the context menu, or press the assigned keyboard shortcut
2. **Build prompt** — The extension replaces placeholders (`%s`, `%c`, `%title`, `%url`) with actual content
3. **Route** — Smart routing determines the destination (sidebar, direct injection, or detached window)
4. **Deliver** — The formatted prompt is either loaded into the sidebar iframe or injected directly into the AI provider's input field and submitted automatically
