var express = require('express');
var router = express.Router();
var AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
var kinesis = new AWS.Kinesis();
var kinesis_stream = 'stick-locations';
var Firebase = require("firebase");

// middleware specific to this router
router.use(function timeLog(req, res, next) {
  console.log('Time: ', Date.now());
  next();
});
// define the home page route
router.get('/:version/:source_id', function(req, res) {
	var version = req.params.version;
	var source_id = req.params.source_id;
	var data = req.query.data;
	var token = req.query.token;
	//TODO Authenticate token

	//1. Send to Kinesis
	send_to_kinesis(version, source_id, data);
	//2. Update Firebase with the location
	send_to_firebase(version, source_id, data);
  	res.status(200).end();
});

module.exports = router;

//Functions
function send_to_kinesis(version, source_id, data) {
	var parsed_data = parse_data(version, source_id, data);
	var params = {
	  Data: JSON.stringify(parsed_data), 
	  PartitionKey: source_id,
	  StreamName: kinesis_stream, 
	};
	kinesis.putRecord(params, function(err, data) {
	  if (err) console.log(err, err.stack); // an error occurred
	  else     console.log(data);           // successful response
	});
};

//Parse data according to the version
function parse_data(version, source_id, data) {
	console.log('Raw data: ' + data + ', version: ' + version);
	var parsed_data;
	if(version === 'd1') {
		data = data.substring(0, data.length - 1);
		var events = data.split('$');
		parsed_data = [];
		for(var i in events) {
			var fields = events[i].split(',');
			var ts_input = fields[4];
			var match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2}).(\d{3})$/.exec(ts_input);
			var ts = match[1] + '-' + match[2] + '-' + match[3] + ' ' + match[4] + ':' + match[5] + ':' + match[6] + '.' + match[7];
			var ttff = parseInt(fields[5]);
			var latlong = convert_location(parseFloat(fields[1]),parseFloat(fields[2]));
			if (ttff > 0) {
				var location_event = {
					source_id: source_id,
					lat: latlong[0],
					long: latlong[1],
					time: Date.parse(ts),
					speed: parseFloat(fields[7])
				};
				parsed_data.push(location_event);
			}
		}
		console.log('Parsed Data: ' + JSON.stringify(parsed_data));
	} else
		console.log('Source version not recognized');
	return parsed_data;
};

//Utility used by parse_data
function convert_location(latitude, longitude){
	// convert latitude from minutes to decimal
	degrees = Math.floor(latitude / 100);
	minutes = latitude - (100 * degrees);
	minutes /= 60;
	degrees += minutes;
	//turn direction into + or -
	// if (latdir[0] == 'S') degrees *= -1;
	lat = degrees;
	//convert longitude from minutes to decimal
	degrees = Math.floor(longitude / 100);
	minutes = longitude - (100 * degrees);
	minutes /= 60;
	degrees += minutes;
	//turn direction into + or -
	//if (longdir[0] == 'W') degrees *= -1;
	lon = degrees;
	return [lat, lon];
};

function send_to_firebase(version, source_id, data) {
	//TODO
};