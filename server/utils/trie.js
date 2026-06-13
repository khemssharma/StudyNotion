class TrieNode {
  constructor() {
    this.children = new Map();
    this.entries = [];
  }
}

class Trie {
  constructor() {
    this.root = new TrieNode();
  }

  _normalize(text) {
    return text.trim().toLowerCase();
  }

  insert(text, metadata) {
    const normalized = this._normalize(text);
    if (!normalized) return;

    let node = this.root;
    for (const char of normalized) {
      if (!node.children.has(char)) {
        node.children.set(char, new TrieNode());
      }
      node = node.children.get(char);
    }

    const key = `${metadata.type}:${metadata.id}`;
    const exists = node.entries.some(
      (entry) => `${entry.type}:${entry.id}` === key
    );
    if (!exists) {
      node.entries.push({ ...metadata, label: text.trim() });
    }
  }

  search(prefix, limit = 8) {
    const normalized = this._normalize(prefix);
    if (!normalized) return [];

    let node = this.root;
    for (const char of normalized) {
      if (!node.children.has(char)) {
        return [];
      }
      node = node.children.get(char);
    }

    const results = [];
    const seen = new Set();
    this._collectSuggestions(node, results, seen, limit);
    return results;
  }

  _collectSuggestions(node, results, seen, limit) {
    if (results.length >= limit) return;

    for (const entry of node.entries) {
      const key = `${entry.type}:${entry.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push(entry);
        if (results.length >= limit) return;
      }
    }

    for (const child of node.children.values()) {
      this._collectSuggestions(child, results, seen, limit);
      if (results.length >= limit) return;
    }
  }

  clear() {
    this.root = new TrieNode();
  }
}

module.exports = Trie;
