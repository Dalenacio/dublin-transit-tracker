// import { updateCache, getCache } from './cache.js';
import { updateInfo, getIsUpdating } from './updater.js';

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import { dosDateTimeToDate } from 'yauzl';

const API_URL = "https://api.nationaltransport.ie/gtfsr/v2/TripUpdates?format=json";
const API_KEY = process.env.API_KEY;
const POLL_INTERVAL = 60000;




export const pollApi = async () => {


  try {

    const response = await axios.get(API_URL, {
      headers: { "x-api-key": API_KEY }
    });
    
    // updateCache(response.data.entity);
    // loadVehicleData(response.data.entity)

    let isUpdating = true
    do {
      isUpdating = getIsUpdating()
    } while (isUpdating);
    
    let isValid = false
    do {
      isValid = await checkReference(response.data.entity) 
    } while (!isValid);

    return response.data.entity

  } catch (error) {
    console.error("Polling failed: ", error.message);
    console.log("Trying again in 30 seconds.")
    setTimeout(pollApi, 30000); 
  }
};

async function checkReference(data) {
  const routesFilePath = path.join(process.cwd(), 'public', 'apiDocumentation', 'routes.txt');
  if (!fs.existsSync(routesFilePath)) {await updateInfo();}
  
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

// TODO: Reimplement interval polling in database.js
// setInterval(pollApi, POLL_INTERVAL);
// pollApi();