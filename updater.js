import AdmZip from "adm-zip";
import { Buffer } from 'node:buffer';
import fs, { createWriteStream } from "fs";
import { pipeline } from 'stream/promises';
import path from "path";

const GTFS_DIR = path.join(process.cwd(), 'public', 'apiDocumentation');

const INFO_URL = "https://www.transportforireland.ie/transitData/Data/GTFS_Realtime.zip";

const IS_LOW_MEM = process.env.IS_LOW_MEM;



export async function updateInfo() {
  //Create API documentation directory if it doesn't already exist, especially important for first server launch.
  if (!fs.existsSync(GTFS_DIR)) {
    fs.mkdirSync(GTFS_DIR, { recursive: true });
  }
  
  if (IS_LOW_MEM){return await processZipDisk()}
  else {return await processZipMemory()}

}

//A less memory-intensive way to get the reference material that does not load it into the memory, for less memory intensive environments.
 async function processZipDisk() {

  try {
    
    const response = await fetch(INFO_URL);
    if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);

    const zipPath = path.join(GTFS_DIR, 'temp.zip');
    const fileStream = createWriteStream(zipPath);
    await pipeline(response.body, fileStream);

    const zip = new AdmZip(zipPath);
    for (const entry of zip.getEntries()) {
      if (!entry.isDirectory) {
        const safePath = path.join(GTFS_DIR, path.basename(entry.name));
        await fs.promises.writeFile(safePath, entry.getData());
      }
    }

    await fs.promises.unlink(zipPath);
    return true;
  } catch (error) {
    console.error("Update failed:", error);
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