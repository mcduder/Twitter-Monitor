'use strict';
/* jshint node: true */

const fs = require('fs');
const request = require('request');
const Datastore = require('nedb');
const async = require('async');
const CronJob = require('cron').CronJob;

const { webhook, monitorDelay, initialNotificationDelay } = require('./config.json');
const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 10_3 like Mac OS X) AppleWebKit/602.1.50 (KHTML, like Gecko) CriOS/56.0.2924.75 Mobile/14E5239e Safari/602.1';
const base_url = 'http://www.supremenewyork.com';
const db = new Datastore();

const headers = {
	'user-agent': userAgent
};

const proxies = fs.readFileSync("./proxies.txt", "utf8").split("\n");

let r = request.defaults({ headers: headers });
let proxied;
let proxied2;

let monitorInterval;
let newProductsInterval;
const thurs = new CronJob('00 59 07 * * *', () => {
	console.log('clearing');
	clearInterval(monitorInterval);
	flow();
}, null, true, 'America/Los_Angeles');
let notifqueue = async.queue((task, callback) => {
	setTimeout(()=> {
		discordNotif(task.data);
		callback();
	}, initialNotificationDelay);
});

startup();
function startup(){
	console.log("starting up/getting product data");
	async.waterfall([
		getProducts,
		processItems,
	], (err) => {
		if(err) {
			console.log(err);
		}
		console.log('monitoring products');
		monitorInterval = setInterval(monitorProducts, monitorDelay);
	});
}

function flow() {
	cleanTable();
	console.log('waiting for items from new week');
	async.waterfall([
		waitForNewProducts,
		processItems,
	], (err) => {
		if(err) {
			console.log(err);
		}
		console.log('monitoring products');
		monitorInterval = setInterval(monitorProducts, monitorDelay);
	});
}

function getProducts(callback) {
	console.log('getting stock');
	r(base_url+'/mobile_stock.json', (err, resp, body) => {
		if (err) {
			callback(err);
		}

		let stockData = JSON.parse(body);
		let categories = stockData.products_and_categories;
		delete categories.new;
		let flattened = [];
		for (var key in categories) flattened = flattened.concat(categories[key]);
		callback(null, flattened);
	});
}

function processItems(itemList, callback) {
	let itemsProcessed = 0;
	itemList.forEach((item, index, array) => {
		let itemData = {
			name: item.name,
			id: item.id,
			category: item.category_name
		};
		db.update({id: item.id}, itemData, { upsert: true }, (err) => {
			if(err) {
				callback(err);
			}
			setTimeout(() => {
				getItem(item.id, item.name, item.category_name, item.price/100, item.new_item);
					itemsProcessed++;
				if(itemsProcessed === array.length) {
					callback(null);
				}
			}, Math.floor(Math.random()*10000));
		});
	});
}

function getItem(pid, name, category, price, isNew) {
	if (proxies.length > 1) {
		let proxy = proxies[Math.floor(Math.random()*proxies.length)];
		proxied = request.defaults({ headers: headers, proxy: makeProxyURL(proxy) });
	} else {
		proxied = request.defaults({ headers: headers });
	}
	proxied(`${base_url}/shop/${pid}.json`, (err, resp, body) => {
		if(err) {
			return console.error(err);
		}
		let styleData = JSON.parse(body);
		let styles = [];

		async.each(styleData.styles, (style, callback) => {
			let newStyle = {
				'name': style.name,
				'img': style.image_url,
				'id': style.id,
				'sizes': style.sizes
			};
			styles.push(newStyle);
			let d = new Date();
			if (category == "Tops/Sweaters") {
				category = "tops_sweaters";
			}
			let notif = [
			{"title": 'New Item!', "description": `${name} - ${newStyle.name}`, 
			"fields": [
				{
					"name": "Sizes", 
					"value": "", 
					"inline": true
				}, 
				{
					"name": "Price", 
					"value": "$" + price, 
					"inline": true
				}, 
				{
					"name": "URL",
					"value":
					`${base_url}/shop/${category}/${pid}/${newStyle.id}`
				}, 
				{
					"name": "QuickTasks", 
					"value": `[Cyber](https://cybersole.io/dashboard/quicktask?url=${base_url}/shop/${category}/${pid}/${newStyle.id}) - [PD](https://api.destroyerbots.io/quicktask?url=${base_url}/shop/${category}/${pid}/${newStyle.id}) - [TKS](https://thekickstationapi.com/quick-task.php?link=${base_url}/shop/${category}/${pid}/${newStyle.id}&autostart=true)`
				}
			], 
			"thumbnail": { "url": `http:${newStyle.img}`},
			"footer": {
				"text": `${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}:${d.getMilliseconds()}`,
 			} }];
			if (isNew === true) {
				makeInit(style.sizes, notif);
			}
			callback();
		}, err => {
			if(err) {
				return console.log(err);
			}
			db.update({ id: pid }, { $set: { "styles": styles } }, {}, (err) => {
				if(err) { return console.error(err);  }
			});
		});
	});
}

function makeInit(sizes, notif) {
	let sizeList = [];
	sizes.forEach(size => {
		sizeList.push(size.name);
	});
	notif[0].fields[0].value = sizeList.join("\n ");
	notifqueue.push({data: notif});
}

function checkStock(item) {
	if (proxies.length > 1) {
		let proxy = proxies[Math.floor(Math.random()*proxies.length)];
		proxied = request.defaults({ headers: headers, proxy: makeProxyURL(proxy) });
	} else {
		proxied = request.defaults({ headers: headers });
	}
	proxied(`${base_url}/shop/${item.id}.json`, (err, resp, body) => {
		if(err) {
			console.error(err);
		}
		let styleData = JSON.parse(body);
		let styles = [];
		
		async.each(styleData.styles, (style, cb) => {
			styles.push({
				'name': style.name,
				'img': style.image_url,
				'id': style.id,
				'sizes': style.sizes
			});
			cb();
		}, err => {
			if(err) {
				return console.log(err);
			}
			compareStock(item.styles, styles, item.id, item.category);
		});
	});
}

function compareStock(oldStock, newStock, pid, category, name) {
	if(JSON.stringify(oldStock) != JSON.stringify(newStock)) {
		for(let cw in newStock) {
			let instock = [];
			for(let size in newStock[cw].sizes) {
				if (newStock[cw].sizes[size].stock_level === 1) {
					instock.push(newStock[cw].sizes[size].name);
				}
			}
			if (oldStock === undefined) {
				return;
			}
			if (JSON.stringify(newStock[cw]) != JSON.stringify(oldStock[cw])) {
				let d = new Date();
				if (category == "Tops/Sweaters") {
					category = "tops_sweaters";
				}
				discordNotif([{"title": 'Restock!', "description": `${name} - ${newStock[cw].name}`, "fields": [{"name": "Sizes", "value": instock.join("\n")}, {"name": "URL", "value": `${base_url}/shop/${category}/${pid}/${newStock[cw].id}`}], "thumbnail": { "url": `http:${newStock[cw].img}` }, "footer": {"text": `${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}:${d.getMilliseconds()}`,} }]);
			}
		}
		db.update({ id: pid}, { $set: {"styles": newStock} }, {}, (err) => {
			if(err) {
				console.error(err);
			}
		});	
	}
}

function waitForNewProducts(callback) {
	let oldWeek;
	let updated = false;
	if (proxies.length > 1) {
		let proxy = proxies[Math.floor(Math.random()*proxies.length)];
		proxied = request.defaults({ headers: headers, proxy: makeProxyURL(proxy) });
	} else {
		proxied = request.defaults({ headers: headers });
	}
	proxied(base_url+'/mobile_stock.json', (err, resp, body) => {
		if (err) {
			callback(err);
		}

		let d = JSON.parse(body);
		oldWeek = d.release_week;
		console.log('current week ' + oldWeek);
		newProductsInterval = setInterval(() => {
			if (proxies.length > 1) {
				let proxy2 = proxies[Math.floor(Math.random()*proxies.length)];
				proxied2 = request.defaults({ headers: headers, proxy: makeProxyURL(proxy) });
			} else {
				proxied2 = request.defaults({ headers: headers });
			}
			// console.log('ran');
			proxied2(base_url+'/mobile_stock.json', (err, resp, body) => {
				if (err) {
					callback(err);
				}

				let nd = JSON.parse(body);
				if (nd.release_week != oldWeek) {
					console.log('new products loaded');
					clearInterval(newProductsInterval);
					let categories = nd.products_and_categories;
					delete categories.new;
					let flattened = [];
					for (var key in categories) flattened = flattened.concat(categories[key]);
					callback(null, flattened);
				} else {
					console.log('same week');
				}
			});
		}, 1000);
	});
}

function monitorProducts() {
	console.log('monitor');
		db.find({}, {}, (err, docs) => {
			if (err) {
				clearInterval(monitorInterval);
			}
			let functions = [];
			docs.forEach(item => {
				functions.push(checkStock.bind(null, item));
			});
			async.parallel(functions, (err) => {
				if (err) {
					console.log(err);
					clearInterval(monitorInterval);
				}
			});
		});
}

function discordNotif(data) {
	request.post({
		url: webhook,
		headers: { 'Content-Type': 'application/json' },
		json: {embeds: data}
	}, (err, resp, body) => {
		if(err) {
			console.log(err);
		}
	});
}

function makeProxyURL(proxy) {
	let pieces = proxy.split(":");
	return 'https://' + pieces[2] + ":" + pieces[3] + "@" + pieces[0] + pieces[1];
}

function cleanTable() {
	db.remove({}, { multi: true }, (err) => {
		if (err) {
			console.log(err);
		}
		db.persistence.compactDatafile();
		return true;
	});
}
