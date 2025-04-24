import AdmZip from "adm-zip";
import { Buffer } from 'node:buffer';
import fs, { createWriteStream } from "fs";
import { pipeline } from 'stream/promises';
import path from "path";
import 'dotenv/config';
import os from 'os';

const GTFS_DIR = path.join(process.cwd(), 'public', 'apiDocumentation');

const INFO_URL = "https://www.transportforireland.ie/transitData/Data/GTFS_Realtime.zip";

const IS_LOW_MEM = process.env.IS_LOW_MEM;

let isUpdating = false;


export async function updateInfo() {
  if (isUpdating) return false;
  isUpdating = true;
  console.log("updating API reference material")

  try {
    //Create API documentation directory if it doesn't already exist, especially important for first server launch.
    if (!fs.existsSync(GTFS_DIR)) {
      fs.mkdirSync(GTFS_DIR, { recursive: true });
    }
    
    if (IS_LOW_MEM == "true"){return await processZipDisk()}
    else {return await processZipMemory()}
  } catch (error) {
    console.error("updateInfo error:", error);
  } finally {
    isUpdating = false;
  }
}

export function getIsUpdating() {
  return isUpdating;
}

//A less memory-intensive way to get the reference material that does not load it into the memory, for less memory intensive environments.
async function processZipDisk() {
  let zipPath;
  try {
    const response = await fetch(INFO_URL);
    if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);

    const tempDir = os.tmpdir();
    zipPath = path.join(tempDir, `gtfs_temp_${Date.now()}.zip`);
    
    const fileStream = createWriteStream(zipPath);
    await pipeline(response.body, fileStream);

    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();
    
    // Files to exclude from extraction (we can change this as needed.)
    const EXCLUDED_FILES = new Set(['shapes.txt', 'stop_times.txt']);

    //We process the entries one at a time to minimize memory usage.
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.isDirectory || EXCLUDED_FILES.has(entry.name)) {
        continue;
      }

      const entryPath = path.join(GTFS_DIR, path.basename(entry.name));
      await fs.promises.writeFile(entryPath, entry.getData());
    }

    await fs.promises.unlink(zipPath);
    console.log('GTFS files extracted (excluding shapes.txt and stop_times.txt)');
    return true;
  } catch (error) {
    console.error("Disk processing error:", error);
    if (zipPath && fs.existsSync(zipPath)) {
      await fs.promises.unlink(zipPath);
    }
    return false;
  }
}

 //The default behavior on normal memory systems.
 async function processZipMemory() {
  try {
    const response = await fetch(INFO_URL);
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