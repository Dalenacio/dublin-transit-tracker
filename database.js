/*
TO DO:
    * DONE: Re-implement automated updates.
    * DONE: Work on the data request methods. 
    * DONE: Implement per-vehicle trip update data. How?
    * DONE: Simplify: we can have one single function to do the insertion process for everything instead of a discrete function for each.
* in progress... Only update files if strictly necessary: compare file hashes, then update line by line?
* maintain atomicity with the streaming method: send data to temporary table, then make that the main table in one single transaction.
*/


import sqlite3 from "sqlite3";
import path from 'path';
import {parse} from "csv-parse";
import { pollApi } from "./poller.js";
import { createReadStream } from 'node:fs';
import TextFileDiff from 'text-file-diff';
import shelljs from "shelljs";
import { updateInfo } from "./updater.js";
import { DateTime } from "luxon";

const db = new sqlite3.Database("database.db")
const POLL_INTERVAL = 60000
const AREA_TIMEZONE = 'Europe/Dublin';

export async function initDatabase(){
    try {

        const sqlRoutes = `
            route_id TEXT PRIMARY KEY, 
            agency_id INTEGER NOT NULL, 
            route_short_name TEXT NOT NULL, 
            route_long_name TEXT NOT NULL, 
            route_type INT NOT NULL
        `

        const sqlStops = `
            stop_id TEXT PRIMARY KEY, 
            stop_name TEXT NOT NULL
        `

        const sqlTrips = `
            trip_id TEXT PRIMARY KEY, 
            route_id TEXT NOT NULL, 
            service_id INT NOT NULL, 
            trip_headsign TEXT NOT NULL, 
            direction_id INT NOT NULL, 
            FOREIGN KEY (route_id) REFERENCES routes(route_id)
        `

        const sqlStopTimes = `
            trip_id TEXT NOT NULL, 
            arrival_time TEXT NOT NULL, 
            departure_time TEXT NOT NULL, 
            stop_id TEXT NOT NULL, 
            stop_sequence INTEGER NOT NULL, 
            stop_headsign TEXT, 
            pickup_type INTEGER NOT NULL, 
            drop_off_type INTEGER NOT NULL, 
            timepoint INTEGER NOT NULL, 
            PRIMARY KEY(trip_id, stop_sequence), 
            FOREIGN KEY (trip_id) REFERENCES trips(trip_id), 
            FOREIGN KEY (stop_id) REFERENCES stops(stop_id)
        `

        //We have to explicitly allow trip_id to be null because SOMETIMES there'll be a random vehicle without a set trip_id.
        //This appears to only happen for buses added outside of schedule? And very rarely and inconsistently?
        //Either way, better safe than sorry, and a good thing to be aware of.
        const sqlVehicles = `
            vehicle_id TEXT PRIMARY KEY, 
            trip_id TEXT NULL,
            start_time TEXT NOT NULL, 
            status TEXT NOT NULL, 
            route_id TEXT NOT NULL, 
            direction_id INTEGER NOT NULL, 
            FOREIGN KEY (trip_id) REFERENCES trips(trip_id), 
            FOREIGN KEY (route_id) REFERENCES routes(route_id)
        `

        const sqlVehicleTimes = `
            vehicle_id TEXT NOT NULL,
            stop_sequence INTEGER NOT NULL,
            stop_id TEXT NOT NULL,
            stop_name TEXT,
            route_id TEXT NOT NULL,
            trip_id TEXT NULL,
            schedule_relationship TEXT,
            arrival_delay INTEGER,
            arrival_time INTEGER,
            departure_delay INTEGER,
            departure_time INTEGER,
            PRIMARY KEY(vehicle_id, stop_sequence),
            FOREIGN KEY(vehicle_id) references vehicles(vehicle_id),
            FOREIGN KEY(stop_id) references stops(stop_id),
            FOREIGN KEY(route_id) references routes(route_id),
            FOREIGN KEY(trip_id) references trips(trip_id)
        `
        
        await updateInfo();

        await execute(db, "CREATE TABLE IF NOT EXISTS " + "routes ("+ sqlRoutes + ")")
        await execute(db, "CREATE TABLE IF NOT EXISTS " + "stops ("+ sqlStops + ")")
        await execute(db, "CREATE TABLE IF NOT EXISTS " + "trips ("+ sqlTrips + ")")
        await execute(db, "CREATE TABLE IF NOT EXISTS " + "stop_times ("+ sqlStopTimes + ")")
        await execute(db, "CREATE TABLE IF NOT EXISTS " + "vehicles ("+ sqlVehicles + ")")
        await execute(db, "CREATE TABLE IF NOT EXISTS " +  "vehicle_times ("+ sqlVehicleTimes +")")

        await execute(db, `DELETE FROM routes;`)
        await execute(db, `DELETE FROM stops;`)
        await execute(db, `DELETE FROM trips;`)
        await execute(db, `DELETE FROM stop_times;`)
        await execute(db, `DELETE FROM vehicles;`)
        await execute(db, `DELETE FROM vehicle_times;`)

        await loadGeneric("routes.txt", "routes").then(() => {console.log("Loaded Route Data!")});
        await loadGeneric("stops.txt", "stops").then(() => {console.log("Loaded Stop Data!")});
        await loadGeneric("trips.txt", "trips").then(() => {console.log("Loaded Trip Data!")});
        await loadGeneric("stop_times.txt", "stop_times").then(() => {console.log("Loaded Stop Time Data!")});
        await loadVehicleData().then(() => {console.log("Loaded Vehicle Data!")});

        setInterval(loadVehicleData, POLL_INTERVAL);
    } catch(error){
        console.error("Error initializing database: ", error)
    }
}

export async function getGeneralData(){
    const routesData = await getAll(`SELECT * FROM routes`);
    return routesData;
};

//filtered to only stops that haven't happened yet.
export async function getRouteData(route_id){
    const fullData = await getFullRouteData(route_id)
    const now = DateTime.now().setZone(AREA_TIMEZONE).toMillis()
    console.log("now: ", now)
    for (const vehicleKey in fullData.vehicleTimeList){
        fullData.vehicleTimeList[vehicleKey] = fullData.vehicleTimeList[vehicleKey].filter((stop) => {
            console.log("")
            console.log("arrival: ")
            console.log(new Date(stop.arrival_time))
            return stop.arrival_time > now
        })
    }
    return fullData
};

export async function getFullRouteData(route_id){
    const routeData = await getAll(`SELECT * FROM routes WHERE route_id = '${route_id}';`);
    const vehicleList = await getAll(`SELECT * FROM vehicles WHERE route_id = '${route_id}';`);
    const vehicleTimeList = []
    for (const vehicle of vehicleList){
        const vehicleTimes = await getAll(`SELECT * FROM vehicle_times WHERE vehicle_id = '${vehicle.vehicle_id}'`)
        vehicleTimeList[vehicle.vehicle_id] = vehicleTimes
    }
    const returnData = {routeData: routeData, vehicleList: vehicleList, vehicleTimeList: vehicleTimeList};
    return returnData;
};

async function getAll(sql, params = []){
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(rows);
        });
    });
};

async function doGet(sql, params= []){
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) {
                reject(err);
                return
            }
            resolve(row)
        })
    });
}

async function stmtRun(stmt, params = []) {
    if (params.length > 0){
        return new Promise((resolve, reject) => {
            stmt.run(params, (err) => {if (err) {reject(err)} else {resolve()}});
        });
    } else {
        return new Promise((resolve, reject) => {
            stmt.run((err) => {if (err) {reject(err)} else {resolve()}});
        })
    };
};

export async function stmtGet(stmt, params = []){
    if (params.length > 0){
        return new Promise((resolve, reject) => {
            stmt.get(params, (err, row) => {if (err) {reject(err)} else {resolve(row)}})
        })
    } else {
        return new Promise((resolve, reject) => {
            stmt.get((err, row) => {if (err) {reject(err)} else {resolve(row)}})
        })
    }
}

export async function execute(db, sql, params = []){
    if (params.length > 0){
        return new Promise((resolve, reject) => {
            db.run(sql, params, (err) => {
                if(err) reject(err);
                resolve();
            });
        });
    };

    return new Promise((resolve, reject) => {
        db.exec(sql, (err) => {
            if (err) reject(err);
            resolve();
        });
    });
};

async function loadGeneric(fileName, tableName){
    const batchCap = 1000;
    let stmt;
    let transactionBegun = false;
    try {
        const colString = await doGet(`select group_concat(name, '|') from pragma_table_info('${tableName}')`)
        const paramNames = colString[`group_concat(name, '|')`].split("|")
        const startTime = new Date();
        stmt = db.prepare(`INSERT INTO ${tableName} VALUES(${"?, ".repeat(paramNames.length).slice(0, -2)})`);
        let batch = [];
        await execute(db, "BEGIN TRANSACTION");
        transactionBegun = true;
        console.log()

        for await (const entry of streamCSV(fileName)){
            const params = []
            for (const name of paramNames){
                params.push(entry[name])
            }
            batch.push(params)

            if (batch.length >= batchCap){
                for (const recordParams of batch){
                    await stmtRun(stmt, recordParams)
                }
                await execute(db, "COMMIT");
                transactionBegun = false; 
                batch = [];

                await execute(db, "BEGIN TRANSACTION");
                transactionBegun = true;
            }
        }

        if (batch.length > 0) {
            
            for (const recordParams of batch) {
                await stmtRun(stmt, recordParams);
            }
        }

        if (transactionBegun) {
            await execute(db, "COMMIT");
            transactionBegun = false;
        }

        console.log(`Populated ${tableName} in ${(new Date() - startTime) / 1000} seconds!`);
        
    } catch (error) {
        console.log(`Error streaming ${fileName}: ${error}`)
    } finally {
        if (stmt) {stmt.finalize}
    }
}

async function loadVehicleData(){
    console.log("Loading vehicles...")
    
    let stmt
    let stopNameStmt
    let vehicleTimeStmt
    let stopTimeRequest
    let transactionBegun = false;
    try{
        const apiData = await pollApi()
        if (!apiData) {throw new Error("Failed to load API data.")}
        await execute(db, `DELETE FROM vehicles;`)
        await execute(db, `DELETE FROM vehicle_times;`)

        stmt = db.prepare(`INSERT INTO vehicles VALUES (?, ?, ?, ?, ?, ?)`)
        stopNameStmt = db.prepare(`SELECT stop_name FROM stops WHERE stop_id = ?`)
        stopTimeRequest = db.prepare(`SELECT * from stop_times WHERE trip_id = ? AND stop_sequence = ?`)
        vehicleTimeStmt = db.prepare(`INSERT INTO vehicle_times VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)

        await execute(db, "BEGIN TRANSACTION")
        transactionBegun = true;

        for (const vehicleKey in apiData){
            const vehicleData = apiData[vehicleKey]
            const trip = vehicleData.trip_update.trip;
            
            const vehicle_id = vehicleData.id;
            const trip_id = trip.trip_id;
            const startTime = parseTripDate(trip.start_date, trip.start_time);
            const status = trip.schedule_relationship;
            const route_id = trip.route_id;
            const direction_id = trip.direction_id;

            await stmtRun(stmt, [vehicle_id, trip_id, startTime, status, route_id, direction_id])

            const nextStops = vehicleData.trip_update?.stop_time_update;
            for (const stopKey in nextStops){
                let stop_time_data
                const stop = nextStops[stopKey]
                const stop_sequence = stop.stop_sequence
                const stop_id = stop.stop_id
                const stop_name = await stmtGet(stopNameStmt, [stop_id]).then((value) => {return value.stop_name})
                const schedule_relationship = stop.schedule_relationship
                const arrival_delay = stop.arrival?.delay
                let arrival_time = stop.arrival?.time
                const departure_delay = stop.departure?.delay
                let departure_time = stop.departure?.time

                if(!arrival_time && arrival_delay && !departure_time && departure_delay && trip_id){
                    console.log(stop_id)
                    stop_time_data = await stmtGet(stopTimeRequest, [trip_id, stop_sequence])
                    arrival_time = unixTimeWithDelay(stop_time_data.arrival_time, arrival_delay)
                    departure_time = unixTimeWithDelay(stop_time_data.departure_time, departure_delay)
                }

                await stmtRun(vehicleTimeStmt, [vehicle_id, stop_sequence, stop_id, stop_name, route_id, trip_id, schedule_relationship, arrival_delay, arrival_time, departure_delay, departure_time])
            }

        }
        await execute(db, "COMMIT")
    }catch(error){
        if(transactionBegun){await execute(db, "ROLLBACK")}
        console.log("Error while loading vehicle data: ", error)
    }
};

async function* streamCSV(fileName) {
    try{
        const filePath = path.join(process.cwd(), 'public', 'apiDocumentation', fileName);
        console.log(`Preparing to stream records from ${filePath}`);
        const fileStream = createReadStream(filePath, 'utf8');
        
        const parser = fileStream.pipe(parse({
            bom: true,
            columns: true,
            skip_empty_lines: true
        }));

        for await (const record of parser) {
            yield record;
        }
        console.log(`Finished streaming records from ${filePath}`);
    } catch(error){
        console.log("Error streaming CSV: ", error)
    }
}

function unixTimeWithDelay(hourString, delay){
    try{
        const [hour, m, s] = hourString.split(":").map(Number);
        const h = hour % 24;
        const daysToAdd = Math.floor(hour / 24);
        const now = DateTime.now().setZone(AREA_TIMEZONE)
        const dayTime = now.startOf('day').plus({ days: daysToAdd });

        const scheduledTime = dayTime.set({
            hour: h,
            minute: m,
            second: s
        });
        const realTime = scheduledTime.plus({seconds: delay})
        const unixTime = realTime.toMillis();
        return unixTime
    }catch(error){
        console.error(`Invalid time or delay: ${hourString}, ${delay}.`)
    }
};

function parseTripDate(dateString, timeString){
    try {
        if(!dateString || !timeString){throw new Error ("Date or time empty.")};

        const year = parseInt(dateString.slice(0, 4));
        const month = parseInt(dateString.slice(4, 6));
        const day = parseInt(dateString.slice(6, 8));

        const [hour, m, s] = timeString.split(":").map(Number);
        const h = hour % 24;
        const daysToAdd = Math.floor(hour / 24);

        const nowDay = DateTime.now().setZone(AREA_TIMEZONE).startOf("day")
        const dayTime = DateTime.fromObject({
            year: year,
            month: month,
            day: day,
            hour: h,
            minute : m,
            second : s
        }, {zone : AREA_TIMEZONE}).plus({day: daysToAdd})

        if (!dayTime.isValid){console.log("DayTime invalid. DayTime: ", dayTime)}

        return dayTime.toMillis()
    } catch (error) {
        console.error(`Invalid date: ${dateString} ${timeString}. Reason: `, error);
        return null;
    }
};

export async function checkReference(data) {
    let stmt
    try{
        stmt = db.prepare(`SELECT route_id FROM routes WHERE route_id = ?`)

        for (const vehicle of data) {
            const routeId = vehicle.trip_update.trip.route_id
            const isRouteId = await stmtGet(stmt, routeId)
            if(!isRouteId){
                return false
            }
        };

        return true
    }catch(error){
        console.error(error)
    }finally{
        if(stmt){stmt.finalize()}
    }
}