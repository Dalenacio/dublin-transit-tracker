import fs, { linkSync } from 'fs';
import path from 'path';
import { updateInfo } from './updater.js';
import { getCache } from './cache.js';

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
    constructor(stop_json){
        const stopsFilePath = path.join(process.cwd(), 'public', 'apiDocumentation', 'stops.txt');
        const stopTimeFilePath = path.join(process.cwd(), 'public', 'apiDocumentation', 'stop_times.txt');
        this.stop_id = stop_json.stop_id;
        this.name = "Placeholder";
        this.status = stop_json.schedule_relationship;
        this.delay = stop_json.arrival?.delay
    }
}
    
export async function structureData() {
    try {
      const [routeDict, vehicleDict] = await Promise.all([
        loadRouteData(),
        loadVehicleData()
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

function loadVehicleData(){
    let cache = getCache();
    let returnDir = {};
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
            vehicle.next_stops.push(new Stop(stop_json))
        }
        

        // for (const stop of stopUpdates){
            //Later we will determine lateness per stop as well as all upcoming stops. But for now we're focusing on the next stop only.
        // };

        returnDir[vehicleData.id] = vehicle;
    }


    return returnDir
}

function loadRouteData(){
    const routesFilePath = path.join(process.cwd(), 'public', 'apiDocumentation', 'routes.txt');
    const routesFileContent = fs.readFileSync(routesFilePath, 'utf-8');
    const routeList = routesFileContent.split('\n').filter(line => line.trim())
    routeList.shift() //the first line of all the .txt reference files is an explanation of the format. We need to discard this.
    //Actually I've since learned what a CSV format is... I'll find a library to implement this more cleanly later.

    let returnDir = {};

    for (const route of routeList) {
        const normalizedRoute = normalizeRouteData(route);
        returnDir[normalizedRoute.route_id] = normalizedRoute;
    };

    return returnDir
};

function normalizeRouteData(line){
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

    return new Route(parts[0] || '', parts[1] || '', parts[2] || '', parts[3]?.replace(/^"|"$/g, '') || '', parts[5] || '');
};

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