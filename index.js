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
    const data = await structureData()
    res.render("index.ejs", {data: data})
})

app.get("/route/:routeId", async (req, res) => {
    const data = await structureData()
    const chosenRoute = req.params.routeId;
    res.render("routeInfo.ejs", {routeId : chosenRoute, data: data})
});

app.get("/cache", async (req, res) => {
  const data = getCache()
  res.json(data)
});


startServer();