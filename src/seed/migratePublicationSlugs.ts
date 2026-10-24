import ContentItem from "../models/contentItem";

const slugify = (value: string): string => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
  .slice(0, 100)
  .replace(/-+$/g, "");

export const migratePublicationSlugs = async (): Promise<void> => {
  const items = await ContentItem.find({ kind: { $in: ["publication", "report"] }, isDeleted: { $ne: true } })
    .sort({ createdAt: 1, _id: 1 });
  const usedSlugs = new Set<string>();

  for (const item of items) {
    const baseSlug = slugify(item.title) || item.kind;
    let slug = item.slug || baseSlug;
    let suffix = 2;
    while (usedSlugs.has(slug)) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
    if (item.slug !== slug) {
      await ContentItem.updateOne({ _id: item._id }, { $set: { slug, slugScope: "publications" } });
      item.slug = slug;
    } else if (item.slugScope !== "publications") {
      await ContentItem.updateOne({ _id: item._id }, { $set: { slugScope: "publications" } });
    }
    usedSlugs.add(slug);
  }
};
