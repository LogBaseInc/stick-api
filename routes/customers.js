var express = require('express');
var router = express.Router();
var AWS = require('aws-sdk');
var utils = require('./utils.js');
AWS.config.update({region: 'us-east-1'});
var DYNAMODB_CUSTOMER_TABLE_NAME = "StickCustomers";
var dynamodb = new AWS.DynamoDB({apiVersion: 'latest'});

var loggly = require('loggly');
var loggly_token = process.env.LOGGLY_TOKEN || "7b9f6d3d-01ed-45c5-b4ed-e8d627764998";
var loggly_sub_domain = process.env.LOGGLY_SUB_DOMAIN || "kousik"

var client = loggly.createClient({
    token: loggly_token,
    subdomain: loggly_sub_domain,
    tags: ["stick", "customers"],
    json:true
});

router.get('/mobilenos/:accountid/', function(req, res){
    var account_id = req.params.accountid || " ";
    var resp_data = [];
    var prev_result = null;

    if (utils.validateAccountIds(account_id) != true) {
        res.status(400).send("Invalid account id");
        return;
    }

    fetchMobileNumbers(account_id, null, resp_data, res);
});


router.get('/:accountid/:mobile', function(req, res){
    var accountId = req.params.accountid || " ";
    var mobile = parseInt(req.params.mobile);
    var result = [];

    if (utils.validateAccountIds(accountId) != true) {
        res.status(400).send("Invalid account id");
        return;
    }

    if (mobile== null || mobile == undefined || parseInt(mobile) == null) {
        res.status(400).send("Invalid mobile number");
        return;
    }

    var params = {
        Key: {
            accountId: {
                S: accountId
            },
            mobile: {
                N: mobile.toString()
            }
        },
        TableName: DYNAMODB_CUSTOMER_TABLE_NAME, /* required */
        AttributesToGet: [
            'name', 'address', 'zip'
        ]
    };

    dynamodb.getItem(params, function(err, data) {
        if (err) {
            client.log(err);
            res.status(400).send(err.message);
            return;
        }
        else {
            result.push(utils.parseDDBJson(data.Item));
            res.status(200).send(result);
            return
        }
    });
});

//APIs
router.post('/:accountid', function (req, res) {
    var account_id = req.params.accountid || " ";
    var name = req.body.name;
    var address = req.body.address;
    var zip = req.body.zip;
    var mobile = req.body.mobile_number;

    /*
     * Parse date and delivery slots
     */
    if (account_id == null || account_id == undefined) {
        res.status(400).send("Invalid account id");
        return;
    }

    /*
     * Validate mandatory fields
     */
    if (name == null || name == undefined) {
        res.status(400).send("Name is mandatory");
        return;
    }

    if (mobile == null || mobile == undefined) {
        res.status(400).send("Mobile number is mandatory");
        return;
    }

    if (address == null || address == undefined) {
        res.status(400).send("Address is mandatory");
        return;
    }

    if (zip == null || zip == undefined) {
        zip = "";
    }

    /*
     * Fill in the customer details to update
     */
    var customer_details = {
        address: { 'S' : address },
        mobile: { 'N' : mobile },
        name: { 'S' : name },
        zip: { 'N' : zip },
        accountId: { 'S' : account_id }
    }

    var params = {
        Item: customer_details,
        TableName: DYNAMODB_CUSTOMER_TABLE_NAME
    };

    dynamodb.putItem(params, function(err, data) {
        if (err) {
            client.log(err, err.stack);
            res.status(400).send(err.message);
        } else {
            res.status(200).send();

        }
    });
});

module.exports = router;


// Functions

function fetchMobileNumbers(accountId, prevResult, resp_data, res) {
    var params = {
        TableName: DYNAMODB_CUSTOMER_TABLE_NAME,
        AttributesToGet: ['mobile', 'name'],
        KeyConditions: {
            'accountId': {
                ComparisonOperator: 'EQ',
                AttributeValueList: [
                    {
                        S: accountId
                    }
                ]
            }
        },
        ScanIndexForward: true,
        Select: 'SPECIFIC_ATTRIBUTES'
    };

    if (prevResult != null && prevResult['LastEvaluatedKey'] != null) {
        params['ExclusiveStartKey'] = prevResult['LastEvaluatedKey'];
    }

    console.log(params);
    dynamodb.query(params, function(err, data) {
        if (err) {
            client.log(err);
            res.status(400).send(err.message);
            return;
        }
        else {
            console.log(data);
            if (data != null && data.Items != null) {
                for (var idx in data.Items) {
                    resp_data.push(utils.parseDDBJson(data.Items[idx]))
                }
            }

            if (data.LastEvaluatedKey == null) {
                res.status(200).send(resp_data);
                return;
            } else {
                fetchMobileNumbers(accountId, data, resp_data, res)
            }
        }
    });
}

