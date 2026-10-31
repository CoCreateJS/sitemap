# CoCreate-sitemap

A high-performance, stateless, and functional JavaScript utility for automated XML sitemap generation and management. Engineered to run seamlessly across clustered environments, it dynamically builds, updates, and shards compliant sitemaps—including standard URLs, Images, Videos, and Google News metadata—by evaluating data modifications and parsing live HTML content.

---

## Table of Contents

* [Features](#features)
* [Installation](#installation)
* [Usage](#usage)
* [How it Works](#how-it-works)
* [HTML Schema Overrides](#html-schema-overrides)
* [Announcements](#announcements)
* [Roadmap](#roadmap)
* [How to Contribute](#how-to-contribute)
* [About](#about)
* [License](#license)

---

## Features

* **Dynamic XML Automation:** Intercepts real-time document modifications to generate, update, or expand sitemaps instantly.
* **Algorithmic Guardrails:** Automatically enforces strict SEO quality filters, bypassing draft states, private URLs, `noindex` directions, and views missing a valid `<title>`.
* **Delta Freshness Verifications:** Prevents redundant database write cycles by skipping processing if the active map's `lastmod` timestamp is already up to date with the resource's latest modification.
* **Hierarchical SEO Weighting:** Automatically derives page crawling priority values based on the layout depth of the URL path, eliminating manual weighting.
* **Rich Media Graphing:** Scans internal HTML nodes decorated with `sitemap="true"` to extract context and populate independent tracking sets for Images, Videos, and Google News.
* **Automated Index Sharding:** Monitors file buffers natively to cleanly split indexing paths when passing Google's 50,000 URL limit or MongoDB's 15MB document safety limit.

---

## Installation

```bash
npm install @cocreate/sitemap
```

> [!NOTE]
> All core underlying dependencies (including parsing utilities like `node-html-parser`) are managed natively and installed automatically.

---

## Usage

### JavaScript API

Inject your runtime context (`file`, `host`, and your decoupled `crud` database engine) into the stateless `check` entry point:

```javascript
import { check } from '@cocreate/sitemap';

const fileContext = {
  "content-type": "text/html",
  "public": true,
  "pathname": "/blog/dynamic-sitemaps",
  "src": "<html><head><title>My Blog Post</title></head><body>...</body></html>",
  "modified": { on: "2026-07-19T08:30:00Z" }
};

await check({
  file: fileContext,
  host: "https://example.com",
  crud: yourCrudDatabaseInstance
});
```

---

## How it Works

1. **Eligibility Filter:** The module checks structural requirements (such as content type, public access flags, absence of `noindex` directives, and valid `<title>` nodes).
2. **Freshness Assessment:** The target's change vector is cross-referenced against saved records. If no updates are required, execution exits early to reduce unnecessary I/O.
3. **DOM Content Extraction:** For valid HTML documents, the layout engine parses targeted media assets marked for sitemap ingestion.
4. **Sharding Verification:** The engine reads the root index (`sitemap.xml`) to locate corresponding media buckets. If a sitemap approaches Google's 50,000 URL limit or MongoDB's 15MB document limit, a new sitemap shard is automatically created.
5. **XML Serialization:** Encodes structural characters and writes updated sitemap data back through your configured `crud` transport.

---

## HTML Schema Overrides

You can explicitly override calculated priorities, change frequencies, or extract media nodes directly from your frontend markup.

### Meta Specifications

* **Exclude Page:** `<meta name="robots" content="noindex">`
* **Custom Crawling Priority:** `<meta name="sitemap-priority" content="0.9">`
* **Custom Change Frequency:** `<meta name="sitemap-changefreq" content="weekly">`

### Extended Media Node Extractors

Simply mark target elements with `sitemap="true"` to automatically include them in media sitemaps:

```html
<!-- Automated Image Mapping -->
<img src="/assets/hero.jpg"
     sitemap="true"
     title="Hero View"
     alt="Main Dashboard Profile"
     sitemap-geo-location="New York, NY" />

<!-- Automated Video Mapping -->
<video src="/media/explainer.mp4"
       sitemap="true"
       title="Product Walkthrough"
       poster="/thumbs/explainer.jpg"
       description="A complete system overview"
       sitemap-duration="180" />
```

---

## Announcements

All updates, protocol revisions, and performance improvements are documented in our `CHANGELOG.md` and on the [CoCreate Sitemap GitHub Releases](https://github.com/CoCreateJS/CoCreate-sitemap/releases) page.

---

## Roadmap

If you are interested in the future direction of this project, please take a look at our open issues and pull requests on the repository. We welcome community input on scaling indexing strategies and improving sitemap generation performance.

---

## How to Contribute

We encourage contribution to our libraries (you might even score some nifty swag), please see our [CONTRIBUTING.md](https://github.com/CoCreateJS/CoCreate-sitemap/blob/master/CONTRIBUTING.md) guide for details. If you encounter any bugs or wish to make feature requests, please submit an issue on our [GitHub Issues](https://github.com/CoCreateJS/CoCreate-sitemap/issues) tracker. We want this library to be community-driven, and CoCreate-led. We need your help to realize this goal.

For broader system configurations and API guides, please visit our [CoCreate Sitemap Documentation](https://cocreatejs.com/docs/sitemap).

---

## About

`@cocreate/sitemap` is designed, built, and supported by the CoCreate Developer Experience Team.

> [!NOTE]
> Please contact the Developer Experience Team via [GitHub Discussions](https://github.com/CoCreateJS/CoCreate-sitemap/discussions) or join our Discord community for questions about sitemap generation, indexing, or deployment.

`@cocreate/sitemap` is maintained and funded by CoCreate. The names and logos for CoCreate are trademarks of CoCreate, LLC.

---

## License

This software is dual-licensed under the GNU Affero General Public License version 3 (AGPLv3) and a commercial license.

* **Open Source Use:** For open-source projects and non-commercial use, this software is available under the AGPLv3. For the full license text, see the LICENSE file.
* **Commercial Use:** For-profit companies and individuals intending to use this software for commercial purposes must obtain a commercial license. The commercial license is available when you sign up for an API key on our website.