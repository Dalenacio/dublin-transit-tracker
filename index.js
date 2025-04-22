import express from "express";
import fs from 'fs';
import path from 'path';
import { getCache } from './cache.js';
import { updateInfo } from './updater.js';
import './poller.js';

const port = 3000;
const app = express();

app.use(express.static("public"))

const routesFilePath = path.join(process.cwd(), 'public', 'apiDocumentation', 'routes.txt');
if (!fs.existsSync(routesFilePath)) {
  await updateInfo();
}
const routesFileContent = fs.readFileSync(routesFilePath, 'utf-8');
const routesData = routesFileContent
  .split('\n')
  .filter(line => line.trim())
  .map(line => {
    const parts = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        parts.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    parts.push(current.trim());

  
    return {
      route_id: parts[0] || '',
      agency_id: parts[1] || '',
      route_short_name: parts[2] || '',
      route_long_name: parts[3]?.replace(/^"|"$/g, '') || '',
      route_type: parts[5] || '' // We skip route_desc (parts[4]) because Dublin's GTFS does not use it.
    };
  });


app.get("/", async (req, res) =>{
    res.render("index.ejs", {routesData: routesData})
})


app.get("/route/:routeId", async (req, res) => {
    const chosenRoute = req.params.routeId;

    try {
        const response =  getCache().data

        const routeArray = response.filter((bus) => {
            return bus.trip_update?.trip?.route_id === chosenRoute;
        });

        const routeInfo = routesData.find(route => route.route_id === chosenRoute);
        const displayName = `${routeInfo.route_short_name}: ${routeInfo.route_long_name}`;


        res.render("routeInfo.ejs", {routeId : displayName, busArray : routeArray})
        
    } catch (error) {
        console.error("Error:", error);
        res.status(500).send("Error fetching data");
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}.`);
});