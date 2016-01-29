var express = require('express');
var router = express.Router();
var AWS = require('aws-sdk');
var request = require('request');
AWS.config.update({region: 'us-east-1'});
var kinesis = new AWS.Kinesis();
var kinesis_stream = process.env.EVENTS_STREAM;
var Firebase = require("firebase");
var firebase_ref = new Firebase(process.env.FIREBASE_URL);
require("datejs");

//Authenticate Firebase
var firebase_secret = process.env.FIREBASE_SECRET;
firebase_ref.authWithCustomToken(firebase_secret, function(error, authData) {
    if (error) {
        console.log("Login Failed!", error);
    } else {
        console.log("Firebase authenticated successfully with payload.");
    }
});

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


// Mobile app events
router.post('/app', function(req, res) {
    var order_id = req.body.order_id;
    var account_id = req.body.account_id;
    var hook_url = req.body.hook_url;
    var date = req.body.delivery_date;
    var activity = req.body.activity;
    var time_ms = req.body.time_ms;
    var activity_date = new Date(time_ms);

    console.log(activity_date);
    console.log(hook_url);
    if (activity_date == null || activity_date == undefined || activity_date == "Invalid Date") {
        res.status(400).send("Invalid time_ms");
    }

    post_to_web_hook(order_id, account_id, hook_url, date, activity, time_ms);
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


function post_to_web_hook(order_id, account_id, hook_url, date, activity, time_ms) {
    firebase_ref.child('/accounts/'+ account_id + '/unassignorders/' + date + '/' + order_id + '/')
        .once("value", function(snapshot) {
            var order_details = snapshot.val();
            delete order_details['deviceid'];
            var activity_details = {
                order : order_details,
                activity : activity,
                time_ms: time_ms
            }

            firebase_ref.child('/accounts/'+ account_id + '/settings/token/id')
                .once("value", function(snapshot){
                    var token = snapshot.val();
                    activity_details['token'] = token;

                    var options = {
                        url: hook_url,
                        method: "POST",
                        headers: {
                            'Content-Type' : 'application/json'
                        },
                        json: true,
                        body : activity_details
                    };

                    function callback(error, response, body) {
                        // Handle failure cases
//                        console.log("Status " + response.statusCode);
                    }
                    request(options, callback);

                }) ;
            console.log(activity_details);
    });
}

