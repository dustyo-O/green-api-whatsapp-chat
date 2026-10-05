// Spec 001 functional §2.6: only git's and GitHub's merge messages skip the format check.
// commitlint's default ignores also let through `fixup!`, `squash!`, `Revert "…"`,
// `Initial commit`, version tags and more, so they are switched off.
const MERGE_MESSAGES = [
  /^Merge branch '[^']+'(?: of \S+)?(?: into \S+)?$/,
  /^Merge pull request #\d+ from \S+$/,
];

export default {
  extends: ["@commitlint/config-conventional"],
  defaultIgnores: false,
  ignores: [
    (message) => {
      const header = message.split("\n", 1)[0];
      return MERGE_MESSAGES.some((pattern) => pattern.test(header));
    },
  ],
};
