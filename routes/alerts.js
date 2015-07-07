var express = require('express');
var router = express.Router();

// define the home page route
router.get('/:version/:source_id/:alert_type', function(req, res) {
	var version = req.params.version;
	var source_id = req.params.source_id;
	var alert_type = req.params.alert_type;
	var data = req.query.data;
	var token = req.query.token;

	//TODO
	//Authenticate token and alert

	//1. Send to firebase
	send_to_firebase(version, source_id, alert_type, data);
	//2. Send to twilio
	send_to_twilio(version, source_id, alert_type, data);

  	res.status(200).end();
});

module.exports = router;

//Functions
function send_to_firebase(version, source_id, alert_type, data) {

};

function send_to_twilio(version, source_id, alert_type, data) {

};