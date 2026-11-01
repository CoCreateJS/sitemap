import { checkValue, ObjectId, HTMLScanner } from "@cocreate/utils";

/**
 * Escapes special XML characters to prevent XML parsing syntax errors.
 * @param {string|number} str - String or numeric input
 * @returns {string} XML safe string
 * @public
 * @environment server
 */
export function encodeXML(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Scans raw HTML source within a file object to populate structured sitemap metadata.
 * Uses HTMLScanner to query elements with [sitemap] attributes and document head tags.
 * @param {Object} file - File object containing HTML source string
 * @public
 * @environment server
 */
export function parseHtml(file) {
  if (!file || !file.src || typeof file.src !== "string") return;

  if (!file.sitemap) {
    file.sitemap = {};
  }

  const doc = new HTMLScanner(file.src);
  const elements = doc.querySelectorAll({ attributes: ["sitemap"] });
  const types = ["image", "video", "news"];

  // Reset any pre-existing entry arrays for fresh parsing
  for (const type of types) {
    delete file.sitemap[type];
  }

  for (const el of elements) {
    const tagName = el.tagName;
    let type = "";
    let entryObject = {};

    if (tagName === "IMG") {
      type = "image";
      entryObject = {
        loc: el.getAttribute("src") || "",
        title: el.getAttribute("sitemap-title") || el.getAttribute("title") || el.getAttribute("alt") || "",
        caption: el.getAttribute("sitemap-caption") || el.getAttribute("alt") || el.getAttribute("sitemap-title") || el.getAttribute("title") || "",
        geo_location: el.getAttribute("sitemap-geo-location") || ""
      };
    } else if (tagName === "VIDEO") {
      type = "video";
      entryObject = {
        content_loc: el.getAttribute("src") || "",
        title: el.getAttribute("sitemap-title") || el.getAttribute("title") || "",
        description: el.getAttribute("description") || el.getAttribute("sitemap-description") || "",
        thumbnail_loc: el.getAttribute("sitemap-thumbnail") || el.getAttribute("poster") || "",
        duration: el.getAttribute("sitemap-duration") || ""
      };
    } else {
      type = "news";
      file.sitemap.type = "news";

      // Query title tag using standard scanner query
      const titleHandles = doc.querySelectorAll({ tags: ["TITLE"] });
      const docTitle = titleHandles.length > 0 ? titleHandles[0].getInnerHTML().trim() : "";

      // Query meta tags using standard scanner query
      const metaHandles = doc.querySelectorAll({ tags: ["META"] });
      const keywordsMeta = metaHandles.find(h => h.getAttribute("name") === "keywords");
      const docKeywords = keywordsMeta ? keywordsMeta.getAttribute("content") : "";

      // Extract HTML lang attribute
      const htmlHandles = doc.querySelectorAll({ tags: ["HTML"] });
      const docLang = htmlHandles.length > 0 ? htmlHandles[0].getAttribute("lang") : "en";

      entryObject = {
        title: el.getAttribute("sitemap-title") || docTitle,
        publication: {
          name: el.getAttribute("sitemap-publication-name") || "",
          language: el.getAttribute("sitemap-publication-language") || docLang
        },
        publication_date: el.getAttribute("sitemap-publication-date") || file.updated?.on || new Date().toISOString(),
        keywords: el.getAttribute("sitemap-keywords") || docKeywords,
        genres: el.getAttribute("sitemap-genres") || ""
      };
    }

    // Strip empty string keys
    Object.keys(entryObject).forEach(key => {
      if (entryObject[key] === "" || entryObject[key] === null || entryObject[key] === undefined) {
        delete entryObject[key];
      }
    });

    if (!file.sitemap[type]) {
      file.sitemap[type] = [];
    }
    file.sitemap[type].push(entryObject);
  }

  if (!["news", "image", "video"].includes(file.sitemap.type)) {
    const metaHandles = doc.querySelectorAll({ tags: ["META"] });

    const priorityMeta = metaHandles.find(h => h.getAttribute("name") === "sitemap-priority");
    if (priorityMeta && priorityMeta.getAttribute("content")) {
      file.sitemap.priority = priorityMeta.getAttribute("content");
    }

    const changefreqMeta = metaHandles.find(h => h.getAttribute("name") === "sitemap-changefreq");
    if (changefreqMeta && changefreqMeta.getAttribute("content")) {
      file.sitemap.changefreq = changefreqMeta.getAttribute("content");
    } else if (!file.sitemap.changefreq) {
      file.sitemap.changefreq = "monthly";
    }
  }
}

/**
 * Determines if a file object is eligible for inclusion in the sitemap index.
 * @param {Object} file - File record to test
 * @returns {boolean} True if eligible
 * @public
 * @environment server
 */
export function check(file) {
  if (!file) return false;
  if (file.public === false || String(file.public) === "false") return false;
  if (file.sitemap && (file.sitemap.enable === false || String(file.sitemap.enable) === "false")) return false;
  const path = file.path || file.pathname || "";
  if (path.startsWith("/_") || path.startsWith("/api/")) return false;
  return true;
}

/**
 * Constructs XML node strings for individual sitemap entries.
 * @param {string} loc - Full URL location of the page
 * @param {Object} sitemap - Sitemap metadata block
 * @returns {string} Single <url> XML block
 * @public
 * @environment server
 */
export function createEntry(loc, sitemap = {}) {
  let xml = `  <url>\n    <loc>${encodeXML(loc)}</loc>\n`;

  if (sitemap.lastmod) {
    xml += `    <lastmod>${encodeXML(sitemap.lastmod)}</lastmod>\n`;
  }
  if (sitemap.changefreq) {
    xml += `    <changefreq>${encodeXML(sitemap.changefreq)}</changefreq>\n`;
  }
  if (sitemap.priority) {
    xml += `    <priority>${encodeXML(sitemap.priority)}</priority>\n`;
  }

  // Image extension nodes
  if (Array.isArray(sitemap.image)) {
    for (const img of sitemap.image) {
      xml += `    <image:image>\n      <image:loc>${encodeXML(img.loc)}</image:loc>\n`;
      if (img.title) xml += `      <image:title>${encodeXML(img.title)}</image:title>\n`;
      if (img.caption) xml += `      <image:caption>${encodeXML(img.caption)}</image:caption>\n`;
      if (img.geo_location) xml += `      <image:geo_location>${encodeXML(img.geo_location)}</image:geo_location>\n`;
      xml += `    </image:image>\n`;
    }
  }

  // Video extension nodes
  if (Array.isArray(sitemap.video)) {
    for (const vid of sitemap.video) {
      xml += `    <video:video>\n      <video:content_loc>${encodeXML(vid.content_loc)}</video:content_loc>\n`;
      if (vid.title) xml += `      <video:title>${encodeXML(vid.title)}</video:title>\n`;
      if (vid.description) xml += `      <video:description>${encodeXML(vid.description)}</video:description>\n`;
      if (vid.thumbnail_loc) xml += `      <video:thumbnail_loc>${encodeXML(vid.thumbnail_loc)}</video:thumbnail_loc>\n`;
      if (vid.duration) xml += `      <video:duration>${encodeXML(vid.duration)}</video:duration>\n`;
      xml += `    </video:video>\n`;
    }
  }

  // News extension nodes
  if (Array.isArray(sitemap.news)) {
    for (const newsItem of sitemap.news) {
      xml += `    <news:news>\n`;
      if (newsItem.publication) {
        xml += `      <news:publication>\n`;
        xml += `        <news:name>${encodeXML(newsItem.publication.name)}</news:name>\n`;
        xml += `        <news:language>${encodeXML(newsItem.publication.language)}</news:language>\n`;
        xml += `      </news:publication>\n`;
      }
      if (newsItem.publication_date) xml += `      <news:publication_date>${encodeXML(newsItem.publication_date)}</news:publication_date>\n`;
      if (newsItem.title) xml += `      <news:title>${encodeXML(newsItem.title)}</news:title>\n`;
      if (newsItem.keywords) xml += `      <news:keywords>${encodeXML(newsItem.keywords)}</news:keywords>\n`;
      xml += `    </news:news>\n`;
    }
  }

  xml += `  </url>\n`;
  return xml;
}

/**
 * Assembles a complete XML sitemap document from a list of file objects and host domain.
 * @param {Array<Object>} files - Array of file objects
 * @param {string} domain - Host domain (e.g. "https://example.com")
 * @returns {string} Fully formed sitemap.xml content string
 * @public
 * @environment server
 */
export function buildSitemapXml(files = [], domain = "") {
  const cleanDomain = domain.replace(/\/+$/, "");
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n`;
  xml += `        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"\n`;
  xml += `        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"\n`;
  xml += `        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n`;

  for (const file of files) {
    if (!check(file)) continue;

    parseHtml(file);

    const pathname = file.pathname || file.path || "/";
    const loc = `${cleanDomain}${pathname.startsWith("/") ? "" : "/"}${pathname}`;
    xml += createEntry(loc, file.sitemap);
  }

  xml += `</urlset>`;
  return xml;
}

/**
 *
 * @name alt
 * @kind member
 * @attribute
 * @environment server
 */

/**
 *
 * @name content
 * @kind member
 * @attribute
 * @environment server
 */

/**
 *
 * @name description
 * @kind member
 * @attribute
 * @environment server
 */

/**
 *
 * @name lang
 * @kind member
 * @attribute
 * @environment server
 */

/**
 *
 * @name name
 * @kind member
 * @attribute
 * @environment server
 */

/**
 *
 * @name poster
 * @kind member
 * @attribute
 * @environment server
 */

/**
 *
 * @name sitemap-caption
 * @kind member
 * @attribute
 * @environment server
 */

/**
 *
 * @name sitemap-description
 * @kind member
 * @attribute
 * @environment server
 */

/**
 *
 * @name sitemap-duration
 * @kind member
 * @attribute
 * @environment server
 */

/**
 *
 * @name sitemap-genres
 * @kind member
 * @attribute
 * @environment server
 */

/**
 *
 * @name sitemap-geo-location
 * @kind member
 * @attribute
 * @environment server
 */

/**
 *
 * @name sitemap-keywords
 * @kind member
 * @attribute
 * @environment server
 */

/**
 *
 * @name sitemap-publication-date
 * @kind member
 * @attribute
 * @environment server
 */

/**
 *
 * @name sitemap-publication-language
 * @kind member
 * @attribute
 * @environment server
 */

/**
 *
 * @name sitemap-publication-name
 * @kind member
 * @attribute
 * @environment server
 */

/**
 *
 * @name sitemap-thumbnail
 * @kind member
 * @attribute
 * @environment server
 */

/**
 *
 * @name sitemap-title
 * @kind member
 * @attribute
 * @environment server
 */

/**
 *
 * @name src
 * @kind member
 * @attribute
 * @environment server
 */

/**
 *
 * @name title
 * @kind member
 * @attribute
 * @environment server
 */

/**
 * Server-side XML sitemap engine with image, video, and news metadata extraction and dynamic sitemap sharding.
 *
 * @module server-sitemap
 * @environment server
 */
