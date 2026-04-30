import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const brandDir = path.resolve(__dirname, "../public/assets/brand");

const jobs = [
  {
    input: "cw-monogram.svg",
    output: "icon-512.png",
    width: 512,
    height: 512
  },
  {
    input: "cw-monogram.svg",
    output: "icon-192.png",
    width: 192,
    height: 192
  },
  {
    input: "cw-monogram.svg",
    output: "apple-touch-icon.png",
    width: 180,
    height: 180
  },
  {
    input: "cw-monogram.svg",
    output: "favicon-32.png",
    width: 32,
    height: 32
  },
  {
    input: "og-home.svg",
    output: "og-home.png",
    width: 1200,
    height: 630
  },
  {
    input: "og-apply.svg",
    output: "og-apply.png",
    width: 1200,
    height: 630
  },
  {
    input: "og-positions.svg",
    output: "og-positions.png",
    width: 1200,
    height: 630
  },
  {
    input: "og-so1.svg",
    output: "og-so1.png",
    width: 1200,
    height: 630
  }
];

await Promise.all(
  jobs.map(async (job) => {
    await sharp(path.join(brandDir, job.input))
      .resize(job.width, job.height)
      .png()
      .toFile(path.join(brandDir, job.output));
  })
);

console.log(`Rendered ${jobs.length} brand assets.`);
