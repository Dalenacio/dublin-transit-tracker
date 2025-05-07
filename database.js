/*
TO DO:
* Re-implement automated updates.
* Work on the data request methods.
* Implement per-vehicle trip update data. How?
* Simplify: we can have one single function to do the insertion process for everything instead of a discrete function for each.
* Only update files if strictly necessary: compare file hashes, then update line by line?
* maintain atomicity with the streaming method: send data to temporary table, then make that the main table in one single transaction.
*/


import sqlite3 from "sqlite3"
import { readFile } from 'node:fs/promises';
import path from 'path';
import {parse} from "csv-parse";
import "./poller.js";
import { pollApi } from "./poller.js";
import { createReadStream } from 'node:fs';

const db = new sqlite3.Database("database.db")


export async function initDatabase(){
    const sqlRoutes = `
        route_id TEXT PRIMARY KEY, 
        agency INTEGER NOT NULL, 
        short_name TEXT NOT NULL, 
        long_name TEXT NOT NULL, 
        type INT NOT NULL
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

    await execute(db, "CREATE TABLE IF NOT EXISTS " + "routes ("+ sqlRoutes + ")")
    await execute(db, "CREATE TABLE IF NOT EXISTS " + "vehicles ("+ sqlVehicles + ")")
    await execute(db, "CREATE TABLE IF NOT EXISTS " + "stops ("+ sqlStops + ")")
    await execute(db, "CREATE TABLE IF NOT EXISTS " + "trips ("+ sqlTrips + ")")
    await execute(db, "CREATE TABLE IF NOT EXISTS " + "stop_times ("+ sqlStopTimes + ")")

    await execute(db, `DELETE FROM routes;`)
    await execute(db, `DELETE FROM trips;`)
    await execute(db, `DELETE FROM vehicles;`)
    await execute(db, `DELETE FROM stops;`)
    await execute(db, `DELETE FROM stop_times;`)
    await loadRouteData().then(() => {console.log("Loaded Route Data!")});
    await loadTripData().then(() => {console.log("Loaded Trip Data!")});
    await loadVehicleData().then(() => {console.log("Loaded Vehicle Data!")});
    await loadStopData().then(() => {console.log("Loaded Stop Data!")});
    await loadStopTimeData().then(() => {console.log("Loaded Stop Time Data!")});
    await getGeneralData().then((outcome) => {console.log(outcome)});
}

export async function getGeneralData(){
    const routesData = await getAll(`SELECT * FROM vehicles`);
    return routesData;
};

export async function getRouteData(route_id){
    const routeData = await getAll(`SELECT * FROM routes WHERE route_id = ${route_id};`);
    const vehicleList = await getAll(`SELECT * FROM vehicles WHERE route_id = ${route_id};`);
    const returnData = {routeData: routeData, vehicleList: vehicleList};
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

async function loadRouteData() {
    console.log("Loading routes...")
    let stmt
    let transactionBegun = false;
    try{
        const routeCSV = await loadCSV("routes.txt");
        if(!routeCSV){throw new Error("Failed to load CSV.")}

        stmt = db.prepare(`INSERT INTO routes VALUES(?, ?, ?, ?, ?)`)
        await execute(db, "BEGIN TRANSACTION")
        transactionBegun = true;

        for (const entry of routeCSV) {
            const route_id = entry.route_id
            const agency_id = entry.agency_id
            const route_short_name = entry.route_short_name
            const route_long_name = entry.route_long_name
            const route_type = entry.route_type
            
            await stmtRun(stmt, [route_id, agency_id, route_short_name, route_long_name, route_type])
        }

        await execute(db, `COMMIT`)

    }catch(error){
        if(transactionBegun){await execute(db, "ROLLBACK")}
        console.log(error)
    } finally {
        if (stmt) {stmt.finalize()}
    }
};

async function loadTripData() {
    console.log("Loading trips...")
    let stmt
    let transactionBegun = false;
    try{
        const tripCSV = await loadCSV("trips.txt");
        if (!tripCSV){throw new Error("Failed to load CSV.")}

        const start_time = new Date()
        stmt = db.prepare(`INSERT INTO trips VALUES(?, ?, ?, ?, ?)`)
        await execute(db, "BEGIN TRANSACTION")
        transactionBegun = true;

        for (const entry of tripCSV){
            const trip_id = entry.trip_id;
            const route_id = entry.route_id;
            const service_id = entry.service_id;
            const trip_headsign = entry.trip_headsign;
            const direction_id = entry.direction_id;

            await stmtRun(stmt, [trip_id, route_id, service_id, trip_headsign, direction_id])
        }

        await execute(db, "COMMIT")
        console.log("Total time: ", (new Date() - start_time) / 1000, " seconds!")
    }catch(error){
        if(transactionBegun){await execute(db, "ROLLBACK")}
        console.log(error)
    } finally {
        if (stmt) {stmt.finalize()}
    }
};

async function loadVehicleData(){
    console.log("Loading vehicles...")
    let stmt
    let transactionBegun = false;
    try{
        const apiData = await pollApi()
        if (!apiData) {throw new Error("Failed to load API data.")}

        stmt = db.prepare(`INSERT INTO vehicles VALUES (?, ?, ?, ?, ?, ?)`)
        await execute(db, "BEGIN TRANSACTION")
        transactionBegun = true;
        // const stopNames = await loadStopData();
        // const trips = await loadTripData();

        for (const vehicleKey in apiData){
            const vehicleData = apiData[vehicleKey]
            const trip = vehicleData.trip_update.trip;
            
            const vehicle_id = vehicleData.id;
            const trip_id = trip.trip_id;
            const startTime = parseTripDate(trip.start_date, trip.start_time);
            const status = trip.schedule_relationship;
            const route_id = trip.route_id;
            const direction_id = trip.direction_id;

            if(!trip_id){console.log("vehicleData: ", vehicleData)}
            await stmtRun(stmt, [vehicle_id, trip_id, startTime, status, route_id, direction_id])

            // const nextStops = vehicleData.trip_update?.stop_time_update;
            // for (const stopKey in nextStops){
            //     const stop_json = nextStops[stopKey]
            //     const stop_name = stopNames[stop_json.stop_id]
            //     // const stop_name = stop_json.stop_id
            //     vehicle.next_stops.push(new Stop(stop_json, stop_name))
            // }


            // for (const stop of stopUpdates){
                //Later we will determine lateness per stop as well as all upcoming stops. But for now we're focusing on the next stop only.
            // };

        }
        await execute(db, "COMMIT")
    }catch(error){
        if(transactionBegun){await execute(db, "ROLLBACK")}
        console.log("Error while loading vehicle data: ", error)}
};

async function loadStopData() {
    console.log("Loading stops...")
    let stmt
    let transactionBegun = false;
    try{
        const stopsCSV = await loadCSV("stops.txt");
        if (!stopsCSV) {throw new Error("Failed to load CSV.")};

        stmt = db.prepare(`INSERT INTO stops VALUES(?, ?)`)
        await execute(db, `BEGIN TRANSACTION`)

        for (const entry of stopsCSV) {
            const stop_id = entry.stop_id
            const stop_name = entry.stop_name

            await stmtRun(stmt, [stop_id, stop_name])
        }

        await execute(db, `COMMIT`)
    } catch(error){
        await execute(db, `ROLLBACK`)
        console.log(error)
    } finally {
        if (stmt) {stmt.finalize()}
    }
};

async function loadStopTimeData() {
    console.log("Loading stop times...");
    const batchCap = 1000;
    let stmt;
    let transactionBegun = false;
    const fileName = "stop_times.txt";

    try {
        const startTime = new Date();
        stmt = db.prepare(`INSERT INTO stop_times VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        
        let batch = [];
        console.log("Beginning insertion by streaming records. This may take some time...");

        await execute(db, "BEGIN TRANSACTION");
        transactionBegun = true;

        for await (const entry of streamCSV(fileName)) {
            const params = [
                entry.trip_id,
                entry.arrival_time,
                entry.departure_time,
                entry.stop_id,
                entry.stop_sequence,
                entry.stop_headsign,
                entry.pickup_type,
                entry.drop_off_type,
                entry.timepoint
            ];
            batch.push(params);

            if (batch.length >= batchCap) {
                for (const recordParams of batch) {
                    await stmtRun(stmt, recordParams);
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
        
        console.log("Total time for stop times: ", (new Date() - startTime) / 1000, " seconds!");

    } catch (error) {
        console.error(`Error loading stop time data from ${fileName}:`, error);
        if (transactionBegun) {
            try {
                await execute(db, "ROLLBACK");
                console.log("Transaction rolled back due to error.");
            } catch (rollbackError) {
                console.error("Error rolling back transaction:", rollbackError);
            }
        }
    } finally {
        if (stmt) {
            stmt.finalize((finalizeErr) => {
                if (finalizeErr) console.error("Error finalizing statement for stop_times:", finalizeErr);
            });
        }
    }
}


async function loadCSV(fileName) {
    try {
        const filePath = path.join(process.cwd(), 'public', 'apiDocumentation', fileName);
        console.log(`Preparing to read ${filePath}`);
        const data = await readFile(filePath, 'utf8');
        console.log(`Successfully read ${filePath}`);

        const records = await new Promise((resolve, reject) => {
            parse(data, {
                bom: true,
                columns: true,
                skip_empty_lines: true
            }, (err, records) => {
                if (err) reject(err);
                else resolve(records);
            });
        });

        return records;
    } catch (error) {
        console.error(`Error parsing file ${fileName}: ${error}`);
        return null;
    }
}

async function* streamCSV(fileName) {
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
}

function parseTripDate(date, time){
    if(!date || !time){return null};
    try {
        const timeString = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T${time}`;
        return new Date(timeString);
      } catch (e) {
        console.error(`Invalid date: ${date} ${time}`);
        return null;
    }
};