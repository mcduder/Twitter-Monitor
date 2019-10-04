require('dotenv').config();
const { Worker } = require('worker_threads');
const log = require('./classes/log');

function runService(service, workerData) {
	return new Promise((resolve, reject) => {
		let worker;
		if (service == "twit") {
			worker = new Worker('./TwitMonitor.js', { workerData });
		} else if( service == "discord" ) {
			worker = new Worker('./discordtotwitter.js', { workerData });
		}

		worker.on('message', resolve);
		worker.on('error', reject);
		worker.on('exit', code => {
			if (code !== 0) {
				reject(new Error(`Worker stopped with exit code ${code}`));
			}
		})
	})
}

async function run() {
	runService('twit');
	runService('discord');
}

run().catch(err => {
	log.red(err);
})