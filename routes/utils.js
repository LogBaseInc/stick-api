var express = require('express');
var router = express.Router();
var Firebase = require("firebase");
var firebase_ref = new Firebase(process.env.FIREBASE_URL);
var sendgrid  = require('sendgrid')(process.env.SENDGRID_KEY);
var MSG91_API = process.env.MSG91_API;
var MSG91_ROUTE_NO = 4; // transactional route

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

//Cache firebase account - enable sms notification
var account_sms_settings_cache = {}


var loggly = require('loggly');
var loggly_token = process.env.LOGGLY_TOKEN || "7b9f6d3d-01ed-45c5-b4ed-e8d627764998";
var loggly_sub_domain = process.env.LOGGLY_SUB_DOMAIN || "kousik";

var client = loggly.createClient({
    token: loggly_token,
    subdomain: loggly_sub_domain,
    tags: ["stick", "orders"],
    json:true
});

//Cache firebase tokens - account mapping
var tokens_cache = {};
var tokens_ref = firebase_ref.child('/tokens');
tokens_ref.on('child_added', function(snapshot, prevChildKey) {
    var new_entry = snapshot;
    console.log('Added tokens: ' + new_entry.key() + ' Account: ' + new_entry.val());
    tokens_cache[new_entry.key()] = new_entry.val();
});

tokens_ref.on('child_changed', function(snapshot) {
    var changed_entry = snapshot;
    console.log('Updated tokens: ' + changed_entry.key() + ' Account: ' + changed_entry.val());
    tokens_cache[changed_entry.key()] = changed_entry.val();
});

tokens_ref.on('child_removed', function(snapshot) {
    var removed_entry = snapshot;
    console.log('Removed tokens: ' + removed_entry.key() + ' Account: ' + removed_entry.val());
    delete tokens_cache[removed_entry.key()];
});


var self = module.exports = {
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

    getAccountSmsSetting : function(account_id) {
        return account_sms_settings_cache[account_id];
    },

    setAccountSmsSetting : function(account_id, sms_settings) {
        return account_sms_settings_cache[account_id] = sms_settings;
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
    },

    sendOrderConfirmationSms : function(accountid, orderid, price, mobilenumber, name) {
        var userName = name;
        var orderId = orderid;
        var price = price;
        var text = "Hi " + userName + ", We have received your order - " + orderId + " amounting to INR " + price + ".";
        self.sendSmsInternal(accountid, text, mobilenumber);
    },

    sendOrderCancellationSms : function(accountid, orderid, price, mobilenumber, name) {
        var userName = name;
        var orderId = orderid;
        var text = "Hi " + userName + ", Your Order " + orderId + " has been cancelled.";
        self.sendSmsInternal(accountid, text, mobilenumber);
    },

    sendShipmentSms : function(accountid, orderid, price, mobilenumber, name) {
        var userName = name;
        var orderId = orderid;
        var text = "Hi " + userName + ", Your Order " + orderId + " is out for delivery. You will be receiving them soon.";
        self.sendSmsInternal(accountid, text, mobilenumber);
    },

    sendSmsInternal : function(accountid, text, mobilenumber) {
        var msg91obj = null;
        //self.getAccountMSG91(accountid);
        if(msg91obj != null && msg91obj != undefined) {
            self.sendSMS(msg91obj, mobilenumber, text)
        }

        else {
            firebase_ref.child('/accounts/'+accountid+"/settings/nickname")
                .once("value", function(snapshot) {
                    var msg91obj = require("msg91")(MSG91_API, snapshot.val().toString(), MSG91_ROUTE_NO);
                    self.setAccountMSG91(this.accountid, msg91obj);
                    self.sendSMS(msg91obj, this.mobilenumber, this.text);
                }, {mobilenumber : mobilenumber, text : text, accountid : accountid});
        }
    },

    sendSMS : function(msg91obj, mob, text) {
        client.log({mob : mob, text : text}, ['MSG91', 'debug_info']);
        var mobNo = self.parseMobNumber(mob);
        if (mobNo == null) {
            client.log({mobile : mob, message : text}, ['MSG91']);
            self.sendEmail("kousik@logbase.io", null, "Stick Order Placed - SMS failed", text + " " + mob);
            return;
        }
        msg91obj.send(mobNo, text, function(err, response){
            console.log(err);
            console.log(response);
        });
    },

    sendEmail : function (emailId, order, subject, text) {
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
    },

    parseMobNumber : function(mob) {
        console.log(mob);
        // Cases where two numbers are provided. Pick the first 10 - 12 digit mob number
        if (mob.length > 20) {
            var tmp = mob.match(/\d{10,12}/);
            if (tmp != null) {
                mob = tmp[0];
            }
        }

        // Pick only the numbers. Remove special characters
        var numb = mob.match(/\d/g);
        numb = numb.join("");

        // Remove leading zeroes
        numb = numb.replace(/^0+/, '');

        switch (numb.length) {
            case 10:
                return numb;
            case 11:
                if (numb.indexOf('0') == 0) {
                    return numb.substr(1, 10);
                }
                return null;
            case 12:
                if (numb.indexOf('91') == 0) {
                    return numb.substr(2, 10);
                }
                return null;
            default:
                return null;
        }
        return null;
    },

    getAccountIdFromToken : function(token) {
        /*
         * Validate token
         */
        if ((tokens_cache[token] == null || tokens_cache[token] == undefined) && !self.validateAccountIds(token)) {
            return null;
        }

        var account_id = token;
        if (!self.validateAccountIds(token)) {
            account_id = tokens_cache[token].accountId;
        }

        return account_id;
    },

    getUserIdFromToken : function(token) {
        if (self.getAccountIdFromToken == null) {
            return null;
        }

        return tokens_cache[token].userId;
    },

    getTokensCache : function() {
        return tokens_cache;
    }
};
