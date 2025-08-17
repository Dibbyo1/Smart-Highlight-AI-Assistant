export function getPageKey() {
  return `highlights:${location.origin}${location.pathname}`;
}

export function loadHighlights() {
  return new Promise(resolve => {
    const key = getPageKey();
    chrome.storage.sync.get({ [key]: [] }, data => resolve(data[key] || []));
  });
}

export function saveHighlights(highlights) {
  return new Promise(resolve => {
    const key = getPageKey();
    chrome.storage.sync.set({ [key]: highlights }, resolve);
  });
}

export function wrapFirstOccurrence(text) {
  if (!text || !text.trim()) return null;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let node;
  const needle = text.trim();
  while ((node = walker.nextNode())) {
    const idx = node.nodeValue.indexOf(needle);
    if (idx !== -1) {
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + needle.length);

      const mark = document.createElement("mark");
      mark.className = "smart-highlight-mark";
      mark.dataset.createdAt = String(Date.now());
      range.surroundContents(mark);
      return mark;
    }
  }
  return null;
}

export function restoreHighlights(highlights) {
  highlights.forEach(h => {
    if (!document.body.textContent.includes(h.text)) return;
    const existing = document.querySelector(`mark.smart-highlight-mark[data-hash="${h.hash}"]`);
    if (existing) return;

    const mark = wrapFirstOccurrence(h.text);
    if (mark) {
      mark.dataset.hash = h.hash;
      mark.title = h.note || "Saved highlight";
    }
  });
}

export function hashText(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
