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

                        //Update  created on time
                        updateStat("/accounts/" + accountid + "/createdon", "createdon", uid, accountDict);

                        // Update owner email stats
                        updateStat("/accounts/" + accountid + "/email", "email", uid, accountDict);

                        // Update Agents stats
                        updateStat("/accounts/" + accountid + "/devices", "agents", uid, accountDict);

                        // Update Accoun id stats
                        updateStat("/accountids/" + accountid, "accounntid", uid, accountDict);

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
            case "createdon":
                var tokens = data.split(" ")[0].split("/");
                var date = Date.today().set(
                    { year : parseInt(tokens[0]), month : parseInt(tokens[2]) - 1, day : parseInt(tokens[1])});
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
                    var stats = {};
                    var email = {};
                    var accountId = data[admin].account;

                    email[data[admin].email.replace(/\.|@/g, " ")] = data[admin].email;

                    var stats_ref = firebase_ref.child("/stats/" + accountDict[accountId] + "/admins");
                    stats_ref.update(email);

                    var time = getCreatedTime()[admin];
                    if (time != null && time != undefined) {
                        stats["createdon"] = time;
                        firebase_ref.child("/stats/" + accountDict[accountId] + "/email").
                            once("value", function(snapshot) {
                                var dta = snapshot.val();
                                if (dta != null && dta != undefined && dta == this.email ) {
                                    //console.log(dta, this.email, this.stats);
                                    var stats_ref = firebase_ref.child("/stats/" + this.accountDict[this.accountId]);
                                   stats_ref.update(this.stats);
                                };
                            }, {
                                stats : stats,
                                email : data[admin].email,
                                accountDict : accountDict,
                                accountId : accountId
                            });
                    }
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


function getCreatedTime() {
    var ts = {
        "simplelogin:2": "23-Jun-15",
        "simplelogin:32": "1-Aug-15",
        "simplelogin:33": "5-Aug-15",
        "simplelogin:36": "7-Aug-15",
        "simplelogin:39": "18-Aug-15",
        "4a0cdb9e-b9b7-4d0b-8f71-58e38a85758f": "3-Sep-15",
        "e79bad46-4f27-48cd-99e7-dce7ad098f17": "10-Sep-15",
        "e785b83c-8024-4150-8944-7f0a480c7b49": "25-Sep-15",
        "6b4c8cc1-55f1-4869-b8f6-7feada538b30": "20-Oct-15",
        "3a403928-f546-4d16-b80e-24017fb1ca70": "22-Oct-15",
        "3e8abf82-99cf-46c9-bc83-aae4373db902": "28-Oct-15",
        "b8ed1f5e-ce41-447e-9763-e2e10eeecd67": "4-Nov-15",
        "8cbe3233-2475-4d89-81b7-0396bdfb93d2": "4-Nov-15",
        "fa2c34cf-7f81-4bf8-b6a6-806972efd1be": "30-Nov-15",
        "1747761b-7c4e-4b29-b618-137a2cc9b691": "5-Dec-15",
        "4a9d3967-89a0-482b-ab40-a0a1f22ad9a9": "12-Dec-15",
        "83bee570-aa5d-4a8e-b276-242c58cf7ddd": "15-Jan-16",
        "645394ff-2287-4d1a-bcbb-30c19626738a": "20-Jan-16",
        "5dba08f5-3327-4123-8c2d-337f09503961": "5-Feb-16",
        "135947e6-a77f-4139-be7d-b60cf0bae45a": "6-Feb-16",
        "5642155d-36af-4725-9162-7b874f602c7d": "7-Feb-16",
        "3781504a-3f73-497c-bbfd-f191b5822046": "7-Feb-16",
        "2b74f06d-111b-403c-81eb-d73c2d373fbf": "7-Feb-16",
        "134ffe86-e776-45c0-9ae1-68bffc503094": "14-Feb-16",
        "af74cfe2-d67e-4f9e-98a7-2c24e484d014": "14-Feb-16",
        "af657523-d665-4c1e-a25e-3fbf64f579f8": "18-Feb-16",
        "a06ee3e4-5d9f-4aeb-8ceb-dbec51b695bd": "20-Feb-16",
        "61e32027-ab61-44e6-a7bf-8c3a57a83743": "21-Feb-16",
        "932a99ec-8666-4928-ba84-b13a5f64515f": "22-Feb-16",
        "d3d31cae-68b3-47cd-a58d-821f61198337": "23-Feb-16",
        "c2652bc3-14ec-4512-9a4d-30e256f97409": "23-Feb-16",
        "2a807b19-67b5-4fe6-8b9f-89e4570643d7": "23-Feb-16",
        "b611ab5b-f4bc-4e58-91ca-6d7f8fdb029c": "24-Feb-16",
        "96ef5c73-2cea-4777-b253-21799bc3c72d": "25-Feb-16",
        "e01eb96b-97dc-4449-997b-add0f023f120": "26-Feb-16",
        "10f6f26a-4479-40cf-b287-11656a0c3a3c": "28-Feb-16",
        "8ae20ca0-0a0a-470d-a53d-37f89738bb51": "28-Feb-16",
        "f945807c-d6e5-42cc-becc-f8ad1427fdeb": "28-Feb-16",
        "ddd17151-466f-4747-987a-cc2b9dd23940": "28-Feb-16",
        "eaec732c-40d8-4bc5-a437-cf9a81a67148": "28-Feb-16",
        "8cf3de08-0312-4f2d-9e9c-1829f726eb46": "29-Feb-16",
        "4ba291c2-ee3d-4025-aba2-801392d6e3ed": "29-Feb-16",
        "f30be3fd-b4a4-4a4f-91d4-d4d7611c6fa9": "29-Feb-16",
        "71aee6e2-0688-4fdd-9d8c-a23d60633686": "1-Mar-16",
        "3c08533d-ae93-465d-8377-bfbe89d36959": "1-Mar-16",
        "89f02f34-9138-4ed9-a94b-7acbba03eb2b": "1-Mar-16",
        "e4a2f989-2c14-488b-af61-608168a662cc": "1-Mar-16",
        "b9cd43a0-8084-4b57-8ccc-baa92af0fdfd": "1-Mar-16",
        "779fa81e-1de2-416a-9967-ed798e275b0b": "1-Mar-16",
        "23023063-9a0c-411a-9fcc-89ed124a4c07": "2-Mar-16",
        "40bb9af5-3afb-4ec9-aa14-b83f328d0a65": "4-Mar-16",
        "64d63ea9-e280-4d53-a275-2db826a8395b": "4-Mar-16",
        "a1bd90fa-1ee6-40ec-86ad-1c8a85f37b5a": "7-Mar-16",
        "764e35c2-abf4-444f-a5b6-3a6971292a0b": "8-Mar-16",
        "3502bfe3-8a0f-4145-9900-f121c57193c6": "9-Mar-16",
        "7541c567-69ba-48f8-bda9-b6d8ec7153dc": "10-Mar-16",
        "5398dafa-6855-4fb5-95dd-807e4ae23aa1": "10-Mar-16",
        "81be4c0e-0a2a-4388-9149-3f4e30d4d444": "12-Mar-16",
        "24542453-ed36-42b9-ac06-706f889b297d": "14-Mar-16",
        "ab4ed3be-c8de-4118-a80c-f658541402f6": "15-Mar-16",
        "4020ac72-553c-4466-8ea1-0d0ac6108786": "15-Mar-16",
        "df53789e-8439-4a5e-b406-29f60606cebe": "16-Mar-16",
        "7f582f0c-bc1f-44ca-88f6-f9202e7bb1c5": "17-Mar-16"
    }
    return ts;
}