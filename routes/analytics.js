var express = require('express');
var router = express.Router();
var Firebase = require("firebase");
var firebase_ref = new Firebase(process.env.FIREBASE_URL);
var utils = require("./utils.js");
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

router.get('/update/ordercount/:accountid/', function(req, res){
    var account_id = req.params.accountid || " ";
    if (utils.validateAccountIds(account_id) != true) {
        res.status(400).send("Invalid account id");
        return;
    }

    firebase_ref.child('/accounts/' + account_id+'/activity/lastupdatedon')
    .once("value", function(snapshot) {
        var lastupdateddate = (snapshot.val() != null && snapshot.val() != undefined && snapshot.val() != "" ) ? Date.parseExact(snapshot.val().toString(), ["yyyy/MM/dd"]) : null;
        if(lastupdateddate == null) { //Fetch all records from firebase
        	setOrderCountForAllDate(account_id, res);
        }
        else {
        	setOrderCount(account_id, lastupdateddate, res);
        }
        return;
    });
});

module.exports = router;

function setOrderCountForAllDate(account_id, res) {
	//Total Orders Count
	firebase_ref.child('/accounts/'	+ account_id + "/unassignorders")
	.once("value", function(snapshot){
		var orderdata = snapshot.val();
		for(date in orderdata) {
			var count = Object.keys(orderdata[date]).length;
			firebase_ref.child('/accounts/'	+ account_id + "/activity/daily/"+date+"/ordercount").set(count);
		}

		//Orders by agents
		firebase_ref.child('/accounts/'	+ account_id + "/orders")
		.once("value", function(snap){
			var agentorddata = snap.val();
			for(agent in agentorddata) {
				for(orddate in agentorddata[agent]) {
					var ordersobj = agentorddata[agent][orddate];
					delete ordersobj["Activity"];
                	delete ordersobj["Loggedin"];

                	var count = ordersobj != null && ordersobj != undefined ? Object.keys(ordersobj).length : 0;
                	firebase_ref.child('/accounts/'	+ account_id + "/activity/devices/"+agent+"/daily/"+orddate+"/ordercount").set(count);
				}
			}
			res.status(200).send("Order count updated");
		});
	});
}

function setOrderCount(account_id, lastupdateddate, res) {
	var todaydate = Date.parseExact(new Date().toString("yyyy/MM/dd"), ["yyyy/MM/dd"])
	do {
		var date = lastupdateddate.toString("yyyyMMdd");
		firebase_ref.child('/accounts/'	+ account_id + "/unassignorders/"+date)
		.once("value", function(snapshot){
			var orderdata = snapshot.val();
			var count = (orderdata != null && orderdata != undefined) ? Object.keys(orderdata).length : 0;
			firebase_ref.child('/accounts/'	+ account_id + "/activity/daily/"+this.date+"/ordercount").set(count);
			console.log(this.date, count);

			//Orders by agents
			firebase_ref.child('/accounts/'	+ account_id + "/orders/")
			.once("value", function(snap){
				var agentorddata = snap.val();
				for(agent in agentorddata) {
					var ordersobj = agentorddata[agent][this.orddate];
					var count = 0;
					if(ordersobj != null && ordersobj != undefined) {
						delete ordersobj["Activity"];
                		delete ordersobj["Loggedin"];
                		count = ordersobj != null && ordersobj != undefined ? Object.keys(ordersobj).length : 0; 
                	}

                	firebase_ref.child('/accounts/'	+ account_id + "/activity/devices/"+agent+"/daily/"+this.orddate+"/ordercount").set(count);
                	console.log(agent, this.orddate, count);
				}
			}, {orddate : this.date});

		},{date : date});

		lastupdateddate.addDays(1);
	} while (lastupdateddate <= todaydate)

	res.status(200).send("Order count updated");
}
