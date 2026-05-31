import { HtmlBasePlugin } from "@11ty/eleventy";
import * as esbuild from "esbuild";

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("css");
  eleventyConfig.addPassthroughCopy({ "static": "/" });
  eleventyConfig.addPlugin(HtmlBasePlugin);

  eleventyConfig.on("eleventy.before", async () => {
    await esbuild.build({
      entryPoints: ["js/src/main.js"],
      bundle: true,
      minify: true,
      sourcemap: true,
      target: ["es2020"],
      outfile: "_site/js/bundle.js",
    });
  });

  eleventyConfig.addWatchTarget("./js/src/");

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
