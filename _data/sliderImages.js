import fs from "node:fs";

const dir = "static/images";

export default () =>
  fs
    .readdirSync(dir)
    .filter((file) => /\.(jpe?g|png|webp|avif)$/i.test(file))
    .sort()
    .map((file) => `/images/${file}`);
