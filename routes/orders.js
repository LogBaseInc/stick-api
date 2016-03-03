var express = require('express');
var router = express.Router();
var Firebase = require("firebase");
var firebase_ref = new Firebase(process.env.FIREBASE_URL);
require("datejs");

var API_USAGE_LIMIT_PER_DAY = 200;

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


//Cache firebase config
var config_cache = {};
var config_ref = firebase_ref.child('/Config');
config_ref.on('child_added', function(snapshot, prevChildKey) {
    var new_entry = snapshot;
    config_cache[new_entry.key()] = new_entry.val();
});

config_ref.on('child_changed', function(snapshot) {
    var changed_entry = snapshot;
    config_cache[changed_entry.key()] = changed_entry.val();
});

config_ref.on('child_removed', function(snapshot) {
    var removed_entry = snapshot;
    delete config_cache[removed_entry.key()];
});


//APIs
router.post('/:token', function (req, res) {
    var token = req.params.token || " ";
    var order_id = req.body.order_id;
    var name = req.body.name;
    var address = req.body.address;
    var mobile = req.body.mobile_number;
    var delivery_date = req.body.delivery_date;
    var delivery_start_time = req.body.delivery_start_time || 10;
    var delivery_end_time = req.body.delivery_end_time || 18;
    var cod_amount = req.body.cod_amount || 0;
    var product_name = req.body.product_name || "";
    var product_desc = req.body.product_desc || "";
    var notes = req.body.notes || "";
    var tags = req.body.tags || "";
    var url = req.body.url || "";

    /*
     * Parse date and delivery slots
     */
    if (delivery_date == null || delivery_date == undefined) {
        res.status(400).send({ "error" : "Delivery date is mandatory" });
        return;
    }

    var date = Date.parse(delivery_date);
    if (date == null) {
        res.status(400).send({ "error" : "Incorrect date format. Expected format - yyyy/mm/dd" });
        return;
    }
    var formatted_date = date.toString("yyyyMMdd");

    var slot = parse_delivery_time(delivery_start_time, delivery_end_time);

    if (slot.succcess == false) {
        res.status(400).send({ "error" : slot.message });
        return;
    }

    /*
     * Validate token
     */
    if (tokens_cache[token] == null || tokens_cache[token] == undefined) {
        res.status(400).send({ "error" : "Invalid token" });
        return;
    }

    var account_id = tokens_cache[token].accountId;
    if (account_id == null || account_id == undefined) {
        res.status(400).send({ "error" : "Invalid token" });
        return;
    }


    /*
     * Validate mandatory fields
     */
    if (order_id == null || order_id == undefined) {
        res.status(400).send({ "error" : "Order id is mandatory" });
        return;
    }

    if (name == null || name == undefined) {
        res.status(400).send({ "error" : "Name is mandatory" });
        return;
    }

    if (mobile == null || mobile == undefined) {
        res.status(400).send({ "error" : "Mobile number is mandatory" });
        return;
    }

    if (address == null || address == undefined) {
        res.status(400).send({ "error" : "Address is mandatory" });
        return;
    }

    if (delivery_date == null || delivery_date == undefined) {
        res.status(400).send({ "error" : "Delivery date is mandatory" });
        return;
    }

    /*
     * Check if we have reached daily api usage limit
     */
    if (daily_api_usage_limit_reached(token)) {
        res.status(400).send({ "error" : "You have reached daily limit for the api. " +
            "Api usage count for the day is " + API_USAGE_LIMIT_PER_DAY });
        return;
    }

    incrementApiCount(token);

   var ts = new Date().getTime();

    /*
     * Fill in the order to update
     */
    var order_details = {
        address: address,
        amount: cod_amount,
        delivery_date: formatted_date,
        mobilenumber: mobile,
        name: name,
        notes: notes,
        ordernumber: order_id,
        productdesc: product_desc,
        productname: product_name,
        time: slot.time_slot,
        tags: tags,
        url: url,
        createdat:ts
    }


    console.log(order_details);
    /*
     * Get the firebase ref and update
     */
    var order_ref = firebase_ref.child('/accounts/' + account_id + '/unassignorders/' + formatted_date + "/" + order_id);
    order_ref.update(order_details);

    res.status(200).send();
});

router.delete("/:token", function(req, res){
    var token = req.params.token || " ";
    var order_id = req.body.order_id;
    var delivery_date = req.body.delivery_date;

    /*
     * Parse date
     */
    if (delivery_date == null || delivery_date == undefined) {
        res.status(400).send({ "error" : "Delivery date is mandatory" });
        return;
    }

    var date = Date.parse(delivery_date);
    if (date == null) {
        res.status(400).send({ "error" : "Incorrect date format. Expected format - yyyy/mm/dd" });
        return;
    }
    var formatted_date = date.toString("yyyyMMdd");

    /*
     * Validate mandatory fields
     */
    if (order_id == null || order_id == undefined) {
        res.status(400).send({ "error" : "Order id is mandatory" });
        return;
    }

    /*
     * Validate token
     */
    if (tokens_cache[token] == null || tokens_cache[token] == undefined) {
        res.status(400).send({ "error" : "Invalid token" });
        return;
    }

    var account_id = tokens_cache[token].accountId;
    if (account_id == null || account_id == undefined) {
        res.status(400).send({ "error" : "Invalid token" });
        return;
    }

    firebase_ref.child('/accounts/' + account_id + '/unassignorders/')
        .once("value", function(snapshot) {
            var orders = snapshot.val();
            if (orders == null) {
                res.status(400).send({ "error" : "No orders found" });
                return;
            }

            for (var date in orders) {
                if (date == formatted_date) {
                    for (var id in orders[date]) {
                        if (id == order_id) {
                            for (var fields in orders[date][id]) {
                                if (fields == "deviceid") {
                                    res.status(400).send({ "error" : "User is assigned to the order. " +
                                        "Please unassign the user and delete the order" });
                                    return;
                                }
                            }
                            firebase_ref.child('/accounts/' + account_id + '/unassignorders/' + formatted_date + "/" + order_id)
                                .set(null);
                            res.status(200).end();
                            return;
                        }
                    }
                }
            }
            res.status(400).send({ "error" : "Order not found" });
            return;

        });
});

function parse_delivery_time(start_time, end_time) {
    var start = parseInt(start_time);
    var end = parseInt(end_time);

    var resp = {
        success: true,
        message: null,
        time_slot: null
    }

    if (start < 0 || start > 23) {
        resp.success = false;
        resp.message = "Invalid delivery start time. Expected values 0 to 23";
        return resp;
    }

    if (end < 0 || end > 24) {
        resp.success = false;
        resp.message = "Invalid delivery end time. Expected values 0 to 24";
        return resp;
    }


    if ( start >= end ) {
        resp.success = false;
        resp.message = "Invalid time range. Delivery start time is after delivery end time";
        return resp;
    }

    if (start > 12) {
        start = start - 12 + ":00 PM";
    } else if (start == 12) {
        start = start + ":00 PM";
    } else {
        start = start + ":00 AM";
    }

    if (end == 24) {
        end = "11:59 PM";
    } else if (end > 12) {
        end = end - 12 + ":00 PM";
    } else if (end == 12) {
        end = end + ":00 PM";
    } else {
        end = end + ":00 AM";
    }

    resp.time_slot = start + " - " + end;
    return resp;
}

function daily_api_usage_limit_reached(token) {
    var dateIndex = Date.today().toString("yyyyMMdd");
    var orderCount = tokens_cache[token].orderCount;

    if (orderCount == null || orderCount == undefined) {
        return false;
    }

    if (dateIndex != orderCount.date) {
        return false;
    }

    if (orderCount.count < API_USAGE_LIMIT_PER_DAY) {
        return false;
    }

    return true;
}

function incrementApiCount(token) {
    var dateIndex = Date.today().toString("yyyyMMdd");
    var count = tokens_cache[token].orderCount.count;
    var date = tokens_cache[token].orderCount.date;

    if (date == dateIndex) {
        count+=1;
    } else {
        count = 1;
        date = dateIndex;
    }

    var orderCount = {
        date: date,
        count: count
    }

    var count_ref = firebase_ref.child('/tokens/' + token + '/orderCount');
    count_ref.update(orderCount);
    return;
}

module.exports = router;
