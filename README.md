# Dublin Transit Tracker

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
<img src="https://www.vectorlogo.zone/logos/nodejs/nodejs-icon.svg" alt="Node.js logo" width="20" height="20">

A real-time dashboard website for Dublin's public transport (buses and rail) using GTFS-R data from Transport for Ireland.

![App Screenshot](/public/images/screenshot.png)

## Features

- **Live vehicle status and delays.**
- **Searchable routes.**

## Tech Stack

- **Backend**: Node.js, Express.js, GTFS-R API.
- **Frontend**: Bootstrap 5, EJS.

## Setup Guide

### Prerequisites
- Node.js
- [TFI API Key](https://developer.nationaltransport.ie/api-details#api=gtfsr&operation=gtfsr-v2) (Or replace with your local GTFS API of choice)

### Note: GTFS-R Reference Info
Dublin GTFS-R Reference data changes very frequently and needs to be regularly re-downloaded to prevent the site from breaking. This reference data takes the form of a ~109MB .zip file containing a series of .txt files. The required directory will automatically be created in the /public folder upon first server launch.

The downloaded can take a few minutes depending on connection speed and will need to be performed upon first server launch, as well as subsequent launches if the server has been dormant for too long. 

### Installation

Clone the project:
```bash
git clone https://github.com/dalenacio/dublin-transit-tracker.git
```
Go to the project directory:
```bash
cd dublin-transit-tracker
```
Install dependencies:
```bash
npm install
```
Create a .env file in the project directory:
```bash
touch .env
```
Add your API key to the .env file:
```env
API_KEY=your_actual_key_here
```
Run locally, or host!
```bash
node index.js
```

## To-Do
* Add discrete directions.
* Show departure times and times per stop.
* Implement top-screen search bar.
* Implement a database for stat-tracking.
* Visually distinguish disabled routes (no vehicles for the day).
* Visually distinguish late, very late, and cancelled vehicles.

## Contributors & Contact
Juan Ignacio Hervada - ignacio.hervada@gmail.com