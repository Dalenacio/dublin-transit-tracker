import fs from 'fs';
import path from 'path';
import { getCache } from './cache.js';
import {parse} from "csv-parse";

class Route {
    constructor(route_id, agency, short_name, long_name, type) {
        this.route_id = route_id;
        this.agency = agency;
        this.short_name = short_name;
        this.long_name = long_name;
        this.type = type;
        this.vehicle_ids = [];
        this.average_delay = 0;
        this.delay_status = "";
    }

    addVehicle(vehicle_id) {
        if (!this.vehicle_ids.includes(vehicle_id)) {
        this.vehicle_ids.push(vehicle_id);
        }
    }
}

class Vehicle {
    constructor(vehicle_id, trip_id, start_time, status, route_id, direction_id) {
        this.vehicle_id = vehicle_id;
        this.trip_id = trip_id;
        this.start_time = start_time;
        this.status = status;
        this.route_id = route_id;
        this.direction_id = direction_id;
        this.next_stops = [];
    }
}

class Stop {
    constructor(stop_json, name){
        this.stop_id = stop_json.stop_id;
        this.name = name;
        this.status = stop_json.schedule_relationship;
        this.delay = stop_json.arrival?.delay
    }
}
    
export async function structureData() {
    try {
      const [routeDict, vehicleDict, stopDict, stopTimeDict] = await Promise.all([
        loadRouteData(),
        loadVehicleData(),
        null,
        null
      ]);
      
      linkVehicles(routeDict, vehicleDict);
      
      return {
        routes: routeDict,
        vehicles: vehicleDict
      };
    } catch (error) {
      console.error('Structure error:', error);
      throw new Error('Failed to structure data');
    }
  }

async function loadVehicleData(){
    let cache = getCache();
    let returnDir = {};
    const stopNames = await loadStopData()
    

    for (const vehicleData of cache.data){
        const trip = vehicleData.trip_update.trip;
        const startTime = parseTripDate(trip.start_date, trip.start_time);
        let vehicle = new Vehicle(
            vehicleData.id,
            trip.trip_id,
            startTime,
            trip.schedule_relationship,
            trip.route_id,
            trip.direction_id
        )

        const nextStops = vehicleData.trip_update?.stop_time_update;
        for (const stopKey in nextStops){
            const stop_json = nextStops[stopKey]
            const stop_name = stopNames[stop_json.stop_id]
            // const stop_name = stop_json.stop_id
            vehicle.next_stops.push(new Stop(stop_json, stop_name))
        }

        

        // for (const stop of stopUpdates){
            //Later we will determine lateness per stop as well as all upcoming stops. But for now we're focusing on the next stop only.
        // };

        returnDir[vehicleData.id] = vehicle;
    }


    return returnDir
}

async function loadStopData() {
    const stopCSV = await loadCSV("stops.txt");
    const stopNameDict = {}

    if (stopCSV) {
        for (const entry of stopCSV) {
            stopNameDict[entry.stop_id] = entry.stop_name;
        }
    }

    return stopNameDict;
}

async function loadRouteData() {
    const routeCSV = await loadCSV("routes.txt");
    const routeDict = {};
    if (routeCSV) {
        for (const entry of routeCSV) {
            const route = new Route(entry.route_id, entry.agency, entry.route_short_name, entry.route_long_name, entry.route_type);
            routeDict[route.route_id] = route;
        }
    }
    return routeDict;
}

async function loadCSV(fileName) {
    const filePath = path.join(process.cwd(), 'public', 'apiDocumentation', fileName);
    const fileContentPromise = new Promise((resolve, reject) => {
        fs.readFile(filePath, {encoding: "utf-8"}, (err, data) => {
            if (err) {
                console.error(`Error reading file ${fileName}: ${err}`)
                reject(err);
                return
            }
            resolve(data);
        });
    })

    
    try {
        const data = await fileContentPromise;
        return new Promise((resolve, reject) => {
            const records = [];

            const parser = parse(data, {
                bom: true,
                columns: true,
                skip_empty_lines: true
            });

            parser.on('readable', function () {
                let record;
                while ((record = parser.read()) !== null) {
                    records.push(record);
                }
            });

            parser.on('error', function (err) {
                reject(err);
            });

            parser.on('end', function () {
                resolve(records);
            });
        });

    } catch (parseError) {
        console.error(`Error parsing file ${fileName}: ${parseError}`);
        return null;
    }
}

function linkVehicles(routes, vehicles){
    const cache = getCache()
    for (const cacheVehicle of cache.data){
        const vehicleId = cacheVehicle.id
        const vehicle = vehicles[vehicleId]
        const routeId = vehicle.route_id
        routes[routeId].addVehicle(vehicle.vehicle_id)
    }
};

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