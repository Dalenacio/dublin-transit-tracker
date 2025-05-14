import yauzl from "yauzl";
import { Buffer } from 'node:buffer';
import fs from "fs";
import fsp from 'fs/promises';
import { pipeline } from 'stream/promises';
import path from "path";
import 'dotenv/config';
import os from 'os';

const GTFS_DIR = path.join(process.cwd(), 'public', 'apiDocumentation');
const INFO_URL = "https://www.transportforireland.ie/transitData/Data/GTFS_Realtime.zip";
const IS_LOW_MEM = process.env.IS_LOW_MEM === "true";

let isUpdating = false;

export async function updateInfo() {
  if (isUpdating) {
      console.log("Update already in progress.");
      return false;
  }
  isUpdating = true;
  console.log("Starting update of API reference material...");

  try {
    await fsp.mkdir(GTFS_DIR, { recursive: true });

    let success = false;
    if (IS_LOW_MEM) {
        success = await processZipDisk();
    } else {
        // success = await processZipMemory(); //Not yet implemented
        throw new Error("Standard memory processing not implemented yet.");
    }
    console.log("Update process completed.", success ? "Success!" : "Failed or partial success.");
    return success;

  } catch (error) {
    console.error("Error during updateInfo:", error);
    return false;
  } finally {
    isUpdating = false;
  }
}

export function getIsUpdating() {
  return isUpdating;
}

//A less memory-intensive way to get the reference material that does not load it into the memory, for less memory intensive environments.
async function processZipDisk() {
  const EXCLUDED_FILES = new Set(['shapes.txt']);
  let zipPath;
  let success = true;

  try {
    console.log(`Downloading GTFS data from ${INFO_URL}...`);
    const response = await fetch(INFO_URL);
    if (!response.ok || !response.body) {
        throw new Error(`Download failed: HTTP ${response.status}`);
    }
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'gtfs-'));
    zipPath = path.join(tempDir, `gtfs_download.zip`);
    const fileStream = fs.createWriteStream(zipPath);
    await pipeline(response.body, fileStream);


    console.log(`Starting reference material extraction to ${GTFS_DIR}.`);
    await new Promise((resolve, reject) => {
      yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
        if (err) {
          return reject(new Error(`Error opening zip file: ${err.message}`));
        }

        zipfile.on('error', (zipErr) => {
            success = false;
            console.error("Zipfile error:", zipErr)
            reject(zipErr);
        });

        zipfile.on('end', () => {
            resolve();
        });

        zipfile.on('entry', async (entry) => {
          try {
            const fullOutputPath = path.join(GTFS_DIR, entry.fileName);

            if (entry.fileName.endsWith('/')) {
              zipfile.readEntry();
              return;
            }

            if (EXCLUDED_FILES.has(entry.fileName)) {
              console.log(`Excluding file: ${entry.fileName}`);
              zipfile.readEntry();
              return;
            }
            const outputDir = path.dirname(fullOutputPath);
            await fsp.mkdir(outputDir, { recursive: true });

            zipfile.openReadStream(entry, async (streamErr, readStream) => {
              if (streamErr) {
                console.error(`Error opening read stream for ${entry.fileName}:`, streamErr);
                success = false;
                zipfile.readEntry();
                return;
              }

              try {
                const writeStream = fs.createWriteStream(fullOutputPath);
                await pipeline(readStream, writeStream);
              } catch (pipeErr) {
                console.error(`Error piping data for ${entry.fileName}:`, pipeErr);
                success = false;
                try { await fsp.unlink(fullOutputPath); } catch { /* ignore unlink error */ }
              } finally {
                 zipfile.readEntry();
              }
            });
          } catch (entryProcessingError) {
              console.error(`Error processing entry ${entry.fileName}:`, entryProcessingError);
              success = false;
              zipfile.readEntry();
          }
        });

        zipfile.readEntry();
      });
    });

    console.log("Extraction process finished.");

  } catch (error) {
    console.error("Error during disk processing:", error);
    success = false;
  } finally {
    if (zipPath) {
      const tempDir = path.dirname(zipPath);
      console.log(`Cleaning up temporary directory: ${tempDir}`);
      try {
        await fsp.rm(tempDir, { recursive: true, force: true });
      } catch (rmErr) {
        console.error(`Error deleting temporary directory ${tempDir}: ${rmErr}`);
      }
    }
  }
  return success;
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