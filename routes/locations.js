var express = require('express');
var router = express.Router();

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
	//1. Send to Kinesis
	send_to_kinesis(version, source_id, data);
	//2. Update Firebase with the location
	send_to_firebase(version, source_id, data);
  	res.status(200).end();
});

module.exports = router;

//Functions
function send_to_kinesis(version, source_id, data) {

};

function send_to_firebase(version, source_id, data) {

};