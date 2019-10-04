const request = require('request-promise');
const log = require('./classes/log');

//get proxy list

module.exports = {
	view: (listing, views) => {
		return new Promise((resolve, reject) => {
			for(let i=0;i<views;i++) {
				request({
					uri: listing,
					method: 'GET',
					resolveWithFullResponse: true
				}).then(res => {
					console.log(res.statusCode);
					if (i === views) {
						resolve(views);
					}
				}).catch(err => {
					log.red(err);
					reject(err);
				});
			}
		})
	}
}