var express = require('express');
var router = express.Router();
var Firebase = require("firebase");
var firebase_ref = new Firebase(process.env.FIREBASE_URL);
var request = require('request');
var utils = require("./utils.js");
require("datejs");
var BitlyAPI = require("node-bitlyapi");
var sendgrid  = require('sendgrid')(process.env.SENDGRID_KEY);

var API_USAGE_LIMIT_PER_DAY = 3000;
var MSG91_API = process.env.MSG91_API;
var MSG91_ROUTE_NO = 4; // transactional route

var loggly = require('loggly');
var loggly_token = process.env.LOGGLY_TOKEN;
var loggly_sub_domain = process.env.LOGGLY_SUB_DOMAIN
var client = loggly.createClient({
    token: loggly_token,
    subdomain: loggly_sub_domain,
    tags: ["stick"],
    json:true
});

var Bitly = new BitlyAPI({
    client_id: process.env.BITLY_CLIENT_ID,
    client_secret: process.env.BITLY_CLIENT_SECRET 
});
Bitly.setAccessToken(process.env.BITLY_TOKEN);

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

var loggly = require('loggly');
var loggly_token = process.env.LOGGLY_TOKEN || "7b9f6d3d-01ed-45c5-b4ed-e8d627764998";
var loggly_sub_domain = process.env.LOGGLY_SUB_DOMAIN || "kousik";

var client = loggly.createClient({
    token: loggly_token,
    subdomain: loggly_sub_domain,
    tags: ["stick", "orders"],
    json:true
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
    client.log({body : req.body, token : token}, ["POST"]);
    processItems(token, [req.body], res);
});


router.post('/batch/:token', function(req, res) {
    var token = req.params.token || " ";
    client.log({body : req.body, token : token}, ["POST", "batch"]);
    if (req.body.length <= 0) {
        res.status(400).send({"error" : "No orders to process"});
        return;
    }
    processItems(token, req.body, res);
});

router.delete("/:token", function(req, res){
    var token = req.params.token || " ";
    var order_id = req.body.order_id;
    var delivery_date = req.body.delivery_date;

    client.log({body : req.body, token : token}, ["DELETE"])

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
    if ((tokens_cache[token] == null || tokens_cache[token] == undefined) && !utils.validateAccountIds(token)) {
        res.status(400).send({ "error" : "Invalid token" });
        return;
    }

    var account_id = token;
    if (!utils.validateAccountIds(token)) {
        account_id = tokens_cache[token].accountId;
    }

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

router.get('/:token/:deliverydate/:orderid?', function(req, res) {
    var token = req.params.token || " ";
    var deliverydate = req.params.deliverydate || " ";
    var orderid = req.params.orderid || null;

    client.log({deliverydate : deliverydate, orderid : orderid, token : token}, ["GET"]);

     /*
     * Validate token
     */
    if ((tokens_cache[token] == null || tokens_cache[token] == undefined) && !utils.validateAccountIds(token)) {
        res.status(400).send({ "error" : "Invalid token" });
        return;
    }

    var account_id = token;
    if (!utils.validateAccountIds(token)) {
        account_id = tokens_cache[token].accountId;
    }

    if (account_id == null || account_id == undefined) {
        res.status(400).send({ "error" : "Invalid token" });
        return;
    }

    /*
     * Parse date
     */
    if (deliverydate == null || deliverydate == undefined) {
        res.status(400).send({ "error" : "Delivery date is mandatory" });
        return;
    }

    var date = Date.parseExact(deliverydate, "yyyyMMdd");
    if (date == null) {
        res.status(400).send({ "error" : "Incorrect date format. Expected format - yyyyMMdd" });
        return;
    }

    firebase_ref.child('/accounts/' + account_id + '/settings/vendorsupport')
    .once("value", function(snapshot) {
        var isvendorsupport = snapshot.val() != null && snapshot.val() != undefined && snapshot.val() != "" ? snapshot.val() : false;
        var vendors = [];
        if(isvendorsupport == true) {
            var Base64={_keyStr:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",encode:function(e){var t="";var n,r,i,s,o,u,a;var f=0;e=Base64._utf8_encode(e);while(f<e.length){n=e.charCodeAt(f++);r=e.charCodeAt(f++);i=e.charCodeAt(f++);s=n>>2;o=(n&3)<<4|r>>4;u=(r&15)<<2|i>>6;a=i&63;if(isNaN(r)){u=a=64}else if(isNaN(i)){a=64}t=t+this._keyStr.charAt(s)+this._keyStr.charAt(o)+this._keyStr.charAt(u)+this._keyStr.charAt(a)}return t},decode:function(e){var t="";var n,r,i;var s,o,u,a;var f=0;e=e.replace(/[^A-Za-z0-9\+\/\=]/g,"");while(f<e.length){s=this._keyStr.indexOf(e.charAt(f++));o=this._keyStr.indexOf(e.charAt(f++));u=this._keyStr.indexOf(e.charAt(f++));a=this._keyStr.indexOf(e.charAt(f++));n=s<<2|o>>4;r=(o&15)<<4|u>>2;i=(u&3)<<6|a;t=t+String.fromCharCode(n);if(u!=64){t=t+String.fromCharCode(r)}if(a!=64){t=t+String.fromCharCode(i)}}t=Base64._utf8_decode(t);return t},_utf8_encode:function(e){e=e.replace(/\r\n/g,"\n");var t="";for(var n=0;n<e.length;n++){var r=e.charCodeAt(n);if(r<128){t+=String.fromCharCode(r)}else if(r>127&&r<2048){t+=String.fromCharCode(r>>6|192);t+=String.fromCharCode(r&63|128)}else{t+=String.fromCharCode(r>>12|224);t+=String.fromCharCode(r>>6&63|128);t+=String.fromCharCode(r&63|128)}}return t},_utf8_decode:function(e){var t="";var n=0;var r=c1=c2=0;while(n<e.length){r=e.charCodeAt(n);if(r<128){t+=String.fromCharCode(r);n++}else if(r>191&&r<224){c2=e.charCodeAt(n+1);t+=String.fromCharCode((r&31)<<6|c2&63);n+=2}else{c2=e.charCodeAt(n+1);c3=e.charCodeAt(n+2);t+=String.fromCharCode((r&15)<<12|(c2&63)<<6|c3&63);n+=3}}return t}}
            firebase_ref.child('/accounts/' + account_id + '/users')
            .once("value", function(snapshot) {
                var data = snapshot.val();
                for(prop in data) {
                    vendors[data[prop].uid] = Base64.decode(prop);
                }
            });
        }

        var firebaseref = null;
        var isoneorder = false
        if (orderid != null && orderid != undefined) {
            isoneorder = true;
            firebaseref = firebase_ref.child('/accounts/' + account_id + '/unassignorders/'+deliverydate+ "/" + orderid);
        }
        else {
            firebaseref = firebase_ref.child('/accounts/' + account_id + '/unassignorders/'+deliverydate);
        }

        var orders = [];
        firebaseref.once("value", function(snapshot) {
            var data = snapshot.val();
            if(isoneorder == true) {
                var order = getOrder(data, isvendorsupport, vendors);
                res.status(200).send(JSON.stringify(order));
                return;
            }
            else {
                for(prop in data) {
                    var orderinfo = data[prop];
                    orders.push(getOrder(orderinfo, isvendorsupport, vendors));
                }
                res.status(200).send(JSON.stringify(orders));
                return;
            }
        });

    });
});

router.get('/daterange/:token/:startdate/:enddate', function(req, res) {
    var token = req.params.token || null;
    var startdate = req.params.startdate || null;
    var enddate = req.params.enddate || null;

    client.log({startdate : startdate, enddate : enddate, token : token}, ["daterange", "GET"]);

     /*
     * Validate token
     */
    if ((tokens_cache[token] == null || tokens_cache[token] == undefined) && !utils.validateAccountIds(token)) {
        res.status(400).send({ "error" : "Invalid token" });
        return;
    }

    var account_id = token;
    if (!utils.validateAccountIds(token)) {
        account_id = tokens_cache[token].accountId;
    }

    if (account_id == null || account_id == undefined) {
        res.status(400).send({ "error" : "Invalid token" });
        return;
    }

    /*
     * Parse date
     */
    if (startdate == null || startdate == undefined) {
        res.status(400).send({ "error" : "Delivery start date is mandatory" });
        return;
    }

    if (enddate == null || enddate == undefined) {
        res.status(400).send({ "error" : "Delivery end date is mandatory" });
        return;
    }

    var date = Date.parseExact(startdate, "yyyyMMdd");
    if (date == null) {
        res.status(400).send({ "error" : "Incorrect Delivery start date format. Expected format - yyyyMMdd" });
        return;
    }

    var date = Date.parseExact(enddate, "yyyyMMdd");
    if (date == null) {
        res.status(400).send({ "error" : "Incorrect Delivery end date format. Expected format - yyyyMMdd" });
        return;
    }

    firebase_ref.child('/accounts/' + account_id + '/settings/vendorsupport')
    .once("value", function(snapshot) {
        var isvendorsupport = snapshot.val() != null && snapshot.val() != undefined && snapshot.val() != "" ? snapshot.val() : false;
        var vendors = [];
        if(isvendorsupport == true) {
            var Base64={_keyStr:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",encode:function(e){var t="";var n,r,i,s,o,u,a;var f=0;e=Base64._utf8_encode(e);while(f<e.length){n=e.charCodeAt(f++);r=e.charCodeAt(f++);i=e.charCodeAt(f++);s=n>>2;o=(n&3)<<4|r>>4;u=(r&15)<<2|i>>6;a=i&63;if(isNaN(r)){u=a=64}else if(isNaN(i)){a=64}t=t+this._keyStr.charAt(s)+this._keyStr.charAt(o)+this._keyStr.charAt(u)+this._keyStr.charAt(a)}return t},decode:function(e){var t="";var n,r,i;var s,o,u,a;var f=0;e=e.replace(/[^A-Za-z0-9\+\/\=]/g,"");while(f<e.length){s=this._keyStr.indexOf(e.charAt(f++));o=this._keyStr.indexOf(e.charAt(f++));u=this._keyStr.indexOf(e.charAt(f++));a=this._keyStr.indexOf(e.charAt(f++));n=s<<2|o>>4;r=(o&15)<<4|u>>2;i=(u&3)<<6|a;t=t+String.fromCharCode(n);if(u!=64){t=t+String.fromCharCode(r)}if(a!=64){t=t+String.fromCharCode(i)}}t=Base64._utf8_decode(t);return t},_utf8_encode:function(e){e=e.replace(/\r\n/g,"\n");var t="";for(var n=0;n<e.length;n++){var r=e.charCodeAt(n);if(r<128){t+=String.fromCharCode(r)}else if(r>127&&r<2048){t+=String.fromCharCode(r>>6|192);t+=String.fromCharCode(r&63|128)}else{t+=String.fromCharCode(r>>12|224);t+=String.fromCharCode(r>>6&63|128);t+=String.fromCharCode(r&63|128)}}return t},_utf8_decode:function(e){var t="";var n=0;var r=c1=c2=0;while(n<e.length){r=e.charCodeAt(n);if(r<128){t+=String.fromCharCode(r);n++}else if(r>191&&r<224){c2=e.charCodeAt(n+1);t+=String.fromCharCode((r&31)<<6|c2&63);n+=2}else{c2=e.charCodeAt(n+1);c3=e.charCodeAt(n+2);t+=String.fromCharCode((r&15)<<12|(c2&63)<<6|c3&63);n+=3}}return t}}
            firebase_ref.child('/accounts/' + account_id + '/users')
            .once("value", function(snapshot) {
                var data = snapshot.val();
                for(prop in data) {
                    vendors[data[prop].uid] = Base64.decode(prop);
                }
            });
        }

        var orders = [];
        var firebaseref =firebase_ref.child('/accounts/' + account_id + '/unassignorders');
        firebaseref.orderByKey().startAt(startdate.toString()).endAt(enddate.toString()).once("value", function(snapshot) {
            var data = snapshot.val();
            for(dateprop in data) {
                for(prop in data[dateprop]) {
                    var orderinfo = data[dateprop][prop];
                    orders.push(getOrder(orderinfo, isvendorsupport, vendors));
                }
            }
            res.status(200).send(JSON.stringify(orders));
            return;
            
        });

    });
    
});

function getOrder(orderinfo, isvendorsupport, vendors) {
    var order = {};
    order.order_id = orderinfo.ordernumber;
    order.mobile_number = orderinfo.mobilenumber;
    order.name = orderinfo.name;
    order.address = orderinfo.address;
    order.zip = orderinfo.zip;
    order.country = orderinfo.country;
    order.product_name = orderinfo.productname;
    order.product_desc = orderinfo.productdesc;
    order.cod_amount = orderinfo.amount;
    order.delivery_date = [orderinfo.delivery_date.substr(0, 4), orderinfo.delivery_date.substr(4, 2), orderinfo.delivery_date.substr(6, 2)].join('/'); ;
    order.delivery_time = orderinfo.time;
    order.notes = orderinfo.notes;
    order.tags = orderinfo.tags;
    if(isvendorsupport) {
        order.pickup_location = orderinfo.pickuplocation != null && orderinfo.pickuplocation != undefined && orderinfo.pickuplocation != "" ? orderinfo.pickuplocation : "";
        order.delivery_charge = orderinfo.deliverycharge != null && orderinfo.deliverycharge != undefined && orderinfo.deliverycharge != "" ? orderinfo.deliverycharge : 0 ;
        order.vendor = vendors[orderinfo.createdby];
        if(order.vendor == null || order.vendor == undefined) {
            order.vendor = "Admin";
        }
    }

    return order;
}

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

function processItems(token, items, res) {
    /*
     * Validate token
     */
    if ((tokens_cache[token] == null || tokens_cache[token] == undefined) && !utils.validateAccountIds(token)) {
        res.status(400).send({ "error" : "Invalid token" });
        return;
    }

    var account_id = token;
    if (!utils.validateAccountIds(token)) {
        account_id = tokens_cache[token].accountId;
    }

    if (account_id == null || account_id == undefined) {
        res.status(400).send({ "error" : "Invalid token" });
        return;
    }

    for (var idx in items) {
        var order_id = items[idx].order_id;
        var name = items[idx].name;
        var address = items[idx].address;
        var mobile = items[idx].mobile_number;
        var delivery_date = items[idx].delivery_date;
        var delivery_start_time = items[idx].delivery_start_time || 10;
        var delivery_end_time = items[idx].delivery_end_time || 18;
        var cod_amount = items[idx].cod_amount || 0;
        var product_name = items[idx].product_name || "";
        var product_desc = items[idx].product_desc || "";
        var notes = items[idx].notes || "";
        var tags = items[idx].tags || "";
        var url = items[idx].url || "";
        var zip = items[idx].zip;
        var itms = items[idx].items || null;
        var country = items[idx].country;
        var delivery_time_slot = items[idx].delivery_time_slot || null;
        var cod_internal = items[idx].cod_internal || null;
        var createdby = items[idx].createdby || null;
        var deliverycharge = items[idx].deliverycharge || null;
        var pickuplocation = items[idx].pickuplocation || null;

        /*
         * Parse date and delivery slots
         */
        if (delivery_date == null || delivery_date == undefined) {
            res.status(400).send({ "error": "Delivery date is mandatory" });
            return;
        }

        var date = Date.parse(delivery_date);
        if (date == null) {
            res.status(400).send({ "error": "Incorrect date format. Expected format - yyyy/mm/dd" });
            return;
        }
        var formatted_date = date.toString("yyyyMMdd");

        var slot = { "time_slot" : delivery_time_slot};
        if (delivery_time_slot == null) {
            slot = parse_delivery_time(delivery_start_time, delivery_end_time);
        }

        if (slot.succcess == false) {
            res.status(400).send({ "error": slot.message });
            return;
        }

        /*
         * Validate mandatory fields
         */
        if (order_id == null || order_id == undefined) {
            res.status(400).send({ "error": "Order id is mandatory" });
            return;
        }

        if (name == null || name == undefined) {
            res.status(400).send({ "error": "Name is mandatory" });
            return;
        }

        if (mobile == null || mobile == undefined) {
            res.status(400).send({ "error": "Mobile number is mandatory" });
            return;
        }

        if (address == null || address == undefined) {
            res.status(400).send({ "error": "Address is mandatory" });
            return;
        }

        if (delivery_date == null || delivery_date == undefined) {
            res.status(400).send({ "error": "Delivery date is mandatory" });
            return;
        }

        if (zip == null || zip == undefined) {
            res.status(400).send({ "error": "Zip is mandatory"});
            return;
        }

        if (country == null || country == undefined) {
            res.status(400).send({"error" : "Country is mandatory"});
            return;
        }
        /*
         * Check if we have reached daily api usage limit
         */
        if (token != account_id) {
            if (daily_api_usage_limit_reached(token)) {
                res.status(400).send({ "error": "You have reached daily limit for the api. " +
                    "Api usage count for the day is " + API_USAGE_LIMIT_PER_DAY });
                return;
            }

            incrementApiCount(token);
        }

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
            createdat: ts,
            zip: zip,
            items: itms,
            country: country,
            cod: cod_internal,
            createdby : createdby,
            deliverycharge : deliverycharge,
            pickuplocation : pickuplocation
        };


        console.log(order_details);
        /*
         * Get the firebase ref and update
         */
        var order_ref_url = '/accounts/' + account_id + '/unassignorders/' + formatted_date + "/" + order_id;
        var order_ref = firebase_ref.child(order_ref_url);
        order_ref.update(order_details);
        updateLocation(country, zip, order_ref_url, true);

        trackOrder(account_id, formatted_date, order_id, tags, mobile)
    }
    res.status(200).send();
    return;
};


function updateLocation(country, zip, order_ref_url, retry) {
    var options = {
        url: 'http://maps.googleapis.com/maps/api/geocode/json?address=' + zip + ' ' + country + '&sensor=false'
    };

    function callback(error, response, body) {
        if (!error && response.statusCode == 200 && body.toString().indexOf("\"status\" : \"OK\"") >= 0) {
            var json = JSON.parse(body);
            var location = json.results[0].geometry.location;
            console.log(location);
            var location_ref = firebase_ref.child(order_ref_url + "/location");
            location_ref.update(location);
            client.log( { country: country, zip : zip, url : order_ref_url, location : location }, ["location update"]);
            return;
        } else {
            if (retry) {
                updateLocation(country, zip, order_ref_url, false);
                client.log( { country: country, zip : zip, url : order_ref_url }, ["location retry"]);
            } else {
                client.log( { country: country, zip : zip, url : order_ref_url, response : body },
                    ["location retry failed"]);
            }
        }
    }
    request(options, callback);
}

function trackOrder(accountid, date, orderid, tags, mobilenumber) {
    var trackyourorder = utils.getAccountTrackyourorder(accountid);

    if(trackyourorder == null) {
        firebase_ref.child('/accounts/' + accountid+'/settings/trackyourorder')
        .once("value", function(snapshot) {
            var istrackenabled = (snapshot.val() != null && snapshot.val() != undefined && snapshot.val() != "" ) ? snapshot.val().toString() : "false";
            utils.setAccountTrackyourorder(this.accountid, istrackenabled);
            setOrderTrackUrl(istrackenabled, this.accountid, this.date, this.orderid, this.tags, this.mobilenumber);
        },{accountid: accountid, date: date, orderid: orderid, tags: tags, mobilenumber : mobilenumber});
    }
    else {
        setOrderTrackUrl(trackyourorder, accountid, date, orderid, tags, mobilenumber);
    }
}

function setOrderTrackUrl(trackyourorder, accountid, date, orderid, tags, mobilenumber) {
    if(trackyourorder == "true") {
        var token = accountid +"_"+orderid;
        firebase_ref.child('/trackurl/'+date+"/"+token)
        .once("value", function(snapshot) {
            if(snapshot.val() == null || snapshot.val() == undefined) {
                var trackurl_ref = firebase_ref.child('/trackurl/'+this.date + "/"+ this.token);
                trackurl_ref.update({status : "Placed", history: {placed: new Date().getTime()}});
                //sendOrderTrackSMS(this.accountid, this.orderid, this.token, this.mobilenumber);
            }
            else if(tags.indexOf('RWD') >=0 && snapshot.val().status == "Placed") {
                var trackurl_ref = firebase_ref.child('/trackurl/'+this.date + "/"+ this.token+"/status");
                trackurl_ref.set("Reviewed");
                trackurl_ref = firebase_ref.child('/trackurl/'+this.date + "/"+ this.token+"/history/reviewed");
                trackurl_ref.set(new Date().getTime());
            }
            else if(tags.indexOf('PPD') >=0 && (snapshot.val().status == "Placed" || snapshot.val().status == "Reviewed")) {
                var trackurl_ref = firebase_ref.child('/trackurl/'+this.date + "/"+ this.token+"/status");
                trackurl_ref.set("Prepared");
                trackurl_ref = firebase_ref.child('/trackurl/'+this.date + "/"+ this.token+"/history/prepared");
                trackurl_ref.set(new Date().getTime());
            }
        }, {accountid: accountid, token : token, date : date, orderid: orderid, mobilenumber : mobilenumber});
    }
}

function sendOrderTrackSMS(accountid, orderid, token, mobilenumber) {
    Bitly.shorten({longUrl:"http://trackorder.azurewebsites.net/?token="+token}, function(err, results) {
        var resultobj = JSON.parse(results);
        if(resultobj.status_code == 200) {
            var url = resultobj.data.url;
            var text = "Please track your order #" + orderid + " here - " + url;

            var msg91obj = utils.getAccountMSG91(accountid);
            if(msg91obj != null && msg91obj != undefined) {
                sendSMS(msg91obj, mobilenumber, text)
            }
            else {
                firebase_ref.child('/accounts/'+accountid+"/settings/nickname")
                .once("value", function(snapshot) {
                    var msg91obj = require("msg91")(MSG91_API, snapshot.val().toString(), MSG91_ROUTE_NO);
                    utils.setAccountMSG91(accountid, msg91obj);
                    sendSMS(msg91obj, this.mobilenumber, this.text);
                }, {mobilenumber : mobilenumber, text : text});
            }
        }
        else {
            console.log(results, err);
        }
    });
}

function sendSMS(msg91obj, mob, text) {
    client.log({mob : mob, text : text}, ['MSG91', 'debug_info']);
    var mobNo = parseMobNumber(mob);
    if (mobNo == null) {
        client.log({mobile : mob, message : text}, ['MSG91']);
        sendEmail("kousik@logbase.io", null, "Stick Order Placed - SMS failed", text + " " + mob);
        return;
    }
    msg91obj.send(mobNo, text, function(err, response){
        console.log(err);
        console.log(response);
    });
}

/*
 * Send notification mails
 */
function sendEmail(emailId, order, subject, text) {
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

function parseMobNumber(mob) {
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
}

module.exports = router;
