#!/usr/bin/env node
// @ts-check

import fs from "fs/promises";

const [html, js] = await Promise.all([
  fs.readFile("hca.html", "utf-8"),
  fs.readFile("hca.js", "utf-8"),
]);

const htmlStandalone = html
  .replace(/ *import .* "\.\/hca\.js".*/, js)
  .replace(
    /(?<=\bconst hcaJsUrl = new URL\(")[^"]+/,
    `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`,
  )
  .replace(
    /(?<=<h1>HCA decoder demo<\/h1>)/,
    "\n    <i>Standalone version - you may right-click & save this page for offline use.</i><br>",
  );

await fs.writeFile("hca-standalone.html", htmlStandalone);
