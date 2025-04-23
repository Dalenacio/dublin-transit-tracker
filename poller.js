import { updateCache, getCache } from './cache.js';
import { updateInfo } from './updater.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const API_URL = "https://api.nationaltransport.ie/gtfsr/v2/TripUpdates?format=json";
const API_KEY = process.env.API_KEY;
const POLL_INTERVAL = 60000;




const pollApi = async () => {


  try {
    if (getCache().apiCallsToday >= 5000) {
      return;
    }

    const response = await axios.get(API_URL, {
      headers: { "x-api-key": API_KEY }
    });
    
    let isValid = false
    do {
      isValid = await checkReference(response.data.entity) 
    } while (!isValid);

    updateCache(response.data.entity);
  } catch (error) {
    console.error("Polling failed: ", error.message);
    console.log("Trying again in 30 seconds.")
    setTimeout(pollApi, 30000); 
  }
};

async function checkReference(data) {

  const routesFilePath = path.join(process.cwd(), 'public', 'apiDocumentation', 'routes.txt');
  if (!fs.existsSync(routesFilePath)) {
    const GTFS_DIR = path.join(process.cwd(), 'public', 'apiDocumentation');
    fs.mkdirSync(GTFS_DIR, { recursive: true })
    console.log('Created apiDocumentation directory!');
    await updateInfo();
  }
  
  let routesFileContent = fs.readFileSync(routesFilePath, 'utf-8');

  for (const bus of data) {
    const routeId = bus.trip_update.trip.route_id
    if (!routesFileContent.includes(routeId)){
      console.log("API info out of date. Updating...")
      const success = await updateInfo();
      if(!success) throw new Error("Failed to update API info.")
      return false;
    };
  };
  return true
}

setInterval(pollApi, POLL_INTERVAL);
pollApi();