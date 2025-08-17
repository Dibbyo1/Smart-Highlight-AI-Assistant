const DEFAULT_PROMPTS = [
  { id: "summary", label: "Summary", template: "Summarize the following text in 5-7 bullet points:\n\n{{text}}" },
  { id: "tldr", label: "TL;DR", template: "Provide a concise TL;DR (1-2 sentences) for:\n\n{{text}}" },
  { id: "eli5", label: "Explain like I’m 5", template: "Explain this like I'm five years old:\n\n{{text}}" },
  { id: "translate", label: "Translate", template: "Translate the following text to English. Keep names and technical terms intact:\n\n{{text}}" },
  { id: "code", label: "Explain code", template: "Explain what this code does, step by step, and note pitfalls:\n\n{{text}}" },
  { id: "research", label: "Research", template: "List key concepts, related terms, and next questions to research based on this passage:\n\n{{text}}" }
];

const MENU_PARENT_ID = "smartHighlightAIParent";

async function rebuildMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_PARENT_ID,
      title: "Ask AI about selection",
      contexts: ["selection"]
    });

    getPromptLibrary().then(prompts => {
      prompts.forEach(p => {
        chrome.contextMenus.create({
          id: `smart_${p.id}`,
          parentId: MENU_PARENT_ID,
          title: p.label,
          contexts: ["selection"]
        });
      });
      chrome.contextMenus.create({
        id: "smart_custom",
        parentId: MENU_PARENT_ID,
        title: "Custom prompt…",
        contexts: ["selection"]
      });
    });
  });
}

chrome.runtime.onInstalled.addListener(rebuildMenus);
chrome.runtime.onStartup.addListener(rebuildMenus);

function getPromptLibrary() {
  return new Promise(resolve => {
    chrome.storage.sync.get({ promptLibrary: DEFAULT_PROMPTS }, (data) => {
      resolve(data.promptLibrary ?? DEFAULT_PROMPTS);
    });
  });
}

function getApiKey() {
  return new Promise(resolve => {
    chrome.storage.sync.get({ openaiApiKey: "" }, data => resolve(data.openaiApiKey || ""));
  });
}

function applyTemplate(tpl, text) {
  return tpl.replaceAll("{{text}}", text);
}

async function callOpenAI({ model = "gpt-4o-mini", prompt }) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("Missing OpenAI API key. Set it in the extension’s Options page.");
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "You are a concise, helpful assistant. Prefer bullet points when summarizing. Keep formatting clean." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3
    })
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "(No response)";
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.selectionText || !tab || !tab.id) return;

  const prompts = await getPromptLibrary();

  try {
    let pickedPrompt = null;

    if (info.menuItemId === "smart_custom") {
      pickedPrompt = await chrome.tabs.sendMessage(tab.id, { type: "SMART_AI_REQUEST_CUSTOM_PROMPT" });
      if (!pickedPrompt || !pickedPrompt.template) return;
    } else {
      const id = String(info.menuItemId).replace(/^smart_/, "");
      pickedPrompt = prompts.find(p => p.id === id);
      if (!pickedPrompt) return;
    }

    chrome.tabs.sendMessage(tab.id, {
      type: "SMART_AI_OVERLAY_UPDATE",
      payload: {
        action: "show",
        selectionText: info.selectionText,
        status: "Working…",
        result: ""
      }
    });

    const promptText = applyTemplate(pickedPrompt.template, info.selectionText);
    const answer = await callOpenAI({ prompt: promptText });

    chrome.tabs.sendMessage(tab.id, {
      type: "SMART_AI_OVERLAY_UPDATE",
      payload: {
        action: "result",
        selectionText: info.selectionText,
        label: pickedPrompt.label,
        result: answer
      }
    });

    chrome.tabs.sendMessage(tab.id, {
      type: "SMART_AI_SAVE_HIGHLIGHT",
      payload: {
        text: info.selectionText,
        note: `${pickedPrompt.label} → AI`
      }
    });

  } catch (e) {
    chrome.tabs.sendMessage(tab.id, {
      type: "SMART_AI_OVERLAY_UPDATE",
      payload: {
        action: "error",
        selectionText: info.selectionText,
        result: e.message || String(e)
      }
    });
  }
});
