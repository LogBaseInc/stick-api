var express = require('express');
var router = express.Router();
var Firebase = require("firebase");
var firebase_ref = new Firebase(process.env.FIREBASE_URL);
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

//Cache firebase tokens - account mapping
var account_id_cache = {};
var account_id_ref = firebase_ref.child('/accountids');
account_id_ref.on('child_added', function(snapshot, prevChildKey) {
    var new_entry = snapshot;
    account_id_cache[new_entry.key()] = new_entry.val();
});

var order_id_cache = new Array(5);
var order_id_index = 0;
var order_id_length = 5;

account_id_ref.on('child_changed', function(snapshot) {
    var changed_entry = snapshot;
    account_id_cache[changed_entry.key()] = changed_entry.val();
});

account_id_ref.on('child_removed', function(snapshot) {
    var removed_entry = snapshot;
    delete account_id_cache[removed_entry.key()];
});

//Cache firebase account - trackyourorder mapping
var account_trackyourorder_cache = {};

//Cache firebase account - msg91 mapping
var account_msg91_cache = {};

module.exports = {
    getAccountIds: function(){
        return account_id_cache;
    },

    validateAccountIds: function(account_id) {
        if (account_id == null || account_id == undefined) {
            return false;
        }

        if (account_id_cache[account_id] != null) {
            return true;
        } else {
            return false;
        }
    },

    getAccountTrackyourorder : function(account_id) {
        return account_trackyourorder_cache[account_id];
    },

    setAccountTrackyourorder : function(account_id, trackyourorder) {
        return account_trackyourorder_cache[account_id] = trackyourorder;
    },

    getAccountMSG91 : function(account_id) {
        return account_msg91_cache[account_id];
    },

    setAccountMSG91 : function(account_id, msg91) {
        return account_msg91_cache[account_id] = msg91;
    },

    getAllAccountId : function() {
        return account_id_cache;
    },

    parseDDBJson: function (DDBJson) {
        var parsedJson = {};
        for (var keys in DDBJson) {
            var DDBValue = DDBJson[keys];
            var value = null;
            var name = Object.keys(DDBValue)[0]
            switch(name) {
                case 'S':
                    value = DDBValue[name];
                    break;
                case 'N':
                    value = parseInt(DDBValue[name]);
                    break;
                default:
                    value = DDBValue[name];
            }
            parsedJson[keys] = value;
        }
        return parsedJson;
    },

    sendNotifications: function(account_id, order_details, date) {
        var text = "You have a notification for a new/updated order." + "\n\n" +
            "\tOrder Id      : " + order_details.ordernumber + "\n\n" +
            "\tCustomer Name : " + order_details.name + "\n\n" +
            "\tProduct Desc  : " + order_details.productname + order_details.productdesc + "\n\n" +
            "\tMobile No     : " + order_details.mobilenumber + "\n\n" +
            "\tDelivery Date : " + date.toString("dd MMM, yyyy") + "\n\n" +
            "\tAmount        : " + order_details.amount;


        var html = "<html><body>You have a notification for a new/updated order." + "<br/>" +
            "<ul style=\"list-style-type:none\"><li>Order Id      : " + order_details.ordernumber + "</li>" +
            "<li>Customer Name : " + order_details.name + "</li>" +
            "<li>Product Desc  : " + order_details.productname + order_details.productdesc + "</li>" +
            "<li>Mobile No     : " + order_details.mobilenumber + "</li>" +
            "<li>Delivery Date : " + date.toString("dd MMM, yyyy") + "<li/>" +
            "<li>Amount        : " + order_details.amount + "</li></ul></body></html>";

        firebase_ref.child('/accounts/' + account_id+'/settings/notifications')
            .once("value", function(snapshot) {
                var emailList = snapshot.val();
                if (emailList == null) {
                    return null;
                }

                for (var keys in emailList) {
                    var emailId = emailList[keys];

                    var payload   = {
                        to       : emailId,
                        from     : 'stick@logbase.io',
                        fromname : "Stick Notifications",
                        subject  : "Order " + order_details.ordernumber + " created/updated",
                        text     : text,
                        html     : html
                    };

                    sendgrid.send(payload, function(err, json) {
                        if (err) { console.error(err); }
                        console.log(json);
                    });
                }

            }, {text: text});
    },

    pushOrderId : function(order_id) {
        order_id_cache[order_id_index] = order_id;
        order_id_index = (order_id_index + 1) % order_id_length;
    },

    checkOrderIdPresent :  function (order_id) {
        for (var index in order_id_cache) {
            if (order_id_cache[index] == order_id) {
                return true;
            }
        }
        return false;
    }
};
