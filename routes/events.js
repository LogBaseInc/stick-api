var express = require('express');
var router = express.Router();
var AWS = require('aws-sdk');
var request = require('request');
AWS.config.update({region: 'us-east-1'});
var utils = require("./utils.js");
var kinesis = new AWS.Kinesis();
var kinesis_stream = process.env.EVENTS_STREAM;
var Firebase = require("firebase");
var firebase_ref = new Firebase(process.env.FIREBASE_URL);
require("datejs");

var loggly = require('loggly');
var loggly_token = process.env.LOGGLY_TOKEN || "7b9f6d3d-01ed-45c5-b4ed-e8d627764998";
var loggly_sub_domain = process.env.LOGGLY_SUB_DOMAIN || "kousik"

var client = loggly.createClient({
    token: loggly_token,
    subdomain: loggly_sub_domain,
    tags: ["stick"],
    json:true
});


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
    var device_id = req.body.device_id;
    var activity_date = new Date(time_ms);

    client.log(req.body, ["events"]);

    console.log(activity_date);
    console.log(hook_url, device_id, activity);
    if (activity_date == null || activity_date == undefined || activity_date == "Invalid Date") {
        res.status(400).send("Invalid time_ms");
    }


    if (hook_url != null) {
        post_to_web_hook(order_id, account_id, hook_url, date, activity, time_ms);
    }

    trackOrder(account_id, activity, date, order_id, device_id);

    if (activity == "PICKEDUP" || activity == "DELIVERED") {
        send_sms(account_id, activity, order_id, date);
    }
    res.status(200).end();
});


module.exports = router;

//Functions
function trackOrder(accountid, activity, date, orderid, deviceid) {
    if(activity != null && activity != undefined && activity != "") {
        var status = ((activity.toLowerCase() == "started") ? "Dispatched" : ((activity.toLowerCase() == "delivered") ? "Delivered" : null));
        if(status != null) {
            var token = accountid +"_"+orderid;
            var trackyourorder = utils.getAccountTrackyourorder(accountid);
            if(trackyourorder == null) {
                firebase_ref.child('/accounts/' + accountid+'/settings/trackyourorder')
                .once("value", function(snapshot) {
                    var istrackenabled = (snapshot.val() != null && snapshot.val() != undefined && snapshot.val() != "" ) ? snapshot.val().toString() : "false";
                    utils.setAccountTrackyourorder(this.accountid, istrackenabled);
                    setOrderStatus(istrackenabled, this.status, this.date, this.token, this.deviceid);
                },{accountid: accountid, status: status, date: date, token: token, deviceid: deviceid});
            }
            else {
                setOrderStatus(trackyourorder, status, date, token, deviceid);
            }
        }
    }
}

function setOrderStatus(trackyourorder, status, date, token, deviceid) {

    console.log("setOrderStatus: ", trackyourorder, status, date, token, deviceid);

    if(trackyourorder == "true") {
        var trackurl_ref = firebase_ref.child('/trackurl/'+date + "/"+ token);

        if(status == "Dispatched") {
            trackurl_ref.update({device: deviceid, status : status, starttime: new Date().getTime()});
            trackurl_ref = firebase_ref.child('/trackurl/'+date + "/"+ token+"/history/dispatched");
            trackurl_ref.set(new Date().getTime());
        }
        else if(status == "Delivered") {
            trackurl_ref.update({device: deviceid, status : status, endtime: new Date().getTime()});
            trackurl_ref = firebase_ref.child('/trackurl/'+date + "/"+ token+"/history/delivered");
            trackurl_ref.set(new Date().getTime());
        }
    }
}

function send_to_kinesis(version, source_id, data) {
	console.log('Received event: ' + version + '|' + source_id + '|' + data);
	var generic_event = {type: 'generic', data: data};
	var params = {
	  Data: JSON.stringify(generic_event),
	  PartitionKey: source_id,
	  StreamName: kinesis_stream
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
                        client.log(activity_details, [response.statusCode, "status", "events"]);
                    }
                    request(options, callback);

                }) ;
            console.log(activity_details);
    });
}


function send_sms(account_id, activity, order_id, date) {
    var sms = utils.getAccountSmsSetting(account_id);
    if(sms == null) {
        firebase_ref.child('/accounts/' + account_id+'/settings/sms')
            .once("value", function(snapshot) {
                if (snapshot.val() == null || snapshot.val() == undefined) {
                    return;
                }
                sms = snapshot.val();
                utils.setAccountSmsSetting(this.account_id, sms);

                fetch_name_and_send_sms(this.account_id, this.activity, this.order_id, this.date, sms)
            }, {
                account_id: account_id, order_id: order_id,
                activity: activity, date : date
            });
    }
    else {
        fetch_name_and_send_sms(account_id, activity, order_id, date, sms)
    }
}

function fetch_name_and_send_sms(account_id, activity, order_id, date, sms) {
    if ((activity == "PICKEDUP" && sms['shipment'] == true) ||
        (activity == "DELIVERED" && sms['delivery'] == true)) {
        // fetch order details from firebase
        firebase_ref.child('/accounts/' + account_id+'/unassignorders/'+date + '/' + order_id)
            .once("value", function(snapshot) {
                if (snapshot.val() == null || snapshot.val() == undefined) {
                   return;
                }
                var order = snapshot.val();
                console.log(order);
                if (activity == "PICKEDUP") {
                    utils.sendShipmentSms(account_id, order_id, order.amount, order.mobilenumber, order.name);
                } else if (activity == "DELIVERED") {
                    utils.sendDeliverySms(account_id, order_id, order.amount, order.mobilenumber, order.name);
                }
            });
    }
}