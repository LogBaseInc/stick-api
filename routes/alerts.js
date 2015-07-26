var express = require('express');
var router = express.Router();
var AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
var kinesis = new AWS.Kinesis();
var kinesis_stream = process.env.EVENTS_STREAM;
var Firebase = require("firebase");
var firebase_ref = new Firebase(process.env.FIREBASE_URL);

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
  console.log('Added Device in Alerts Controller: ' + new_entry.key() + ' Account: ' + new_entry.val());
  device_cache[new_entry.key()] = new_entry.val();
});
devices_ref.on('child_changed', function(snapshot) {
  var changed_entry = snapshot;
  console.log('Updated Device in Alerts Controller: ' + changed_entry.key() + ' Account: ' + changed_entry.val());
  device_cache[changed_entry.key()] = changed_entry.val();
});
devices_ref.on('child_removed', function(snapshot) {
  var removed_entry = snapshot;
  console.log('Removed Device in Alerts Controller: ' + removed_entry.key() + ' Account: ' + removed_entry.val());
  delete device_cache[removed_entry.key()];
});

// define the home page route
router.get('/:version/:source_id/:alert_type', function(req, res) {
	var version = req.params.version;
	var source_id = req.params.source_id;
	var alert_type = req.params.alert_type;
	var data = req.query.data;
	var token = req.query.token;

	//TODO
	//Authenticate token and alert

	var account_id = device_cache[source_id];
	if(account_id != null) {
		//1. Send to firebase
		send_to_firebase(version, source_id, account_id, alert_type, data);
		//2. Send to twilio
		send_to_twilio(version, source_id, account_id, alert_type, data);
		//3. Send event to kinesis
		send_to_kinesis(version, source_id, account_id, alert_type, data);
	  	res.status(200).end();
  	} else
  		res.status(400).end();
});

module.exports = router;

//Functions
function send_to_firebase(version, source_id, account_id, alert_type, data) {

};

function send_to_twilio(version, source_id, account_id, alert_type, data) {

};

function send_to_kinesis(version, source_id, account_id, alert_type, data) {
	console.log('Received event: ' + version + '|' + source_id + '|' + data + '|' + alert_type);
	var alert_event = {type: alert_type, data: data, source_id: source_id, account_id: account_id};
	var params = {
	  Data: JSON.stringify(alert_event), 
	  PartitionKey: source_id,
	  StreamName: kinesis_stream, 
	};
	kinesis.putRecord(params, function(err, data) {
	  if (err) console.log(err, err.stack); // an error occurred
	  else     console.log(data);           // successful response
	});
};