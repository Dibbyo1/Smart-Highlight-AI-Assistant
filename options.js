const DEFAULT_PROMPTS = [
  { id: "summary", label: "Summary", template: "Summarize the following text in 5-7 bullet points:\n\n{{text}}" },
  { id: "tldr", label: "TL;DR", template: "Provide a concise TL;DR (1-2 sentences) for:\n\n{{text}}" },
  { id: "eli5", label: "Explain like I’m 5", template: "Explain this like I'm five years old:\n\n{{text}}" },
  { id: "translate", label: "Translate", template: "Translate the following text to English. Keep names and technical terms intact:\n\n{{text}}" },
  { id: "code", label: "Explain code", template: "Explain what this code does, step by step, and note pitfalls:\n\n{{text}}" },
  { id: "research", label: "Research", template: "List key concepts, related terms, and next questions to research based on this passage:\n\n{{text}}" }
];

const $ = sel => document.querySelector(sel);
const TBody = $("#promptTable tbody");

function load() {
  chrome.storage.sync.get({ openaiApiKey: "", promptLibrary: DEFAULT_PROMPTS }, data => {
    $("#apiKey").value = data.openaiApiKey || "";
    renderPrompts(data.promptLibrary || DEFAULT_PROMPTS);
  });
}

function renderPrompts(prompts) {
  TBody.innerHTML = "";
  prompts.forEach(p => addRow(p));
}

function addRow(p = { id: crypto.randomUUID(), label: "", template: "" }) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input class="lbl" type="text" value="${p.label || ""}" placeholder="Label" /></td>
    <td><textarea class="tpl" rows="4" placeholder="Template with {{text}}">${p.template || ""}</textarea></td>
    <td><button class="del">🗑️</button></td>
  `;
  tr.dataset.id = p.id;
  tr.querySelector(".del").addEventListener("click", () => tr.remove());
  TBody.appendChild(tr);
}

$("#addPrompt").addEventListener("click", () => addRow());

$("#savePrompts").addEventListener("click", () => {
  const rows = Array.from(TBody.querySelectorAll("tr")).map(tr => ({
    id: tr.dataset.id,
    label: tr.querySelector(".lbl").value.trim(),
    template: tr.querySelector(".tpl").value
  })).filter(p => p.label && p.template && p.template.includes("{{text}}"));

  chrome.storage.sync.set({ promptLibrary: rows }, () => {
    alert("Prompt Library saved!");
    chrome.runtime.sendMessage({ type: "REBUILD_MENUS" });
  });
});

$("#saveKey").addEventListener("click", () => {
  const key = $("#apiKey").value.trim();
  chrome.storage.sync.set({ openaiApiKey: key }, () => alert("API Key saved."));
});

$("#clearKey").addEventListener("click", () => {
  chrome.storage.sync.remove("openaiApiKey", () => {
    $("#apiKey").value = "";
    alert("API Key cleared.");
  });
});

document.addEventListener("DOMContentLoaded", load);
