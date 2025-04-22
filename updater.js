import AdmZip from "adm-zip";
import { Buffer } from 'node:buffer';
import fs from "fs";
import path from "path";

const GTFS_DIR = path.join(process.cwd(), 'public', 'apiDocumentation');

const infoUrl = "https://www.transportforireland.ie/transitData/Data/GTFS_Realtime.zip";

export async function updateInfo() {
  try {
    // On first run especially, create API documentation folder if it doesn't already exist
    if (!fs.existsSync(GTFS_DIR)) {
      fs.mkdirSync(GTFS_DIR, { recursive: true });
      console.log('Created apiDocumentation directory');
    }

    const response = await fetch(infoUrl);
    if (!response.ok) throw new Error("Download failed: HTTP " + response.status)

    const buffer = await response.arrayBuffer();
    const zip = new AdmZip(Buffer.from(buffer));

    for (const entry of zip.getEntries()) {
      const safePath = path.join("./public/apiDocumentation", path.basename(entry.name));
      await fs.promises.writeFile(safePath, entry.getData());
    }

    console.log("API info updated successfully!");
    return true;
  } catch (error) {
    console.error("Update failed:", error);
    return false;
  }
}