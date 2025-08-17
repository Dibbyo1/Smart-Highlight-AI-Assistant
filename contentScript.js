import { getPageKey, loadHighlights, saveHighlights, restoreHighlights, hashText, wrapFirstOccurrence } from "./utils.js";

(function init() {
  injectOverlay();
  loadHighlights().then(restoreHighlights);

  let lastUrl = location.href;
  new MutationObserver(() => {
    if (lastUrl !== location.href) {
      lastUrl = location.href;
      loadHighlights().then(restoreHighlights);
    }
  }).observe(document, { subtree: true, childList: true });
})();

let overlayEl = null;
let overlayHeader = null;
let overlayBody = null;
let overlayClose = null;
let dragOffset = null;

function injectOverlay() {
  if (document.getElementById("smart-ai-overlay")) return;

  overlayEl = document.createElement("div");
  overlayEl.id = "smart-ai-overlay";
  overlayEl.innerHTML = `
    <div class="smart-ai-card">
      <div class="smart-ai-header" id="smart-ai-drag">
        <span class="smart-ai-title">Smart Highlight & AI</span>
        <span class="smart-ai-actions">
          <button id="smart-ai-copy" title="Copy result">Copy</button>
          <button id="smart-ai-close" title="Close">✕</button>
        </span>
      </div>
      <div class="smart-ai-body">
        <div class="smart-ai-status">Select text and use right-click → Ask AI…</div>
        <div class="smart-ai-result" style="display:none;"></div>
      </div>
      <div class="smart-ai-footer">
        <button id="smart-ai-custom">Custom prompt…</button>
        <button id="smart-ai-clear">Clear highlights</button>
      </div>
    </div>
  `;
  document.documentElement.appendChild(overlayEl);

  overlayHeader = overlayEl.querySelector("#smart-ai-drag");
  overlayBody = overlayEl.querySelector(".smart-ai-body");
  overlayClose = overlayEl.querySelector("#smart-ai-close");

  overlayHeader.addEventListener("mousedown", (e) => {
    dragOffset = { x: e.clientX - overlayEl.offsetLeft, y: e.clientY - overlayEl.offsetTop };
    document.addEventListener("mousemove", onDrag);
    document.addEventListener("mouseup", onStopDrag);
  });

  function onDrag(e) {
    overlayEl.style.left = `${Math.max(0, e.clientX - dragOffset.x)}px`;
    overlayEl.style.top = `${Math.max(0, e.clientY - dragOffset.y)}px`;
  }
  function onStopDrag() {
    document.removeEventListener("mousemove", onDrag);
    document.removeEventListener("mouseup", onStopDrag);
  }

  overlayClose.addEventListener("click", () => overlayEl.classList.add("hidden"));

  overlayEl.querySelector("#smart-ai-copy").addEventListener("click", () => {
    const txt = overlayEl.querySelector(".smart-ai-result")?.innerText || "";
    navigator.clipboard.writeText(txt).catch(() => {});
  });

  overlayEl.querySelector("#smart-ai-custom").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "SMART_AI_REQUEST_CUSTOM_PROMPT_FROM_BUTTON" });
  });

  overlayEl.querySelector("#smart-ai-clear").addEventListener("click", async () => {
    const marks = document.querySelectorAll("mark.smart-highlight-mark");
    marks.forEach(m => {
      const parent = m.parentNode;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
    });
    await saveHighlights([]);
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "SMART_AI_OVERLAY_UPDATE") {
    const { action, result, status, label } = msg.payload || {};
    overlayEl.classList.remove("hidden");

    const statusEl = overlayEl.querySelector(".smart-ai-status");
    const resultEl = overlayEl.querySelector(".smart-ai-result");

    if (action === "show") {
      statusEl.style.display = "block";
      resultEl.style.display = "none";
      statusEl.textContent = status || "Working…";
    } else if (action === "result") {
      statusEl.style.display = "none";
      resultEl.style.display = "block";
      resultEl.innerText = label ? `${label}\n\n${result}` : result;
    } else if (action === "error") {
      statusEl.style.display = "block";
      resultEl.style.display = "none";
      statusEl.textContent = `Error: ${result}`;
    }
  }

  if (msg?.type === "SMART_AI_SAVE_HIGHLIGHT") {
    const { text, note } = msg.payload || {};
    if (!text) return;

    const mark = wrapFirstOccurrence(text);
    if (!mark) return;

    const hash = hashText(text + (note || ""));
    mark.dataset.hash = hash;
    mark.title = note || "Saved highlight";

    loadHighlights().then(existing => {
      const next = existing.filter(h => h.hash !== hash);
      next.push({ text, note, hash, createdAt: Date.now() });
      saveHighlights(next);
    });
  }

  if (msg?.type === "SMART_AI_REQUEST_CUSTOM_PROMPT") {
    const tpl = window.prompt("Enter your custom prompt. Use {{text}} where the selection should go:", "Act as an expert editor. Improve clarity and concision of the following:\n\n{{text}}");
    if (tpl && tpl.includes("{{text}}")) {
      sendResponse({ template: tpl, label: "Custom" });
    } else {
      sendResponse(null);
    }
    return true; // async
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "SMART_AI_REQUEST_CUSTOM_PROMPT_FROM_BUTTON") {
    const selection = String(window.getSelection()) || "";
    if (!selection.trim()) {
      alert("Select some text first, then click again.");
      return;
    }
    // Trigger via the same flow the context menu uses:
    chrome.runtime.sendMessage({ type: "SMART_AI_REQUEST_CUSTOM_PROMPT" }, (picked) => {
      if (!picked) return;
      // Fake a right-click flow: background will re-ask for custom prompt on context click.
      // Here we just wrap + save, and let you use the context menu for AI call.
      const mark = wrapFirstOccurrence(selection);
      if (mark) {
        const hash = hashText(selection + "custom");
        mark.dataset.hash = hash;
      }
      // We can’t directly call the API from content; rely on context menu for now.
      alert("Custom prompt saved. Now right-click → Ask AI → Custom prompt…");
    });
  }
});
