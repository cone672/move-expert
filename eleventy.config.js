import { HtmlBasePlugin } from "@11ty/eleventy";
import * as esbuild from "esbuild";
import path from "node:path";

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "static": "/" });
  eleventyConfig.addPlugin(HtmlBasePlugin);

  // Live object holding the content-hashed asset URLs. Populated by the
  // build hook below and read by templates via {{ assets.css/js }}.
  const assets = { css: "/css/style.css", js: "/js/bundle.js" };
  eleventyConfig.addGlobalData("assets", () => assets);

  const urlOf = (result, ext) => {
    const out = Object.keys(result.metafile.outputs).find((k) => k.endsWith(ext));
    return "/" + path.relative("_site", out).split(path.sep).join("/");
  };

  eleventyConfig.on("eleventy.before", async () => {
    const [js, css] = await Promise.all([
      esbuild.build({
        entryPoints: { bundle: "js/src/main.js" },
        bundle: true,
        minify: true,
        sourcemap: true,
        target: ["es2020"],
        entryNames: "[name]-[hash]",
        outdir: "_site/js",
        metafile: true,
      }),
      esbuild.build({
        entryPoints: { style: "css/style.css" },
        bundle: true,
        minify: true,
        target: ["chrome108", "firefox108", "safari16", "edge108"],
        entryNames: "[name]-[hash]",
        outdir: "_site/css",
        metafile: true,
      }),
    ]);

    assets.js = urlOf(js, ".js");
    assets.css = urlOf(css, ".css");
  });

  eleventyConfig.addWatchTarget("./js/src/");
  eleventyConfig.addWatchTarget("./css/");

  return {
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    dir: {
      input: ".",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
  };
}
