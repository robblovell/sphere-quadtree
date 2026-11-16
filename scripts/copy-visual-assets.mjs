import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

mkdirSync("dist/visual", { recursive: true });
for (const file of ["index.html", "style.css", "ne_110m_coastline.geojson"]) {
  copyFileSync(join("src/visual", file), join("dist/visual", file));
}
