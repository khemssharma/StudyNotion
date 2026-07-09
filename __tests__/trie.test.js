const Trie = require("../utils/trie");

describe("Trie", () => {
  let trie;

  beforeEach(() => {
    trie = new Trie();
  });

  it("returns empty array for unknown prefix", () => {
    trie.insert("React Basics", { type: "course", id: "1" });
    expect(trie.search("vue")).toEqual([]);
  });

  it("finds suggestions by prefix (case-insensitive)", () => {
    trie.insert("React Basics", { type: "course", id: "1", courseId: "1" });
    trie.insert("Reading Skills", { type: "course", id: "2", courseId: "2" });

    const results = trie.search("rea");
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.label)).toEqual(
      expect.arrayContaining(["React Basics", "Reading Skills"])
    );
  });

  it("deduplicates entries with the same type and id", () => {
    trie.insert("React", { type: "course", id: "1", courseId: "1" });
    trie.insert("react", { type: "course", id: "1", courseId: "1" });

    expect(trie.search("re")).toHaveLength(1);
  });

  it("respects the result limit", () => {
    trie.insert("Alpha", { type: "course", id: "1" });
    trie.insert("Apple", { type: "course", id: "2" });
    trie.insert("Application", { type: "course", id: "3" });

    expect(trie.search("a", 2)).toHaveLength(2);
  });

  it("clears all entries", () => {
    trie.insert("Node.js", { type: "course", id: "1" });
    trie.clear();
    expect(trie.search("node")).toEqual([]);
  });
});
