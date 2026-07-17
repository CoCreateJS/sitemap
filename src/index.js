import { parse } from "node-html-parser";

/**
 * Clean, stateless functional entry point to check and verify a file against the sitemap.
 * All dependencies are passed explicitly via the parameters object.
 * 
 * @param {Object} options
 * @param {Object} options.file - The file object being verified
 * @param {string} options.host - The active website hostname
 * @param {Object} options.crud - Crud database instance
 */
export async function check({ file, host, crud }) {
    // Ensure the file is HTML and does not have a sitemap object yet
    if (!file.sitemap && file["content-type"] !== "text/html") return;

    // Ensure the file is public and is not sitemap false
    if (
        file.sitemap === false ||
        file.sitemap === "false" ||
        !file.public ||
        file.public === "false"
    )
        return;

    // Check if the file is HTML and contains a noindex meta or title tag
    if (file["content-type"] === "text/html" && file.src) {
        if (
            /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex[^"']*["']/i.test(
                file.src
            )
        )
            return;
        if (!/<title[^>]*>[\s\S]*?<\/title>/i.test(file.src)) return;
    }

    // Compare the lastmod date in the sitemap with the modified.on date
    if (file.sitemap && file.sitemap.lastmod && file.modified?.on) {
        if (new Date(file.sitemap.lastmod) >= new Date(file.modified.on))
            return;
    }

    // Logic to update the sitemap asynchronously
    await updateSitemap({ file, host, crud });
}

// ==========================================
// Stateless Private Helper Functions
// ==========================================

async function updateSitemap({ file, host, crud }) {
    try {
        if (!file.sitemap) file.sitemap = {};

        const entry = createEntry(file);

        let { mainSitemap, sitemap } = await getSitemap({ file, host, crud });

        if (file.pathname) {
            // Perform regex search starting at the pathname
            const regexPattern = `<url>\\s*<loc>.*?${file.pathname.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
            )}.*?</loc>[\\s\\S]*?</url>`;
            const match = sitemap.src.match(new RegExp(regexPattern));

            if (match) {
                const position = match.index; // Start position of the <url> block
                const endPosition = match.index + match[0].length; // End position of the <url> block

                // Replace the original <url> block with the modified one
                sitemap.src =
                    sitemap.src.slice(0, position) +
                    entry +
                    sitemap.src.slice(endPosition);
            } else {
                sitemap.src = sitemap.src.replace(
                    "</urlset>",
                    `${entry}</urlset>`
                );
            }
        } else {
            file.sitemap.pathname = sitemap.pathname;
            sitemap.src = sitemap.src.replace(
                "</urlset>",
                `${entry}</urlset>`
            );
        }

        await saveSitemap({ file: mainSitemap, host, crud });
        await saveSitemap({ file: sitemap, host, crud });
        await saveSitemap({ file, host, crud });

    } catch (err) {
        console.error("Error updating sitemap:", err);
    }
}

function createEntry(file) {
    file.sitemap.loc = file.pathname;
    file.sitemap.lastmod = file.modified?.on;

    if (file["content-type"] === "text/html") {
        parseHtml(file);

        if (
            file.sitemap.type !== "news" &&
            file.sitemap.type !== "image" &&
            file.sitemap.type !== "video"
        ) {
            if (!file.sitemap.changefreq)
                file.sitemap.changefreq = "monthly";

            if (!file.sitemap.priority) {
                const depth = (file.pathname.match(/\//g) || []).length;
                file.sitemap.priority = Math.max(
                    0.1,
                    1.0 - (depth - 1) * 0.1
                ).toFixed(1);
            }
        } else {
            delete file.sitemap.changefreq;
            delete file.sitemap.priority;
        }
    }

    let entry = `\t<url>\n`;

    for (const key of Object.keys(file.sitemap)) {
        if (key === "pathname" || key === "type") continue;

        let value = file.sitemap[key];

        if (
            typeof value === "object" &&
            value !== null &&
            !(value instanceof Date)
        ) {
            if (!Array.isArray(value)) value = [value];

            for (let i = 0; i < value.length; i++) {
                entry += `\t\t<${key}:${key}>\n`;

                for (const nestedKey of Object.keys(value[i])) {
                    let nestedValue = value[i][nestedKey];
                    // Handle nested objects
                    if (
                        typeof nestedValue === "object" &&
                        nestedValue !== null &&
                        !(nestedValue instanceof Date)
                    ) {
                        entry += `\t\t\t<${key}:${nestedKey}>\n`;
                        for (const subKey of Object.keys(nestedValue)) {
                            const subValue = nestedValue[subKey];
                            entry += `\t\t\t\t<${key}:${subKey}>${subValue}</${key}:${subKey}>\n`;
                        }
                        entry += `\t\t\t</${key}:${nestedKey}>\n`;
                    } else {
                        if (nestedKey === "loc") {
                            if (
                                !nestedValue.startsWith("https://") &&
                                !nestedValue.startsWith("http://") &&
                                !nestedValue.startsWith("{{$host}}")
                            ) {
                                nestedValue = `{{$host}}${nestedValue}`;
                            }
                        } else if (nestedKey === "publication_date") {
                            nestedValue =
                                new Date(nestedValue)
                                    .toISOString()
                                    .split(".")[0] + "Z";
                        } else {
                            nestedValue = encodeXML(nestedValue);
                        }

                        entry += `\t\t\t<${key}:${nestedKey}>${nestedValue}</${key}:${nestedKey}>\n`;
                    }
                }

                entry += `\t\t</${key}:${key}>\n`;
            }
        } else {
            if (key === "loc") {
                if (
                    !value.startsWith("https://") &&
                    !value.startsWith("http://")
                ) {
                    value = `{{$host}}${value}`;
                }
            } else if (key === "lastmod") {
                value =
                    new Date(file.modified?.on).toISOString().split(".")[0] +
                    "Z";
            } else {
                value = encodeXML(value);
            }

            entry += `\t\t<${key}>${value}</${key}>\n`;
        }
    }

    entry += `\t</url>\n`;

    return entry;
}

async function getSitemap({ file, host, crud }) {
    let mainSitemap = {
        host: file.host,
        name: "sitemap.xml",
        path: "/",
        pathname: "/sitemap.xml",
        directory: "/",
        "content-type": "application/xml",
        public: true,
        organization_id: file.organization_id
    };

    mainSitemap = await readSitemap({ file: mainSitemap, host, crud });
    if (!mainSitemap.src) mainSitemap.src = generateSitemapXml("main");

    let sitemap = {
        host: file.host,
        path: "/",
        pathname: file.sitemap.pathname,
        directory: "/",
        "content-type": "application/xml",
        public: true,
        organization_id: file.organization_id
    };

    // Update loc using pathname
    file.sitemap.loc = `${file.pathname}`;

    // Query the database for the correct sitemap based on the loc and type
    if (file.sitemap.pathname) {
        sitemap = await readSitemap({ file: sitemap, host, crud });
    }

    if (!sitemap.src) {
        let type = "sitemap";

        // Identify content type to determine sitemap type
        if (file["content-type"].startsWith("image/")) {
            type = "image";
        } else if (file["content-type"].startsWith("video/")) {
            type = "video";
        } else if (file.sitemap.type === "news") {
            type = "news";
        }

        let name = `sitemap`;
        if (type === "image" || type === "video" || type === "news")
            name = `sitemap-${type}`;

        // If no existing sitemap found check last index sitemap
        let index = await getLastSitemapIndex(mainSitemap, name);
        if (index) {
            sitemap.pathname = `/${name}${index}.xml`;
            sitemap = await readSitemap({ file: sitemap, host, crud });
        } else {
            index = 1;
        }

        // Check if there's room in the last index sitemap
        if (!checkSitemapXml(sitemap.src)) {
            if (sitemap.src) index += 1;
            else sitemap.src = generateSitemapXml(type);

            sitemap.name = `${name}${index}.xml`;
            sitemap.pathname = `/${name}${index}.xml`;
        }
    }

    // Create the regex pattern to match the <sitemap> block containing the specific <loc> for the pathname
    const regexPattern = `<sitemap>\\s*<loc>[^<]*${sitemap.pathname}[^<]*</loc>[\\s\\S]*?</sitemap>`;

    // Execute the regex match against the sitemap index source
    const match = mainSitemap.src.match(new RegExp(regexPattern));

    // Check if a match is found
    if (!match) {
        const indexEntry = `\t<sitemap>\n\t\t<loc>{{$host}}${sitemap.pathname}</loc>\n</sitemap>`;
        mainSitemap.src = mainSitemap.src.replace(
            "</sitemapindex>",
            `${indexEntry}\n</sitemapindex>`
        );
    }

    return { mainSitemap, sitemap };
}

async function readSitemap({ file, host, crud }) {
    let data = {
        method: "object.read",
        host: host,
        array: "files",
        $filter: {
            query: {
                host: { $in: [host, "*"] },
                pathname: file.pathname
            },
            limit: 1
        },
        organization_id: file.organization_id
    };
    data = await crud.send(data);
    if (data.object && data.object.length) return data.object[0];
    else return file;
}

function generateSitemapXml(type) {
    const xmlDeclaration = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    const sitemapNamespace =
        'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';

    if (type === "main") {
        return `${xmlDeclaration}<sitemapindex ${sitemapNamespace}>\n</sitemapindex>`;
    } else {
        const imageNamespace =
            'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"';
        const videoNamespace =
            'xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"';
        const newsNamespace =
            'xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"';

        if (type === "image") {
            return `${xmlDeclaration}<urlset ${sitemapNamespace} ${imageNamespace}>\n</urlset>`;
        } else if (type === "video") {
            return `${xmlDeclaration}<urlset ${sitemapNamespace} ${videoNamespace}>\n</urlset>`;
        } else {
            // For 'news' type or any other types
            return `${xmlDeclaration}<urlset ${sitemapNamespace} ${newsNamespace} ${imageNamespace} ${videoNamespace}>\n</urlset>`;
        }
    }
}

async function saveSitemap({ file, host, crud }) {
    let data = {
        method: "object.update",
        host: host,
        array: "files",
        object: file,
        upsert: true,
        organization_id: file.organization_id
    };
    if (!file._id)
        data.$filter = {
            query: {
                host: { $in: [host, "*"] },
                pathname: file.pathname
            },
            limit: 1
        };

    await crud.send(data);
}

async function getLastSitemapIndex(mainSitemap, filename) {
    try {
        // Use regex to match all sitemap entries for the given type
        const regex = new RegExp(`\\/${filename}(\\d*)\\.xml<\\/loc>`, "g");
        const matches = mainSitemap.src.match(regex);

        return matches ? matches.length : null;
    } catch (err) {
        console.error(
            `Error determining next sitemap index for ${filename}:`,
            `err`
        );
        return null;
    }
}

function checkSitemapXml(sitemap) {
    try {
        if (!sitemap) return false;

        // Count the number of <url> entries
        const urlCount = (sitemap.match(/<url>/g) || []).length;
        if (urlCount >= 50000) return false;

        // Get the size of the sitemap string in bytes
        const fileSizeInBytes = Buffer.byteLength(sitemap, "utf8");
        const fileSizeInMB = fileSizeInBytes / (1024 * 1024);

        // Check if the file size exceeds either the 50MB limit or the MongoDB 16MB limit
        if (fileSizeInMB >= 50 || fileSizeInMB >= 15) return false;

        return true;
    } catch (err) {
        console.error("Error checking sitemap file:", err);
        return false;
    }
}

function parseHtml(file) {
    if (!file.src || typeof file.src !== "string") return;

    const dom = parse(file.src);
    const entries = dom.querySelectorAll('[sitemap="true"]');

    let types = ["image", "video", "news"];

    const previousEntries = {};
    for (let i = 0; i < types.length; i++) {
        if (!file.sitemap[types[i]]) continue;
        if (Array.isArray(file.sitemap[types[i]]))
            previousEntries[types[i]] = file.sitemap[types[i]];
        else previousEntries[types[i]] = [file.sitemap[types[i]]];

        delete file.sitemap[types[i]];
    }

    for (let i = 0; i < entries.length; i++) {
        let type = "",
            query = "";
        let existingObject;
        let entryObject = {};

        if (entries[i].tagName === "IMG") {
            type = "image";
            query = "loc";
            entryObject.loc = entries[i].getAttribute("src");
            entryObject.title =
                entries[i].getAttribute("sitemap-title") ||
                entries[i].getAttribute("title") ||
                entries[i].getAttribute("alt");
            entryObject.caption =
                entries[i].getAttribute("sitemap-caption") ||
                entries[i].getAttribute("alt") ||
                entryObject.title;
            entryObject.geo_location = entries[i].getAttribute(
                "sitemap-geo-location"
            );
        } else if (entries[i].tagName === "VIDEO") {
            type = "video";
            query = "content_loc";
            // FIXED: Using standard DOM query selector `.getAttribute("src")` instead of property `.src`
            entryObject.content_loc = entries[i].getAttribute("src");
            entryObject.title =
                entries[i].getAttribute("sitemap-title") ||
                entries[i].getAttribute("title");
            entryObject.description =
                entries[i].getAttribute("description");
            entryObject.thumbnail_loc =
                entries[i].getAttribute("sitemap-thumbnail") ||
                entries[i].getAttribute("poster");
            entryObject.duration =
                entries[i].getAttribute("sitemap-duration");
        } else {
            type = "news";
            file.sitemap.type = "news";
            query = "title";
            entryObject.title = entries[i].getAttribute("sitemap-title");
            if (!entryObject.title) {
                const title = dom.querySelector("title");
                entryObject.title = title ? title.textContent : "";
            }

            entryObject.publication = {
                name: entries[i].getAttribute("sitemap-publication-name"),
                language: entries[i].getAttribute(
                    "sitemap-publication-language"
                )
            };

            if (!entryObject.publication.language) {
                const htmlElement = dom.querySelector("html");
                entryObject.publication.language = htmlElement
                    ? htmlElement.getAttribute("lang")
                    : null;
            }

            entryObject.publication_date =
                entries[i].getAttribute("sitemap-publication-date") ||
                file.modified?.on;

            entryObject.keywords =
                entries[i].getAttribute("sitemap-keywords");
            if (!entryObject.keywords) {
                const keywords = dom.querySelector('meta[name="keywords"]');
                entryObject.keywords = keywords
                    ? keywords.getAttribute("content")
                    : "";
            }

            entryObject.genres = entries[i].getAttribute("sitemap-genres");
        }

        if (previousEntries[type]) {
            existingObject = previousEntries[type].find(
                (item) => item[query] === entryObject[query]
            );
            entryObject = { ...existingObject, ...entryObject };
        }

        Object.keys(entryObject).forEach((key) => {
            if (!entryObject[key]) delete entryObject[key];
        });

        if (!file.sitemap[type]) file.sitemap[type] = [];

        file.sitemap[type].push(entryObject);
    }

    if (
        file.sitemap.type !== "news" &&
        file.sitemap.type !== "image" &&
        file.sitemap.type !== "video"
    ) {
        const priorityMeta = dom.querySelector(
            'meta[name="sitemap-priority"]'
        );
        const changefreqMeta = dom.querySelector(
            'meta[name="sitemap-changefreq"]'
        );
        file.sitemap.priority = priorityMeta
            ? priorityMeta.getAttribute("content")
            : file.sitemap.priority;
        file.sitemap.changefreq = changefreqMeta
            ? changefreqMeta.getAttribute("content")
            : file.sitemap.changefreq || "monthly";
    }
}

function encodeXML(str) {
    if (str)
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");
}