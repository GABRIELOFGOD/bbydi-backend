import sanitizeHtml from "sanitize-html";

export const sanitizeRichContent = (content: string): string => sanitizeHtml(content, {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    "h1", "h2", "h3", "img", "table", "thead", "tbody", "tr", "th", "td",
  ],
  allowedAttributes: {
    a: ["href", "name", "target", "rel"],
    img: ["src", "alt", "title", "width", "height", "data-width", "data-align"],
    div: ["data-image-gallery", "data-columns"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["https"] },
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }, true),
  },
});
