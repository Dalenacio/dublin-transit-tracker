import express from "express";
import './poller.js';
import { initDatabase, getGeneralData, getRouteData } from "./database.js";

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
    await initDatabase();


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
    const data = await getGeneralData()
    res.render("index.ejs", {data: data})
})

app.get("/route/:routeId", async (req, res) => {
    const chosenRoute = req.params.routeId;
    const data = await getRouteData(chosenRoute)
    res.render("routeInfo.ejs", data)
});


startServer();