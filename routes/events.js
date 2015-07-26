var express = require('express');
var router = express.Router();
var AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
var kinesis = new AWS.Kinesis();
var kinesis_stream = process.env.EVENTS_STREAM;

// define the home page route
router.get('/:version/:source_id', function(req, res) {
	var version = req.params.version;
	var source_id = req.params.source_id;
	var data = req.query.data;
	var token = req.query.token;
	//TODO: Authenticate token
	
	//Send to Kinesis
	send_to_kinesis(version, source_id, data);
  	res.status(200).end();
});

module.exports = router;

//Functions
function send_to_kinesis(version, source_id, data) {
	console.log('Received event: ' + version + '|' + source_id + '|' + data);
	var generic_event = {type: 'generic', data: data};
	var params = {
	  Data: JSON.stringify(generic_event),
	  PartitionKey: source_id,
	  StreamName: kinesis_stream, 
	};
	kinesis.putRecord(params, function(err, data) {
	  if (err) console.log(err, err.stack); // an error occurred
	  else     console.log(data);           // successful response
	});
};

