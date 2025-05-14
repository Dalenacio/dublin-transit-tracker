import express from "express";
import { initDatabase, getGeneralData, getRouteData } from "./database.js";

const port = 3000;
const app = express();
let isReady = false;

app.use(express.static("public"))

app.get('/health', (req, res) => {
  if (isReady) {
    res.status(200).json({ 
      ready: true,
      message: "OK" 
    });
  } else {
    res.status(503).json({ 
      ready: false,
      message: "Server is initializing, database setup in progress. Please wait." 
    });
  }
});

async function initializeData() {
  console.log("Database initialization process started...");
  try {
    await initDatabase();
    isReady = true;
    console.log("Database initialization complete. Server is now fully ready.");
  } catch (error) {
    console.error("Error during database initialization:", error);
  }
}

async function startServer() {
  try {
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
      initializeData()
    });
  } catch (error) {
    console.error("Failed to initialize:", error);
    process.exit(1);
  }
}

app.get("/", async (req, res) => {
  if (!isReady) {
    res.status(503).render("loading.ejs");
    return;
  }
    const data = await getGeneralData()
    res.render("index.ejs", {data: data})
})

app.get("/route/:routeId", async (req, res) => {
    if (!isReady) {
      res.status(503).render("loading", { title: "Initializing - Please Wait" });
      return;
    }
    const chosenRoute = req.params.routeId;
    res.render("routeInfo.ejs", {routeId : chosenRoute, data: data})
});

app.get("/cache", async (req, res) => {
  const data = getCache()
  res.json(data)
});


startServer();