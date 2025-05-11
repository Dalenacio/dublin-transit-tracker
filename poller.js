import { getIsUpdating, updateInfo } from './updater.js';

import axios from 'axios';
import 'dotenv/config';
import { dosDateTimeToDate } from 'yauzl';
import { checkReference } from './database.js';

const API_URL = "https://api.nationaltransport.ie/gtfsr/v2/TripUpdates?format=json";
const API_KEY = process.env.API_KEY;




export const pollApi = async () => {
  console.log("Polling API...")

  try {

    const response = await axios.get(API_URL, {
      headers: { "x-api-key": API_KEY }
    });
    const data = response.data.entity
    let isUpdating = true
    do {
      isUpdating = getIsUpdating()
    } while (isUpdating);
    
    let isValid = await checkReference(data)
    if(!isValid){
      do {
        await updateInfo()
        isValid = await checkReference(data)
      } while (!isValid);
    }

    return data
  } catch (error) {
    console.error("Polling failed: ", error.message);
  }
};