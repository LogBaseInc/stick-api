var express = require('express');
var router = express.Router();
var Firebase = require("firebase");
var firebase_ref = new Firebase(process.env.FIREBASE_URL);
var utils = require("./utils.js");
var request = require('request');
require("datejs");
var azure = require('azure-storage');
var azure_account = process.env.AZURE_STORAGE_ACCOUNT;
var azure_key = process.env.AZURE_STORAGE_ACCESS_KEY;
var azure_connection_string = process.env.AZURE_STORAGE_CONNECTION_STRING;
var sendgrid  = require('sendgrid')(process.env.SENDGRID_KEY);

//Authenticate Firebase
var firebase_secret = process.env.FIREBASE_SECRET;
firebase_ref.authWithCustomToken(firebase_secret, function(error, authData) {
    if (error) {
        console.log("Login Failed!", error);
    } else {
        console.log("Firebase authenticated successfully with payload.");
    }
});

router.get('/account', function(req, res) {
    var orderdate = new Date().addMonths(-2);
    var orderthresholddate = new Date(orderdate.getFullYear(), orderdate.getMonth(), 1); //Order details available for last 2 months

    var activitydate = new Date().addMonths(-6);
    var activitythresholddate = new Date(activitydate.getFullYear(), activitydate.getMonth(), 1); //Activity details available for last 6 months

    var accounts = utils.getAllAccountId();
    for(accountid in accounts) {
    	backupData(accountid, orderthresholddate, activitythresholddate);
    }

    res.status(200).send("Ok");
});

module.exports = router;

function backupData(accountid, orderthresholddate, activitythresholddate) {
	var options = {
        url: 'https://logbasedev.firebaseio.com/accounts/'+accountid+'/.json?print=pretty&auth='+firebase_secret,
    };

	function callback(account_id, orderthresholddate, activitythresholddate) {
	    return function(error, response, body) {
	        if (!error && response.statusCode == 200) {
	        	var data = JSON.stringify(JSON.parse(body));
	        	try
			    {
			        var blobService = azure.createBlobService();
			        blobService.createBlockBlobFromText('stick', account_id+"_"+new Date().toString("yyyy-MM-dd-HH-mm")+".json", data, function(error, result, response) {
			          if (!error) {
			            deleteActivity(account_id, activitythresholddate);
			            deleteOrder(account_id, orderthresholddate);
			          }
			          else{
			            console.log(error);
			            sendEmail('kousik@logbase.io', 'Error in backup', 'Accountid: '+account_id +"\n Error in saving backup file to azure blob. "+ error);
			          }

			        });
			    }
			    catch(ex){
			        console.log(ex);
			         sendEmail('kousik@logbase.io', 'Error in backup', 'Accountid: '+account_id +"\n Error in saving backup file to azure blob. "+ ex);
			    }
	        }
	        else {
	        	console.log(error);
	        	sendEmail('kousik@logbase.io', 'Error in backup', 'Accountid: '+account_id +"\n Error in taking backup of accounts. "+ error);
	        }
	    }
	}
    request(options, callback(accountid, orderthresholddate, activitythresholddate));
}

function deleteActivity(accountid, thresholddate) {
	firebase_ref.child('/accounts/'	+ accountid + "/activity/daily")
	.once("value", function(snapshot) {
		var data = snapshot.val();
		for(prop in data) {
			var date = Date.parseExact(prop, ["yyyyMMdd"]);
			if(date < thresholddate) {
				firebase_ref.child('/accounts/'	+ this.accountid + "/activity/daily/"+prop).remove();
			}
		}
	},{accountid : accountid});

	firebase_ref.child('/accounts/'	+ accountid + "/activity/devices")
	.once("value", function(snapshot) {
		var data = snapshot.val();
		for(agent in data) {
			for(prop in data[agent].daily) {
				var date = Date.parseExact(prop, ["yyyyMMdd"]);
				if(date < thresholddate) {
					firebase_ref.child('/accounts/'+this.accountid+"/activity/devices/"+agent+"/daily/"+prop).remove();
				}
			}
		}
	},{accountid : accountid});
}

function deleteOrder(accountid, thresholddate) {
	firebase_ref.child('/accounts/'	+ accountid + "/unassignorders")
	.once("value", function(snapshot) {
		var data = snapshot.val();
		for(prop in data) {
			var date = Date.parseExact(prop, ["yyyyMMdd"]);
			if(date < thresholddate) {
				firebase_ref.child('/accounts/'	+ this.accountid + "/unassignorders/"+prop).remove();
			}
		}
	},{accountid : accountid});

	firebase_ref.child('/accounts/'	+ accountid + "/orders")
	.once("value", function(snapshot) {
		var data = snapshot.val();
		for(agent in data) {
			for(prop in data[agent]) {
				var date = Date.parseExact(prop, ["yyyyMMdd"]);
				if(date < thresholddate) {
					firebase_ref.child('/accounts/'+this.accountid+"/orders/"+agent+"/"+prop).remove();
				}
			}
		}
	},{accountid : accountid});
}

/*
 * Send notification mails
 */
function sendEmail(emailId, subject, text) {
    var payload   = {
        to      : emailId,
        from    : 'stick-write@logbase.io',
        subject : subject,
        text    : text
    }

    sendgrid.send(payload, function(err, json) {
        if (err) { console.error(err); }
        console.log(json);
    });
}

