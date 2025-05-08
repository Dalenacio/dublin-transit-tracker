import sqlite3 from "sqlite3"
const db = new sqlite3.Database("database.db")

getData()


export async function getData(){
    const data = await getAll(`SELECT * FROM stop_times WHERE trip_id = '4628_183597' and stop_sequence = 13;`);
    const departure_data = data[0].departure_time
    const now = new Date()
    // const departure_time = new Date(`${now.getDate()}`)
    // console.log(now.getFullYear(), now.getMonth(), now.getDay(), departure_data)
    console.log(departure_data.split(":"))
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