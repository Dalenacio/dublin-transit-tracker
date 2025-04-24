import express from "express";
import { structureData } from "./structurer.js";
import { getCache } from './cache.js';
import './poller.js';
import { updateInfo } from "./updater.js";

const port = 3000;
const app = express();
let isReady = false;

app.use(express.static("public"))

app.get('/health', (req, res) => {
  res.status(isReady ? 200 : 503).json({ 
    ready: isReady,
    message: isReady ? "OK" : "Initializing data..." 
  });
});

async function startServer() {
  try {
    await updateInfo();
    isReady = true;
    
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to initialize:", error);
    process.exit(1);
  }
}

app.get("/", async (req, res) =>{
    const routesData = await structureData()
    res.render("index.ejs", {routesData: routesData})
})

app.get("/route/:routeId", async (req, res) => {
    const routesData = await structureData()
    const chosenRoute = req.params.routeId;

    try {
        const cache =  getCache().data

        const busArray = cache.filter((bus) => {
            return bus.trip_update?.trip?.route_id === chosenRoute;
        });

        const routeInfo = routesData.find(route => route.route_id === chosenRoute);
        const displayName = `${routeInfo.route_short_name}: ${routeInfo.route_long_name}`;


        res.render("routeInfo.ejs", {routeId : displayName, busArray : busArray, routesData: routesData})
        
    } catch (error) {
        console.error("Error:", error);
        res.status(500).send("Error fetching data");
    }
});


startServer();