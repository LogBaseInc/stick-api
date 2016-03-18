var express = require('express');
var router = express.Router();
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


router.get("/", function(req,res) {
    console.log("Stats req");
    var accountDict = {};
    firebase_ref.child("/accountids").
        once("value", function(snapshot) {
            if (snapshot.val() == null || snapshot.val() == undefined) {
                res.status(200).send("All ok 1");
                return;
            }

            for (var accountid in snapshot.val()) {
                //var accountid = "account060cf688-e0bb-4fbe-86cd-482a52772940";
                //var accountid = "account2e69da1b-7ff2-4e74-9a14-24d3b4245a12";
                var status = {};
                firebase_ref.child("/accounts/" + accountid + "/name").
                    once("value", function(snapshot1) {
                        if (snapshot1.val() == null || snapshot1.val() == undefined) {
                            return;
                        }

                        var accountid = this.accountid;
                        var account_name = snapshot1.val();
                        //console.log(account_name, accountid);

                        var uid = account_name.toLowerCase();
                        accountDict[accountid] = uid;

                        // Update account name in stats
                        updateStat("/accounts/" + accountid + "/name", "name", uid, accountDict);

                        //Update last accessed time
                        updateStat("/accounts/" + accountid + "/lastseen", "lastseen", uid, accountDict);

                        //Update last accessed time
                        updateStat("/accounts/" + accountid + "/createdon", "createdon", uid, accountDict);

                        // Update owner email stats
                        updateStat("/accounts/" + accountid + "/email", "email", uid, accountDict);

                        // Update Agents stats
                        updateStat("/accounts/" + accountid + "/devices", "agents", uid, accountDict);

                    }, { "accountid" : accountid});
            }

            //Update Admin stats
            updateStat("/users", "admins", null, accountDict);
        });

    res.status(200).send("All ok 2");
});

module.exports = router;


function updateStat(referenceUrl, key, uid, accountDict) {
    firebase_ref.child(referenceUrl).once("value", function(snapshot) {
        var data = snapshot.val();
        if (data == null || data == undefined) {
            return;
        }

        var key = this.key;
        var uid = this.uid;
        var accountDict = this.accountDict;
        var stats = {};
        switch(key) {
            case "lastseen":
                var date = Date.parse(data);
                stats[key] = date.toString("MMM dd, yyyy");
                break;

            case "agents":
                stats[key] = {};
                var count = 0;
                for (var device in data) {
                    var name = data[device].vehiclenumber;
                    var date = "nil";
                    count+=1;

                    if (data[device].activity && data[device].activity.date) {
                        date = Date.parse(data[device].activity.date);
                        date = date.toString("MMM dd, yyyy");
                    }
                    stats[key][name] = { lastseen : date };

                    if (data[device].appversion) {
                        stats[key][name]['appversion'] = data[device].appversion;
                    }
                }
                stats['agentcount'] = count;
                break;

            case "admins":
                for (var admin in data) {
                    var email = {};
                    var accountId = data[admin].account;
                    var stats_ref = firebase_ref.child("/stats/" + accountDict[accountId] + "/admins");

                    email[data[admin].email.replace(/\.|@/g, " ")] = data[admin].email;
                    stats_ref.update(email);
                }
                return;

            default:
                stats[key] = data;
                break;
        }

        var stats_ref = firebase_ref.child("/stats/" + uid);
        stats_ref.update(stats);
    }, {"key" : key, "uid" : uid, "accountDict" : accountDict})
}