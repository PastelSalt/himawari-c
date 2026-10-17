// Studio UI strings are never hard-coded (CLAUDE.md, plan §11.5). Every visible
// string must come from packages/studio/locales/*.json through react-intl.

/** Attributes whose values are shown to the user or read by assistive tech. */
const TEXT_ATTRIBUTES = new Set([
  "title",
  "alt",
  "placeholder",
  "label",
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
]);

/** Letters in any script. Punctuation-only text such as "·" or "→" is allowed. */
const HAS_LETTER = /\p{L}/u;

function isTextLiteral(node) {
  if (node.type === "Literal") return typeof node.value === "string" && HAS_LETTER.test(node.value);
  if (node.type === "TemplateLiteral") return node.quasis.some((q) => HAS_LETTER.test(q.value.cooked ?? ""));
  return false;
}

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: { description: "Disallow hard-coded user-visible strings in Studio JSX" },
    messages: {
      text: "Hard-coded UI text {{text}}. Add a message to packages/studio/locales/en.json and use <FormattedMessage> or intl.formatMessage().",
      attribute: "Hard-coded \"{{name}}\" attribute. Use intl.formatMessage() with a key from packages/studio/locales/en.json.",
    },
    schema: [],
  },
  create(context) {
    const preview = (s) => JSON.stringify(s.trim().slice(0, 40));
    return {
      JSXText(node) {
        if (HAS_LETTER.test(node.value)) {
          context.report({ node, messageId: "text", data: { text: preview(node.value) } });
        }
      },
      JSXExpressionContainer(node) {
        const parent = node.parent;
        if ((parent.type === "JSXElement" || parent.type === "JSXFragment") && isTextLiteral(node.expression)) {
          context.report({ node, messageId: "text", data: { text: preview(context.sourceCode.getText(node.expression)) } });
        }
      },
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier" || !TEXT_ATTRIBUTES.has(node.name.name) || !node.value) return;
        const value = node.value.type === "JSXExpressionContainer" ? node.value.expression : node.value;
        if (isTextLiteral(value)) {
          context.report({ node, messageId: "attribute", data: { name: node.name.name } });
        }
      },
    };
  },
};
