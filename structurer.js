import fs from 'fs';
import path from 'path';
import { updateInfo } from './updater.js';


    
export async function structureData(){
    const routesFilePath = path.join(process.cwd(), 'public', 'apiDocumentation', 'routes.txt');
    const routesFileContent = fs.readFileSync(routesFilePath, 'utf-8');
    let structuredOutcome = routesFileContent.split('\n').filter(line => line.trim())
    structuredOutcome = structuredOutcome.map(structureReference);
    return structuredOutcome
};

function structureReference(line){
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
};