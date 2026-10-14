import blogIndex from "./data/blog-index.json";
import blogPostExport from "./data/blog-posts.json";
import ContentItem, { ContentItemType } from "../models/contentItem";
import User from "../models/user";
import { UserRole } from "../utils/types";
import { sanitizeRichContent } from "../utils/sanitizeContent";

type BlogAuthor = { name: string; role: string };

type BlogBodyBlock = {
  type: string;
  text?: string;
  level?: number;
  ordered?: boolean;
  items?: string[];
  src?: string;
  caption?: string;
};

type BlogPost = {
  slug: string;
  title: string;
  standfirst: string;
  category: string;
  tags: string[];
  date: string;
  readingTime: string;
  wordCount: number;
  author: BlogAuthor;
  mediumUrl: string;
  heroImage: string;
  heroFallbackAlt: string;
  featured: boolean;
  body: BlogBodyBlock[];
};

type BlogIndexEntry = Pick<BlogPost, "slug" | "title" | "standfirst" | "category" | "date" | "author" | "heroImage" | "featured">;
type BlogExportFile = { count: number; posts: BlogPost[] };
type BlogIndexFile = { count: number; posts: BlogIndexEntry[] };

const postsExport = blogPostExport as BlogExportFile;
const indexExport = blogIndex as BlogIndexFile;

const escapeHtml = (value: string): string => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const renderInlineMarkdown = (text: string): string => escapeHtml(text)
  .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi, (_match, label: string, url: string) =>
    `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`,
  )
  .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>")
  .replace(/_([^_\n]+)_/g, "<em>$1</em>")
  .replace(/\n/g, "<br>");

const renderBlogBody = (post: BlogPost): string => post.body.map((block) => {
  const text = renderInlineMarkdown(block.text ?? "");
  switch (block.type) {
    case "paragraph":
      return `<p>${text}</p>`;
    case "heading":
      return block.level === 3 ? `<h3>${text}</h3>` : `<h2>${text}</h2>`;
    case "quote":
      return `<blockquote><p>${text}</p></blockquote>`;
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const items = (block.items ?? []).map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("");
      return `<${tag}>${items}</${tag}>`;
    }
    case "image": {
      const imageUrl = block.src && /^https:\/\//i.test(block.src) ? block.src : "";
      if (!imageUrl) return "";
      const altText = block.caption ? block.caption.replace(/[*_`[\]]/g, "").slice(0, 300) : `${post.title} illustration`;
      const image = `<p><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(altText)}"></p>`;
      return block.caption ? `${image}<p><em>${renderInlineMarkdown(block.caption)}</em></p>` : image;
    }
    default:
      throw new Error(`Unsupported blog block type "${block.type}" in ${post.slug}`);
  }
}).join("\n");

const assertMatchingExports = (): void => {
  if (postsExport.count !== postsExport.posts.length || indexExport.count !== indexExport.posts.length) {
    throw new Error("Blog seed export counts do not match their post arrays");
  }
  if (postsExport.count !== indexExport.count) {
    throw new Error("Blog index and full-post export counts do not match");
  }
  const indexBySlug = new Map(indexExport.posts.map((post) => [post.slug, post]));
  const fullSlugs = new Set<string>();
  for (const post of postsExport.posts) {
    if (!post.slug || !post.title || !post.author?.name || !post.body?.length) {
      throw new Error("Blog seed contains a post missing its slug, title, author, or body");
    }
    if (fullSlugs.has(post.slug)) throw new Error(`Blog seed contains duplicate slug "${post.slug}"`);
    fullSlugs.add(post.slug);
    const indexEntry = indexBySlug.get(post.slug);
    if (!indexEntry || indexEntry.title !== post.title || indexEntry.category !== post.category ||
      indexEntry.date !== post.date || indexEntry.featured !== post.featured) {
      throw new Error(`Blog index and full-post metadata do not match for "${post.slug}"`);
    }
  }
};

export const migrateBlogPosts = async (): Promise<void> => {
  assertMatchingExports();
  await ContentItem.init();
  const staffUsers = await User.find({ role: UserRole.STAFF, isBlocked: false }).select("_id name position");
  const staffByName = new Map(staffUsers.map((user) => [user.name.trim().toLocaleLowerCase(), user]));
  const indexOrder = new Map(indexExport.posts.map((post, position) => [post.slug, position + 1]));
  const entries: Array<Partial<ContentItemType>> = postsExport.posts.map((post) => {
    const staff = staffByName.get(post.author.name.trim().toLocaleLowerCase());
    const description = sanitizeRichContent(renderBlogBody(post));
    return {
      kind: "blog",
      legacyKey: `medium-blog-${post.slug}`,
      slug: post.slug,
      sortOrder: indexOrder.get(post.slug),
      title: post.title,
      description,
      summary: post.standfirst,
      category: post.category,
      tags: post.tags,
      image: post.heroImage,
      imageAlt: post.heroFallbackAlt,
      date: new Date(`${post.date}T00:00:00.000Z`),
      publisher: post.author.name,
      authorRole: post.author.role,
      readingTime: post.readingTime,
      wordCount: post.wordCount,
      sourceUrl: post.mediumUrl,
      featured: post.featured,
      approved: true,
      ...(staff?._id ? { postedBy: staff._id } : {}),
    };
  });

  const result = await ContentItem.bulkWrite(entries.map((entry) => ({
    updateOne: {
      filter: { kind: "blog", $or: [{ legacyKey: entry.legacyKey }, { slug: entry.slug }] },
      update: { $setOnInsert: entry },
      upsert: true,
    },
  })));
  const slugs = postsExport.posts.map((post) => post.slug);
  const importedCount = await ContentItem.countDocuments({ kind: "blog", slug: { $in: slugs } });
  if (importedCount !== entries.length) {
    throw new Error(`Blog seed migration found ${importedCount} of ${entries.length} expected blog posts after import`);
  }
  console.log(`Blog seed migration complete: ${result.upsertedCount} new posts imported; ${importedCount} of ${entries.length} supplied posts are present.`);
};
