var express = require('express');
var router = express.Router();
var AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
var kinesis = new AWS.Kinesis();
var kinesis_stream = 'stick-locations';
var Firebase = require("firebase");
var firebase_ref = new Firebase("https://logbasedev.firebaseio.com");

//Authenticate Firebase
var firebase_secret = process.env.FIREBASE_SECRET;
firebase_ref.authWithCustomToken(firebase_secret, function(error, authData) {
  if (error) {
    console.log("Login Failed!", error);
  } else {
    console.log("Firebase authenticated successfully with payload.");
  }
});
//Cache firebase device - account mapping
var device_cache = {};
var devices_ref = firebase_ref.child('/devices');
devices_ref.on('child_added', function(snapshot, prevChildKey) {
  var new_entry = snapshot;
  console.log('Added Device: ' + new_entry.key() + ' Account: ' + new_entry.val());
  device_cache[new_entry.key()] = new_entry.val();
});
devices_ref.on('child_changed', function(snapshot) {
  var changed_entry = snapshot;
  console.log('Updated Device: ' + changed_entry.key() + ' Account: ' + changed_entry.val());
  device_cache[changed_entry.key()] = changed_entry.val();
});
devices_ref.on('child_removed', function(snapshot) {
  var removed_entry = snapshot;
  console.log('Removed Device: ' + removed_entry.key() + ' Account: ' + removed_entry.val());
  delete device_cache[removed_entry.key()];
});

// middleware specific to this router
/*
router.use(function timeLog(req, res, next) {
  console.log('Time: ', Date.now());
  next();
});
*/

// define the home page route
router.get('/:version/:source_id', function(req, res) {
	var version = req.params.version;
	var source_id = req.params.source_id;
	var data = req.query.data;
	var token = req.query.token;
	//TODO Authenticate token

	var account_id = device_cache[source_id];
	if(account_id != null) {
		//1. Update Firebase with the location
		send_to_firebase(version, source_id, data, account_id);
		//2. Send to Kinesis
		send_to_kinesis(version, source_id, data, account_id);
		res.status(200).end();
	} else 
  		res.status(400).end();
});

module.exports = router;

//Functions
function send_to_kinesis(version, source_id, data, account_id) {
	var parsed_data = parse_data(version, source_id, data, account_id);
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
function parse_data(version, source_id, data, account_id) {
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
					account_id: account_id,
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

function send_to_firebase(version, source_id, data, account_id) {
	var parsed_data = parse_data(version, source_id, data);
	//Take the last element in parsed data and update f/b
	if(parsed_data.length > 0) {
		var recent_location = parsed_data[parsed_data.length - 1];
		var live_car = firebase_ref.child('/accounts/' + account_id + '/livecars/' + source_id);
		live_car.update({
			'latitude': recent_location.lat,
			'longitude': recent_location.long,
			'locationTime': recent_location.time,
		});
	}
};